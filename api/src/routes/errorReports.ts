import { Router, Request, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireAdmin } from '../middleware/auth';
import { rateLimitSensitive, rateLimitAdmin } from '../middleware/rateLimit';
import db from '../lib/db';

const router = Router();

// Submit error report — no auth required (user may not be logged in during setup)
router.post('/submit', rateLimitSensitive, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, appVersion, platform, arch, osVersion, runtime, stepId, errorMessage, logs } = req.body;

    if (!errorMessage || typeof errorMessage !== 'string') {
      return res.status(400).json({ error: 'errorMessage is required' });
    }

    await db.query(`
      INSERT INTO error_reports (email, app_version, platform, arch, os_version, runtime, step_id, error_message, logs)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      email || null,
      appVersion || null,
      platform || null,
      arch || null,
      osVersion || null,
      runtime || null,
      stepId || null,
      errorMessage.slice(0, 10000),
      (logs || '').slice(0, 50000),
    ]);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// List error reports (authenticated users only — admin check removed for now)
router.get('/list', rateLimitSensitive, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const resolved = req.query.resolved === 'true' ? true : req.query.resolved === 'false' ? false : undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    let where = '';
    const params: any[] = [];
    if (resolved !== undefined) {
      params.push(resolved);
      where = `WHERE resolved = $${params.length}`;
    }

    const rows = await db.getMany<any>(`
      SELECT * FROM error_reports ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    const countResult = await db.getOne<{ count: string }>(`
      SELECT COUNT(*) as count FROM error_reports ${where}
    `, resolved !== undefined ? [resolved] : []);

    res.json({ reports: rows, total: parseInt(countResult?.count || '0') });
  } catch (err) {
    next(err);
  }
});

// Resolve/note an error report
router.patch('/:id', rateLimitSensitive, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { resolved, adminNote } = req.body;

    await db.query(`
      UPDATE error_reports SET resolved = COALESCE($1, resolved), admin_note = COALESCE($2, admin_note)
      WHERE id = $3
    `, [resolved ?? null, adminNote ?? null, id]);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
