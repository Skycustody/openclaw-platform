import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import db from '../lib/db';

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

// Get activity feed
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const filter = req.query.filter as string;

    let whereClause = 'WHERE user_id = $1';
    const params: any[] = [req.userId];

    if (filter && filter !== 'all') {
      whereClause += ` AND type = $2`;
      params.push(filter);
    }

    const activities = await db.getMany(
      `SELECT * FROM activity_log ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const countResult = await db.getOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM activity_log ${whereClause}`,
      params
    );

    res.json({
      activities,
      total: parseInt(countResult?.count || '0'),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
