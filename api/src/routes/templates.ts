import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import db from '../lib/db';

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

// Browse templates
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { category, search, sort } = req.query;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const conditions = ['published = true'];
    const params: any[] = [];
    let idx = 1;

    if (category) {
      conditions.push(`category = $${idx++}`);
      params.push(category);
    }
    if (search) {
      conditions.push(`(name ILIKE $${idx} OR description ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const orderBy = sort === 'rating' ? 'rating DESC' : sort === 'newest' ? 'created_at DESC' : 'install_count DESC';
    const where = conditions.join(' AND ');

    const templates = await db.getMany(
      `SELECT t.*, u.email as creator_email
       FROM agent_templates t
       LEFT JOIN users u ON u.id = t.creator_id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    res.json({ templates });
  } catch (err) {
    next(err);
  }
});

// Get single template
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const template = await db.getOne(
      `SELECT t.*, u.email as creator_email
       FROM agent_templates t
       LEFT JOIN users u ON u.id = t.creator_id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json({ template });
  } catch (err) {
    next(err);
  }
});

// Install template
router.post('/:id/install', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const template = await db.getOne<any>(
      'SELECT * FROM agent_templates WHERE id = $1 AND published = true',
      [req.params.id]
    );
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const config = template.config;

    // Apply settings
    if (config.settings) {
      await db.query(
        `UPDATE user_settings
         SET agent_name = COALESCE($1, agent_name),
             agent_tone = COALESCE($2, agent_tone),
             custom_instructions = COALESCE($3, custom_instructions)
         WHERE user_id = $4`,
        [config.settings.agent_name, config.settings.agent_tone, config.settings.custom_instructions, req.userId]
      );
    }

    // Create cron jobs (batch insert)
    if (config.cronJobs && config.cronJobs.length > 0) {
      const values: any[] = [];
      const placeholders: string[] = [];
      config.cronJobs.forEach((job: any, i: number) => {
        const offset = i * 5;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
        values.push(req.userId, job.name, job.description, job.schedule, job.token_budget || 3000);
      });
      await db.query(
        `INSERT INTO cron_jobs (user_id, name, description, schedule, token_budget) VALUES ${placeholders.join(', ')}`,
        values
      );
    }

    // Add memories
    if (config.memories) {
      const { memorySystem } = await import('../services/memory');
      for (const mem of config.memories) {
        await memorySystem.remember(req.userId!, mem.content, mem.type, mem.importance);
      }
    }

    // Increment install count
    await db.query(
      'UPDATE agent_templates SET install_count = install_count + 1 WHERE id = $1',
      [req.params.id]
    );

    res.json({ installed: true });
  } catch (err) {
    next(err);
  }
});

// Share your setup as template
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, description, category } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    // Gather current user's config
    const [settings, cronJobs, memories] = await Promise.all([
      db.getOne('SELECT agent_name, agent_tone, custom_instructions FROM user_settings WHERE user_id = $1', [req.userId]),
      db.getMany('SELECT name, description, schedule, token_budget FROM cron_jobs WHERE user_id = $1 AND enabled = true', [req.userId]),
      db.getMany('SELECT content, type, importance FROM memories WHERE user_id = $1 ORDER BY importance DESC LIMIT 20', [req.userId]),
    ]);

    const config = { settings, cronJobs, memories };

    const template = await db.getOne(
      `INSERT INTO agent_templates (creator_id, name, description, category, config, published)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [req.userId, name, description, category || 'general', JSON.stringify(config)]
    );

    res.json({ template });
  } catch (err) {
    next(err);
  }
});

// Rate template
router.post('/:id/rate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { rating } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be 1-5' });
    }

    await db.query(
      `UPDATE agent_templates
       SET rating = (rating * rating_count + $1) / (rating_count + 1),
           rating_count = rating_count + 1
       WHERE id = $2`,
      [rating, req.params.id]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
