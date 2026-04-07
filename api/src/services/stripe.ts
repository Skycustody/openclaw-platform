import Stripe from 'stripe';
import db from '../lib/db';
import { provisionUser, deprovisionUser } from './provisioning';
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
      `INSERT INTO users (id, email, plan, status) VALUES ($1, $2, $3, 'pending')`,
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
    automatic_tax: { enabled: true },
    success_url: `${process.env.PLATFORM_URL}/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.PLATFORM_URL}/pricing`,
    metadata: { userId, plan },
  });

  return session.url!;
}

/**
 * Create a Stripe Checkout session for the desktop app subscription.
 * Price: €5/mo + automatic tax (25% VAT). Optional 3-day free trial.
 */
export async function createDesktopCheckoutSession(
  email: string,
  userId: string,
  stripeCustomerId?: string,
): Promise<string> {
  const priceId = process.env.STRIPE_PRICE_DESKTOP;
  if (!priceId) {
    throw new Error('STRIPE_PRICE_DESKTOP not configured. Create a €5/mo recurring price in Stripe and set STRIPE_PRICE_DESKTOP.');
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    automatic_tax: { enabled: true },
    success_url: `${process.env.PLATFORM_URL}/desktop?success=true`,
    cancel_url: `${process.env.PLATFORM_URL}/desktop`,
    metadata: { type: 'desktop', userId },
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

  if (metadata.type === 'desktop') {
    await handleDesktopPurchase(session);
    return;
  }

  const { userId, plan } = metadata;
  if (!userId || !plan) return;

  const stripeCustomerId = session.customer as string;
  await db.query(
    `UPDATE users SET stripe_customer_id = $1, plan = $2, status = 'provisioning', trial_data_retention_until = NULL WHERE id = $3`,
    [stripeCustomerId, plan, userId]
  );

  console.log(`[stripe] Payment confirmed for user ${userId}, plan=${plan} — provisioning`);

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
}

async function handleDesktopPurchase(session: Stripe.Checkout.Session): Promise<void> {
  const { userId } = session.metadata || {};
  if (!userId) {
    console.warn('[stripe] Desktop webhook missing userId in metadata');
    return;
  }

  const stripeCustomerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  if (stripeCustomerId) {
    await db.query(
      'UPDATE desktop_users SET stripe_customer_id = $1 WHERE id = $2 AND stripe_customer_id IS NULL',
      [stripeCustomerId, userId]
    );
  }

  await db.query(
    'UPDATE desktop_users SET desktop_subscription_id = $1, updated_at = NOW() WHERE id = $2',
    [subscriptionId, userId]
  );

  console.log(`[stripe] Desktop subscription activated for user ${userId} (sub=${subscriptionId})`);
}

async function handleSubscriptionCancelled(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string;

  // Check desktop_users first for desktop subscription cancellation
  const desktopUser = await db.getOne<any>(
    'SELECT id, desktop_subscription_id FROM desktop_users WHERE stripe_customer_id = $1',
    [customerId]
  );
  if (desktopUser && desktopUser.desktop_subscription_id === subscription.id) {
    await db.query('UPDATE desktop_users SET desktop_subscription_id = NULL, updated_at = NOW() WHERE id = $1', [desktopUser.id]);
    console.log(`[stripe] Desktop subscription cancelled for desktop_user ${desktopUser.id}`);
    return;
  }

  const user = await db.getOne<User>(
    'SELECT * FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );
  if (!user) return;

  await deprovisionUser(user.id);
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

  const customerId = invoice.customer as string;
  const user = await db.getOne<User>(
    'SELECT * FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );
  if (!user) return;

  // Restore access if user was in a non-active state due to prior payment failure
  if (['grace_period', 'paused', 'cancelled'].includes(user.status)) {
    await db.query(
      `UPDATE users SET status = 'active', grace_period_end = NULL WHERE id = $1`,
      [user.id]
    );
    console.log(`[stripe] Invoice paid — restored user ${user.id} from '${user.status}' to 'active'`);
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;
  const user = await db.getOne<User>(
    'SELECT * FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );
  if (!user) return;

  console.warn(`[stripe] Payment failed for user ${user.id} (${user.email})`);
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
