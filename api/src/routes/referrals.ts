import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import db from '../lib/db';
import { User } from '../types';

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

// Get referral info
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>(
      'SELECT referral_code FROM users WHERE id = $1',
      [req.userId]
    );

    const referrals = await db.getMany(
      `SELECT r.*, u.email, u.plan, u.status as user_status
       FROM referrals r
       JOIN users u ON u.id = r.referred_id
       WHERE r.referrer_id = $1
       ORDER BY r.created_at DESC`,
      [req.userId]
    );

    const stats = await db.getOne<{ total: string; active: string; earnings: string }>(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'active') as active,
         COALESCE(SUM(total_earned), 0) as earnings
       FROM referrals
       WHERE referrer_id = $1`,
      [req.userId]
    );

    const domain = process.env.PLATFORM_URL || 'https://yourdomain.com';

    res.json({
      referralCode: user?.referral_code,
      referralLink: `${domain}/signup?ref=${user?.referral_code}`,
      referrals,
      stats: {
        total: parseInt(stats?.total || '0'),
        active: parseInt(stats?.active || '0'),
        totalEarnings: parseInt(stats?.earnings || '0'),
        monthlyEarnings: parseInt(stats?.active || '0') * 500,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
