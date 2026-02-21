import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import db from '../lib/db';

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

// Search conversations
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const channel = req.query.channel as string;
    const search = req.query.search as string;
    const from = req.query.from as string;
    const to = req.query.to as string;

    const conditions = ['user_id = $1'];
    const params: any[] = [req.userId];
    let idx = 2;

    if (channel) {
      conditions.push(`channel = $${idx++}`);
      params.push(channel);
    }
    if (search) {
      conditions.push(`to_tsvector('english', content) @@ plainto_tsquery($${idx++})`);
      params.push(search);
    }
    if (from) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`created_at <= $${idx++}`);
      params.push(to);
    }

    const where = conditions.join(' AND ');

    const [conversations, countResult] = await Promise.all([
      db.getMany(
        `SELECT * FROM conversations
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset]
      ),
      db.getOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM conversations WHERE ${where}`,
        params
      ),
    ]);

    res.json({
      conversations,
      total: parseInt(countResult?.count || '0'),
    });
  } catch (err) {
    next(err);
  }
});

// Export conversations
router.get('/export', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const format = req.query.format as string || 'json';
    const conversations = await db.getMany(
      `SELECT * FROM conversations WHERE user_id = $1 ORDER BY created_at`,
      [req.userId]
    );

    if (format === 'csv') {
      const csv = [
        'timestamp,channel,role,content,model,tokens',
        ...conversations.map((c: any) =>
          `"${c.created_at}","${c.channel}","${c.role}","${(c.content || '').replace(/"/g, '""')}","${c.model_used || ''}",${c.tokens_used || 0}`
        ),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=conversations.csv');
      res.send(csv);
    } else {
      res.json({ conversations });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
