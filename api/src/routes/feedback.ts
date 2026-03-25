import { Router, Request, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireAdmin } from '../middleware/auth';
import { rateLimitSensitive, rateLimitAdmin } from '../middleware/rateLimit';
import db from '../lib/db';

const router = Router();

router.post('/submit', rateLimitSensitive, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, rating, easeOfSetup, mostUseful, biggestPain, recommend, improvements, comments } = req.body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating (1-5) required' });
    }

    await db.query(`
      INSERT INTO feedback (email, rating, ease_of_setup, most_useful, biggest_pain, recommend, improvements, comments)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      email.trim().toLowerCase(),
      rating,
      easeOfSetup || null,
      mostUseful || null,
      biggestPain || null,
      recommend || null,
      improvements || null,
      comments || null,
    ]);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/list', rateLimitAdmin, authenticate, requireAdmin, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await db.getMany<any>(`
      SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100
    `);
    res.json({ feedback: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
