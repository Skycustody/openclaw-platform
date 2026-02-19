import { Router, Request, Response, NextFunction } from 'express';
import { internalAuth } from '../middleware/auth';
import db from '../lib/db';
import { getServerLoad, checkCapacity } from '../services/serverRegistry';

const router = Router();
router.use(internalAuth);

// Platform overview
router.get('/overview', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [users, servers, revenue, tokens] = await Promise.all([
      db.getOne<any>(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'sleeping') as sleeping,
          COUNT(*) FILTER (WHERE status = 'paused') as paused,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_30d
        FROM users
      `),
      db.getOne<any>(`
        SELECT
          COUNT(*) as total,
          COALESCE(SUM(ram_total), 0) as total_ram,
          COALESCE(SUM(ram_used), 0) as used_ram
        FROM servers WHERE status = 'active'
      `),
      db.getOne<any>(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM token_transactions
        WHERE type = 'purchase' AND created_at > DATE_TRUNC('month', NOW())
      `),
      db.getOne<any>(`
        SELECT
          COALESCE(SUM(ABS(amount)), 0) as total_used,
          COALESCE(SUM(balance), 0) as total_balance
        FROM token_balances
      `),
    ]);

    res.json({ users, servers, revenue, tokens });
  } catch (err) {
    next(err);
  }
});

// Server load
router.get('/servers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const servers = await getServerLoad();
    res.json({ servers });
  } catch (err) {
    next(err);
  }
});

// All users
router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const users = await db.getMany(
      `SELECT u.*, tb.balance as token_balance, s.ip as server_ip
       FROM users u
       LEFT JOIN token_balances tb ON tb.user_id = u.id
       LEFT JOIN servers s ON s.id = u.server_id
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// Trigger capacity check
router.post('/check-capacity', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await checkCapacity();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
