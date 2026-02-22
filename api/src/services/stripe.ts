import Stripe from 'stripe';
import db from '../lib/db';
import { provisionUser, deprovisionUser } from './provisioning';
import { handlePaymentFailure } from './gracePeriod';
import { addCreditsToKey, updateKeyLimit, RETAIL_MARKUP, USD_TO_EUR_CENTS } from './nexos';
import { Plan, User, CREDIT_PACKS } from '../types';
import { v4 as uuid } from 'uuid';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia' as any,
});

const PLAN_PRICE_MAP: Record<string, Plan> = {};

function initPriceMap() {
  if (process.env.STRIPE_PRICE_STARTER) PLAN_PRICE_MAP[process.env.STRIPE_PRICE_STARTER] = 'starter';
  if (process.env.STRIPE_PRICE_PRO) PLAN_PRICE_MAP[process.env.STRIPE_PRICE_PRO] = 'pro';
  if (process.env.STRIPE_PRICE_BUSINESS) PLAN_PRICE_MAP[process.env.STRIPE_PRICE_BUSINESS] = 'business';
}

export async function createCheckoutSession(
  email: string,
  plan: Plan,
  referralCode?: string,
  existingUserId?: string
): Promise<string> {
  initPriceMap();

  const priceIds: Record<Plan, string> = {
    starter: process.env.STRIPE_PRICE_STARTER!,
    pro: process.env.STRIPE_PRICE_PRO!,
    business: process.env.STRIPE_PRICE_BUSINESS!,
  };

  let userId: string;
  if (existingUserId) {
    userId = existingUserId;
  } else {
    userId = uuid();
    await db.query(
      `INSERT INTO users (id, email, plan, status) VALUES ($1, $2, $3, 'provisioning')`,
      [userId, email, plan]
    );
  }

  // Handle referral discount
  const discounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];
  if (referralCode) {
    const referrer = await db.getOne<User>(
      'SELECT id FROM users WHERE referral_code = $1',
      [referralCode]
    );
    if (referrer) {
      await db.query('UPDATE users SET referred_by = $1 WHERE id = $2', [referrer.id, userId]);
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{ price: priceIds[plan], quantity: 1 }],
    discounts,
    success_url: `${process.env.PLATFORM_URL}/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.PLATFORM_URL}/pricing`,
    metadata: { userId, plan },
  });

  return session.url!;
}

/**
 * Create a one-time Stripe Checkout session for credit top-ups.
 * The pack amount (€5/€10/€20) increases the user's OpenRouter spending limit.
 */
export async function createCreditCheckoutSession(
  email: string,
  pack: string,
  userId: string,
  stripeCustomerId?: string,
): Promise<string> {
  const packInfo = CREDIT_PACKS[pack];
  if (!packInfo) throw new Error(`Invalid credit pack: ${pack}`);

  const priceIds: Record<string, string | undefined> = {
    '5': process.env.STRIPE_PRICE_CREDITS_5,
    '10': process.env.STRIPE_PRICE_CREDITS_10,
    '20': process.env.STRIPE_PRICE_CREDITS_20,
  };

  const priceId = priceIds[pack];
  if (!priceId) throw new Error(`Stripe price not configured for credit pack ${pack}`);

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.PLATFORM_URL}/dashboard/tokens?credits=success`,
    cancel_url: `${process.env.PLATFORM_URL}/dashboard/tokens`,
    metadata: { type: 'credit_topup', userId, pack },
  };

  if (stripeCustomerId) {
    sessionParams.customer = stripeCustomerId;
  } else {
    sessionParams.customer_email = email;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  return session.url!;
}

export async function handleWebhook(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionCancelled(event.data.object as Stripe.Subscription);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;
    case 'invoice.payment_succeeded':
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;
  }
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
  const metadata = session.metadata || {};

  if (metadata.type === 'credit_topup') {
    await handleCreditPurchase(session);
    return;
  }

  const { userId, plan } = metadata;
  if (!userId || !plan) return;

  const stripeCustomerId = session.customer as string;
  await db.query(
    'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
    [stripeCustomerId, userId]
  );

  try {
    await provisionUser({
      userId,
      email: session.customer_email!,
      plan: plan as Plan,
      stripeCustomerId,
    });
  } catch (err) {
    console.error('Provisioning failed after payment:', err);
  }

  const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
  if (user?.referred_by) {
    await db.query(
      `INSERT INTO referrals (referrer_id, referred_id) VALUES ($1, $2)`,
      [user.referred_by, userId]
    );
  }
}

async function handleCreditPurchase(session: Stripe.Checkout.Session): Promise<void> {
  const { userId, pack } = session.metadata || {};
  if (!userId || !pack) return;

  const packInfo = CREDIT_PACKS[pack];
  if (!packInfo) return;

  // EUR cents → wholesale USD: divide by RETAIL_MARKUP, convert cents to dollars, EUR→USD
  const creditsUsd = Math.round((packInfo.priceEurCents / RETAIL_MARKUP / USD_TO_EUR_CENTS) * 100) / 100;

  await db.query(
    `INSERT INTO credit_purchases (user_id, amount_eur_cents, credits_usd, stripe_session_id)
     VALUES ($1, $2, $3, $4)`,
    [userId, packInfo.priceEurCents, creditsUsd, session.id]
  );

  await addCreditsToKey(userId, creditsUsd);

  console.log(`[stripe] Credit top-up: user=${userId} pack=€${pack} credits=$${creditsUsd}`);
}

async function handleSubscriptionCancelled(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string;
  const user = await db.getOne<User>(
    'SELECT * FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );
  if (!user) return;

  await deprovisionUser(user.id);

  await db.query(
    `UPDATE referrals SET status = 'inactive' WHERE referred_id = $1`,
    [user.id]
  );
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  initPriceMap();
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price?.id;
  const newPlan = priceId ? PLAN_PRICE_MAP[priceId] : null;

  if (newPlan) {
    await db.query(
      'UPDATE users SET plan = $1 WHERE stripe_customer_id = $2',
      [newPlan, customerId]
    );
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.subscription) return;

  // Subscription renewal: reset add-on credits for the new billing period
  const customerId = invoice.customer as string;
  const user = await db.getOne<{ id: string; plan: string; api_budget_addon_usd: number }>(
    'SELECT id, plan, api_budget_addon_usd FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );
  if (!user || user.api_budget_addon_usd <= 0) return;

  await db.query('UPDATE users SET api_budget_addon_usd = 0 WHERE id = $1', [user.id]);
  await updateKeyLimit(user.id, (user.plan || 'starter') as Plan, 0).catch(() => {});
  console.log(`[stripe] Reset add-on credits for ${user.id} on subscription renewal`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;
  const user = await db.getOne<User>(
    'SELECT * FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );
  if (!user) return;

  console.warn(`Payment failed for user ${user.id} (${user.email})`);
  // Start grace period: user stays active for a few days, then paused → cancelled
  await handlePaymentFailure(user.id);
}

export async function getCustomerPortalUrl(stripeCustomerId: string): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${process.env.PLATFORM_URL}/dashboard/billing`,
  });
  return session.url;
}

export async function getInvoices(stripeCustomerId: string): Promise<any[]> {
  const invoices = await stripe.invoices.list({
    customer: stripeCustomerId,
    limit: 24,
  });
  return invoices.data.map((inv) => ({
    id: inv.id,
    amount: inv.amount_paid,
    currency: inv.currency,
    status: inv.status,
    date: new Date(inv.created * 1000),
    pdf: inv.invoice_pdf,
  }));
}

export { stripe };
