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
  details?: any;
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

function parseDetails(raw: any): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const typeFilter = req.query.filter as string;
    const statusFilter = req.query.status as string;

    let whereClause = 'WHERE user_id = $1';
    const params: any[] = [req.userId];
    let idx = 2;

    if (typeFilter && typeFilter !== 'all') {
      const mappedTypes = Object.entries(TYPE_MAP)
        .filter(([, v]) => v === typeFilter)
        .map(([k]) => k);
      if (mappedTypes.length > 0) {
        whereClause += ` AND type = ANY($${idx})`;
        params.push(mappedTypes);
        idx++;
      }
    }

    if (statusFilter && statusFilter !== 'all') {
      whereClause += ` AND status = $${idx}`;
      params.push(statusFilter);
      idx++;
    }

    const [rows, countResult, typeCounts, statusCounts] = await Promise.all([
      db.getMany<ActivityRow>(
        `SELECT id, type, channel, summary, status, tokens_used, model_used, details, created_at
         FROM activity_log ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
      db.getOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM activity_log ${whereClause}`,
        params
      ),
      db.getMany<{ type: string; count: string }>(
        `SELECT type, COUNT(*) as count FROM activity_log WHERE user_id = $1
         GROUP BY type`,
        [req.userId]
      ),
      db.getMany<{ status: string; count: string }>(
        `SELECT COALESCE(status, 'completed') as status, COUNT(*) as count
         FROM activity_log WHERE user_id = $1
         GROUP BY COALESCE(status, 'completed')`,
        [req.userId]
      ),
    ]);

    const activities = rows.map(row => {
      const details = parseDetails(row.details);
      return {
        id: row.id,
        type: TYPE_MAP[row.type] || 'task',
        summary: row.summary || 'Agent activity',
        created_at: row.created_at,
        status: row.status || 'completed',
        channel: row.channel || undefined,
        model_used: row.model_used || undefined,
        tokens_used: row.tokens_used || undefined,
        userRequest: details?.userRequest || undefined,
        taskSummary: details?.taskSummary || undefined,
        lastAction: details?.lastAction || undefined,
        stepCount: details?.stepCount || undefined,
        tools: details?.tools || undefined,
      };
    });

    // Aggregate counts using TYPE_MAP for the frontend tabs
    const typeCountMap: Record<string, number> = { all: 0 };
    for (const { type, count } of typeCounts) {
      const mapped = TYPE_MAP[type] || 'task';
      typeCountMap[mapped] = (typeCountMap[mapped] || 0) + parseInt(count);
      typeCountMap.all += parseInt(count);
    }

    const statusCountMap: Record<string, number> = { all: typeCountMap.all };
    for (const { status, count } of statusCounts) {
      statusCountMap[status] = parseInt(count);
    }

    res.json({
      activities,
      total: parseInt(countResult?.count || '0'),
      counts: {
        byType: typeCountMap,
        byStatus: statusCountMap,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
