import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import db from '../lib/db';
import { createCheckoutSession, getCustomerPortalUrl, getInvoices } from '../services/stripe';
import { BadRequestError } from '../lib/errors';
import { Plan, User } from '../types';

const router = Router();
router.use(authenticate);

// Get billing overview
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const tokenSpend = await db.getOne<{ total: string }>(
      `SELECT COALESCE(SUM(price_cents), 0) as total
       FROM token_transactions t
       JOIN token_packages p ON p.tokens = t.amount
       WHERE t.user_id = $1 AND t.type = 'purchase'
       AND t.created_at > DATE_TRUNC('month', NOW())`,
      [req.userId]
    );

    res.json({
      plan: user.plan,
      status: user.status,
      stripeCustomerId: user.stripe_customer_id,
      tokenSpendThisMonth: parseInt(tokenSpend?.total || '0'),
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

export default router;
