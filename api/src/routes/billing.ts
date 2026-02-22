import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import db from '../lib/db';
import { createCheckoutSession, createCreditCheckoutSession, getCustomerPortalUrl, getInvoices } from '../services/stripe';
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

    res.json({
      plan: user.plan,
      status: user.status,
      stripeCustomerId: user.stripe_customer_id,
      creditSpendThisMonth: parseInt(creditSpend?.total || '0'),
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
router.post('/portal', async (req: AuthRequest, res: Response, next: NextFunction) => {
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
router.post('/checkout', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { plan, referralCode } = req.body as { plan?: Plan; referralCode?: string };

    if (!plan) throw new BadRequestError('Plan is required');
    if (!['starter', 'pro', 'business'].includes(plan)) throw new BadRequestError('Invalid plan');

    const user = await db.getOne<User>('SELECT id, email FROM users WHERE id = $1', [req.userId]);
    if (!user) throw new BadRequestError('User not found');

    await db.query(`UPDATE users SET plan = $1, status = 'provisioning' WHERE id = $2`, [plan, req.userId]);

    const checkoutUrl = await createCheckoutSession(user.email, plan, referralCode, req.userId);
    res.json({ checkoutUrl });
  } catch (err) {
    next(err);
  }
});

// Buy a one-time credit top-up pack
router.post('/buy-credits', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { pack } = req.body as { pack?: string };
    if (!pack || !CREDIT_PACKS[pack]) {
      throw new BadRequestError(`Invalid token pack. Choose one of: ${Object.keys(CREDIT_PACKS).join(', ')}`);
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

export default router;
