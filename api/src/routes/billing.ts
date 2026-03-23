import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthRequest, authenticate } from '../middleware/auth';
import { rateLimitSensitive } from '../middleware/rateLimit';
import db from '../lib/db';
import { createCheckoutSession, createCreditCheckoutSession, createDesktopCheckoutSession, getCustomerPortalUrl, getInvoices, stripe } from '../services/stripe';
import { BadRequestError } from '../lib/errors';
import { Plan, User, CREDIT_PACKS } from '../types';

const router = Router();
router.use(authenticate);

// Get billing overview
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const creditSpend = await db.getOne<{ total: string }>(
      `SELECT COALESCE(SUM(amount_eur_cents), 0) as total
       FROM credit_purchases
       WHERE user_id = $1
       AND created_at > DATE_TRUNC('month', NOW())`,
      [req.userId]
    );

    const trialEndsAt = user.trial_ends_at ?? null;
    const trialDataRetentionUntil = user.trial_data_retention_until ?? null;
    const isInTrial = trialEndsAt && new Date(trialEndsAt) > new Date();

    const desktopSubId = (user as any).desktop_subscription_id;
    const desktopTrialEndsAt = (user as any).desktop_trial_ends_at;
    const desktopTrialActive = desktopTrialEndsAt && new Date(desktopTrialEndsAt) > new Date();
    const hasDesktop = !!desktopSubId || !!desktopTrialActive;

    res.json({
      email: user.email,
      plan: user.plan,
      status: user.status,
      stripeCustomerId: user.stripe_customer_id,
      hasDesktopPaid: !!desktopSubId,
      creditSpendThisMonth: parseInt(creditSpend?.total || '0'),
      trialEndsAt: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
      trialDataRetentionUntil: trialDataRetentionUntil ? new Date(trialDataRetentionUntil).toISOString() : null,
      isInTrial,
      desktopSubscription: hasDesktop,
      desktopTrialEndsAt: desktopTrialEndsAt ? new Date(desktopTrialEndsAt).toISOString() : null,
      desktopTrialActive: !!desktopTrialActive,
    });
  } catch (err) {
    next(err);
  }
});

// Get invoices
router.get('/invoices', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>('SELECT stripe_customer_id FROM users WHERE id = $1', [req.userId]);
    if (!user?.stripe_customer_id) return res.json({ invoices: [] });

    const invoices = await getInvoices(user.stripe_customer_id);
    res.json({ invoices });
  } catch (err) {
    next(err);
  }
});

// Get Stripe portal URL (manage subscription)
router.post('/portal', rateLimitSensitive, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>('SELECT stripe_customer_id FROM users WHERE id = $1', [req.userId]);
    if (!user?.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found' });
    }

    const url = await getCustomerPortalUrl(user.stripe_customer_id);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// Start subscription checkout for current user
router.post('/checkout', rateLimitSensitive, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { plan, referralCode } = req.body as { plan?: Plan; referralCode?: string };

    if (!plan) throw new BadRequestError('Plan is required');
    if (!['starter', 'pro', 'business'].includes(plan)) throw new BadRequestError('Invalid plan');

    const user = await db.getOne<User>('SELECT id, email FROM users WHERE id = $1', [req.userId]);
    if (!user) throw new BadRequestError('User not found');

    const checkoutUrl = await createCheckoutSession(user.email, plan, referralCode, req.userId);
    res.json({ checkoutUrl });
  } catch (err) {
    next(err);
  }
});

// Buy a one-time credit top-up pack
router.post('/buy-credits', rateLimitSensitive, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { pack } = req.body as { pack?: string };
    if (!pack || !CREDIT_PACKS[pack]) {
      throw new BadRequestError(`Invalid credit pack. Choose one of: ${Object.keys(CREDIT_PACKS).join(', ')}`);
    }

    const user = await db.getOne<User>('SELECT id, email, stripe_customer_id FROM users WHERE id = $1', [req.userId]);
    if (!user) throw new BadRequestError('User not found');

    const checkoutUrl = await createCreditCheckoutSession(
      user.email,
      pack,
      req.userId!,
      user.stripe_customer_id || undefined,
    );
    res.json({ checkoutUrl });
  } catch (err) {
    next(err);
  }
});

// Start desktop 3-day free trial (no card required)
router.post('/desktop-trial', rateLimitSensitive, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<any>('SELECT id, desktop_subscription_id, desktop_trial_ends_at FROM users WHERE id = $1', [req.userId]);
    if (!user) throw new BadRequestError('User not found');

    if (user.desktop_subscription_id) {
      throw new BadRequestError('You already have an active desktop subscription');
    }
    if (user.desktop_trial_ends_at) {
      throw new BadRequestError('You have already used your free trial');
    }

    const trialEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now
    await db.query('UPDATE users SET desktop_trial_ends_at = $1 WHERE id = $2', [trialEnd.toISOString(), req.userId]);

    console.log(`[billing] Desktop trial started for user ${req.userId}, ends ${trialEnd.toISOString()}`);
    res.json({ ok: true, trialEndsAt: trialEnd.toISOString() });
  } catch (err) {
    next(err);
  }
});

// Start desktop app subscription checkout (paid, no trial)
router.post('/desktop-checkout', rateLimitSensitive, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>('SELECT id, email, stripe_customer_id FROM users WHERE id = $1', [req.userId]);
    if (!user) throw new BadRequestError('User not found');

    const checkoutUrl = await createDesktopCheckoutSession(
      user.email,
      req.userId!,
      user.stripe_customer_id || undefined,
    );
    res.json({ checkoutUrl });
  } catch (err) {
    next(err);
  }
});

// Cancel subscription at end of billing period
router.post('/cancel', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>('SELECT stripe_customer_id FROM users WHERE id = $1', [req.userId]);
    if (!user?.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found' });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripe_customer_id,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    await stripe.subscriptions.update(subscriptions.data[0].id, {
      cancel_at_period_end: true,
    });

    console.log(`[billing] User ${req.userId} cancelled subscription (end of period)`);
    res.json({ cancelled: true, endsAt: new Date((subscriptions.data[0].current_period_end) * 1000).toISOString() });
  } catch (err) {
    next(err);
  }
});

// Get credit purchase history for current user
router.get('/credits', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const purchases = await db.getMany<any>(
      `SELECT id, amount_eur_cents, credits_usd, created_at
       FROM credit_purchases WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [req.userId]
    );

    const user = await db.getOne<{ api_budget_addon_usd: number }>(
      'SELECT api_budget_addon_usd FROM users WHERE id = $1',
      [req.userId]
    );

    res.json({
      purchases,
      currentAddonUsd: parseFloat(String(user?.api_budget_addon_usd || 0)),
    });
  } catch (err) {
    next(err);
  }
});

// Issue a gateway auth token for the desktop app.
// Requires an active desktop subscription or trial.
router.post('/desktop-gateway-token', rateLimitSensitive, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<any>(
      'SELECT id, desktop_subscription_id, desktop_trial_ends_at FROM users WHERE id = $1',
      [req.userId],
    );
    if (!user) throw new BadRequestError('User not found');

    const hasPaid = !!user.desktop_subscription_id;
    const trialActive = user.desktop_trial_ends_at && new Date(user.desktop_trial_ends_at) > new Date();
    if (!hasPaid && !trialActive) {
      return res.status(403).json({ error: 'Active desktop subscription or trial required' });
    }

    const gatewayToken = crypto.randomBytes(32).toString('hex');

    console.log(`[billing] Issued desktop gateway token for user ${req.userId}`);
    res.json({ gatewayToken });
  } catch (err) {
    next(err);
  }
});

export default router;
