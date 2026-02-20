import Stripe from 'stripe';
import db from '../lib/db';
import { provisionUser, deprovisionUser } from './provisioning';
import { addTokens } from './tokenTracker';
import { handlePaymentFailure } from './gracePeriod';
import { Plan, User } from '../types';
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

export async function createTokenPurchaseSession(
  userId: string,
  packageId: string
): Promise<string> {
  const pkg = await db.getOne<any>(
    'SELECT * FROM token_packages WHERE id = $1 AND active = true',
    [packageId]
  );
  if (!pkg) throw new Error('Package not found');

  const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user) throw new Error('User not found');

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer: user.stripe_customer_id || undefined,
    customer_email: user.stripe_customer_id ? undefined : user.email,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: pkg.price_cents,
          product_data: {
            name: `${pkg.name} — ${(pkg.tokens / 1000).toLocaleString()}K tokens`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${process.env.PLATFORM_URL}/dashboard/tokens?purchased=true`,
    cancel_url: `${process.env.PLATFORM_URL}/dashboard/tokens`,
    metadata: { userId, packageId, tokens: pkg.tokens.toString(), type: 'token_purchase' },
  });

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
  const { userId, plan, type, packageId, tokens } = session.metadata || {};

  // Token purchase
  if (type === 'token_purchase' && userId && tokens) {
    const tokenAmount = parseInt(tokens);
    const pkg = await db.getOne<any>('SELECT * FROM token_packages WHERE id = $1', [packageId]);
    const bonus = pkg ? Math.floor(tokenAmount * (pkg.bonus_percent / 100)) : 0;

    await addTokens(userId, tokenAmount + bonus, 'purchase',
      `Purchased ${(tokenAmount / 1000).toLocaleString()}K tokens${bonus ? ` + ${(bonus / 1000).toLocaleString()}K bonus` : ''}`
    );
    return;
  }

  // Subscription checkout
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

  // Handle referral
  const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
  if (user?.referred_by) {
    await db.query(
      `INSERT INTO referrals (referrer_id, referred_id) VALUES ($1, $2)`,
      [user.referred_by, userId]
    );
  }
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
  // Monthly subscription renewal — grant included tokens
  if (invoice.billing_reason !== 'subscription_cycle') return;

  const customerId = invoice.customer as string;
  const user = await db.getOne<User>(
    'SELECT * FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );
  if (!user) return;

  const { PLAN_LIMITS } = await import('../types');
  const included = PLAN_LIMITS[user.plan].includedTokens;

  await addTokens(user.id, included, 'subscription_grant',
    `Monthly ${user.plan} plan token grant`
  );
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
