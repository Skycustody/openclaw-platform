import Stripe from 'stripe';
import db from '../lib/db';
import { provisionUser, deprovisionUser } from './provisioning';
import { handlePaymentFailure } from './gracePeriod';
import { addCreditsToKey, RETAIL_MARKUP, resetKeyForBillingCycle } from './nexos';
import { Plan, User, CREDIT_PACKS } from '../types';
import { v4 as uuid } from 'uuid';
import { validateUserId, validateAmounts, verifyPackMath, logCreditAudit } from './creditAudit';
import { grantInitialTokens } from '../routes/auth';

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
 * Create a one-time Stripe Checkout session for credit top-ups.
 * The pack amount ($5/$10/$25/$50) increases the user's OpenRouter spending limit.
 */
export async function createCreditCheckoutSession(
  email: string,
  pack: string,
  userId: string,
  stripeCustomerId?: string,
): Promise<string> {
  const packInfo = CREDIT_PACKS[pack];
  if (!packInfo) throw new Error(`Invalid credit pack: ${pack}. Valid packs: ${Object.keys(CREDIT_PACKS).join(', ')}`);

  const priceId = process.env[packInfo.envKey];
  if (!priceId) {
    throw new Error(
      `Credit pack not configured. Set ${packInfo.envKey} in your .env file with the Stripe price ID.`
    );
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    automatic_tax: { enabled: true },
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

  if (metadata.type === 'credit_topup') {
    await handleCreditPurchase(session);
    return;
  }

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

  console.log(`[stripe] Payment confirmed for user ${userId}, plan=${plan} — granting tokens and provisioning`);

  await grantInitialTokens(userId, plan as Plan);

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleCreditPurchase(session: Stripe.Checkout.Session): Promise<void> {
  const { userId, pack } = session.metadata || {};
  if (!userId || !pack) {
    console.warn('[stripe] Credit webhook missing userId or pack in metadata');
    return;
  }
  if (!UUID_RE.test(userId)) {
    console.error('[stripe] Credit webhook invalid userId format — rejecting');
    return;
  }
  if (session.payment_status !== 'paid') {
    console.warn('[stripe] Credit webhook session not paid — skipping');
    return;
  }

  const packInfo = CREDIT_PACKS[pack];
  if (!packInfo) {
    console.warn(`[stripe] Unknown pack: ${pack}`);
    return;
  }

  const user = await validateUserId(userId);
  if (!user) {
    console.error(`[stripe] Credit webhook: user ${userId} not found — rejecting`);
    return;
  }

  validateAmounts(packInfo.priceUsdCents, packInfo.orBudgetUsd);
  verifyPackMath(pack, packInfo.priceUsdCents, packInfo.orBudgetUsd);

  const stripeCustomerId = session.customer as string;
  if (stripeCustomerId) {
    await db.query(
      'UPDATE users SET stripe_customer_id = $1 WHERE id = $2 AND stripe_customer_id IS NULL',
      [stripeCustomerId, userId]
    );
  }

  const orBudgetIncrease = packInfo.orBudgetUsd;

  // Atomic duplicate guard: ON CONFLICT prevents double-processing from duplicate webhooks
  const insertResult = await db.query(
    `INSERT INTO credit_purchases (user_id, amount_eur_cents, credits_usd, stripe_session_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (stripe_session_id) DO NOTHING`, // column stores USD cents despite legacy name
    [userId, packInfo.priceUsdCents, orBudgetIncrease, session.id]
  );

  if ((insertResult.rowCount ?? 0) === 0) {
    console.log(`[stripe] Duplicate webhook for session ${session.id} — skipping`);
    return;
  }

  try {
    await addCreditsToKey(userId, orBudgetIncrease);
  } catch (creditErr) {
    console.error(`[stripe] addCreditsToKey FAILED for user=${userId} session=${session.id} amount=$${orBudgetIncrease}:`, creditErr);
    // Purchase is recorded but credits weren't added — mark for manual review
    await db.query(
      `UPDATE credit_purchases SET notes = 'CREDIT_ADD_FAILED' WHERE stripe_session_id = $1`,
      [session.id]
    ).catch(() => {});
    throw creditErr;
  }

  await logCreditAudit({
    operation: 'purchase',
    userId,
    amountEurCents: packInfo.priceUsdCents, // field stores USD cents despite legacy name
    creditsUsd: orBudgetIncrease,
    stripeSessionId: session.id,
    metadata: { pack, paymentStatus: session.payment_status },
  });

  console.log(`[stripe] Top-up: user=${userId} pack=${packInfo.label} orBudget=$${orBudgetIncrease}`);
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

  // Only grant billing cycle credits for recurring payments (not initial subscription).
  // Initial payment is handled by handleCheckoutComplete → provisionUser → createOpenRouterKey.
  const billingReason = (invoice as any).billing_reason;
  if (billingReason === 'subscription_create') {
    console.log(`[stripe] Initial invoice for ${user.id} — skipping cycle reset (handled by checkout)`);
    return;
  }

  // Grant one billing cycle's worth of credits by bumping the OpenRouter key limit.
  // With limitReset:'none', credits only increase when we explicitly call this —
  // no payment means no new credits, regardless of calendar month.
  try {
    await resetKeyForBillingCycle(user.id);
    console.log(`[stripe] Billing cycle credits granted for user ${user.id}`);
  } catch (err) {
    console.error(`[stripe] Failed to reset billing cycle credits for ${user.id}:`, err);
  }
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

/**
 * Fetch credit top-up revenue from Stripe (Checkout Sessions with metadata.type=credit_topup).
 * Returns amounts in USD cents. Paginates through all sessions.
 */
export async function fetchCreditRevenueFromStripe(): Promise<{ monthUsdCents: number; totalUsdCents: number }> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let monthUsdCents = 0;
  let totalUsdCents = 0;
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const sessions = await stripe.checkout.sessions.list({
      status: 'complete',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const s of sessions.data) {
      const meta = (s.metadata || {}) as Record<string, string>;
      if (meta.type !== 'credit_topup') continue;

      const amountCents = s.amount_total ?? 0;
      const currency = (s.currency || 'usd').toLowerCase();
      // Stripe amounts are in smallest unit (cents for USD)
      const usdCents = currency === 'usd' ? amountCents : Math.round(amountCents * 0.01); // rough fallback for non-USD
      totalUsdCents += usdCents;

      const created = s.created ? new Date(s.created * 1000) : null;
      if (created && created >= monthStart) {
        monthUsdCents += usdCents;
      }
    }

    hasMore = sessions.has_more && sessions.data.length > 0;
    if (sessions.data.length > 0) {
      startingAfter = sessions.data[sessions.data.length - 1].id;
    }
  }

  return { monthUsdCents, totalUsdCents };
}

export { stripe };
