import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthRequest, authenticateDesktop } from '../middleware/auth';
import { rateLimitSensitive } from '../middleware/rateLimit';
import db from '../lib/db';
import { createDesktopCheckoutSession, getCustomerPortalUrl } from '../services/stripe';
import { BadRequestError } from '../lib/errors';

const router = Router();
router.use(authenticateDesktop);

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<any>(
      'SELECT * FROM desktop_users WHERE id = $1',
      [req.userId]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    const trialEndsAt = user.desktop_trial_ends_at ?? null;
    const trialActive = trialEndsAt && new Date(trialEndsAt) > new Date();
    const hasPaid = !!user.desktop_subscription_id;

    res.json({
      email: user.email,
      hasDesktopPaid: hasPaid,
      desktopSubscription: hasPaid || !!trialActive,
      desktopTrialEndsAt: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
      desktopTrialActive: !!trialActive,
      stripeCustomerId: user.stripe_customer_id || null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/trial', rateLimitSensitive, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<any>(
      'SELECT id, desktop_subscription_id, desktop_trial_ends_at FROM desktop_users WHERE id = $1',
      [req.userId]
    );
    if (!user) throw new BadRequestError('User not found');

    if (user.desktop_subscription_id) {
      throw new BadRequestError('You already have an active desktop subscription');
    }
    if (user.desktop_trial_ends_at) {
      throw new BadRequestError('You have already used your free trial');
    }

    const trialEnd = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000); // 1 day
    await db.query(
      'UPDATE desktop_users SET desktop_trial_ends_at = $1, updated_at = NOW() WHERE id = $2',
      [trialEnd.toISOString(), req.userId]
    );

    console.log(`[desktop-billing] Trial started for user ${req.userId}, ends ${trialEnd.toISOString()}`);
    res.json({ ok: true, trialEndsAt: trialEnd.toISOString() });
  } catch (err) {
    next(err);
  }
});

router.post('/checkout', rateLimitSensitive, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<any>(
      'SELECT id, email, stripe_customer_id FROM desktop_users WHERE id = $1',
      [req.userId]
    );
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

router.post('/gateway-token', rateLimitSensitive, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<any>(
      'SELECT id, desktop_subscription_id, desktop_trial_ends_at FROM desktop_users WHERE id = $1',
      [req.userId],
    );
    if (!user) throw new BadRequestError('User not found');

    const hasPaid = !!user.desktop_subscription_id;
    const trialActive = user.desktop_trial_ends_at && new Date(user.desktop_trial_ends_at) > new Date();
    if (!hasPaid && !trialActive) {
      return res.status(403).json({ error: 'Active desktop subscription or trial required' });
    }

    const gatewayToken = crypto.randomBytes(32).toString('hex');
    console.log(`[desktop-billing] Issued gateway token for user ${req.userId}`);
    res.json({ gatewayToken });
  } catch (err) {
    next(err);
  }
});

router.post('/portal', rateLimitSensitive, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<any>(
      'SELECT stripe_customer_id FROM desktop_users WHERE id = $1',
      [req.userId]
    );
    if (!user?.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found' });
    }
    const url = await getCustomerPortalUrl(user.stripe_customer_id);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

export default router;
