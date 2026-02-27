import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import db from '../lib/db';

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

interface ActivityRow {
  id: string;
  type: string;
  channel?: string;
  summary: string;
  status?: string;
  tokens_used?: number;
  model_used?: string;
  details?: string;
  created_at: string;
}

const TYPE_MAP: Record<string, string> = {
  message: 'message',
  task: 'task',
  browsing: 'browsing',
  email: 'email',
  shopping: 'shopping',
  loop_killed: 'task',
  loop_paused: 'task',
};

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

    const rows = await db.getMany<ActivityRow>(
      `SELECT id, type, channel, summary, status, tokens_used, model_used, details, created_at
       FROM activity_log ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const activities = rows.map(row => ({
      id: row.id,
      type: TYPE_MAP[row.type] || 'task',
      summary: row.summary || 'Agent activity',
      timestamp: row.created_at,
      status: row.status || 'completed',
      detail: [
        row.model_used ? `Model: ${row.model_used}` : null,
        row.channel ? `Channel: ${row.channel}` : null,
        row.details || null,
      ].filter(Boolean).join(' · ') || undefined,
    }));

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
