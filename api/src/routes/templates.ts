/**
 * Templates — agent setup presets built around OpenClaw.
 *
 * Install: writes SOUL.md personality, enables tools/skills, sets up cron jobs.
 * Share: captures the user's current OpenClaw config into a shareable template.
 */
import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import db from '../lib/db';
import {
  getUserContainer, readContainerConfig, writeContainerConfig, restartContainer,
} from '../services/containerConfig';
import { sshExec } from '../services/ssh';

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

const INSTANCE_DIR = '/opt/openclaw/instances';

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

    const ALLOWED_SORTS: Record<string, string> = {
      rating: 'rating DESC',
      newest: 'created_at DESC',
      popular: 'install_count DESC',
    };
    const orderBy = ALLOWED_SORTS[sort as string] || 'install_count DESC';
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

/**
 * Install template — applies the full OpenClaw config from the template.
 * Writes: SOUL.md, tools, skills, cron jobs, memories, protection settings.
 */
router.post('/:id/install', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const template = await db.getOne<any>(
      'SELECT * FROM agent_templates WHERE id = $1 AND published = true',
      [req.params.id]
    );
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const config = template.config;

    // 1. Apply SOUL.md personality via agents API
    if (config.personality) {
      const primaryAgent = await db.getOne<any>(
        'SELECT id FROM agents WHERE user_id = $1 AND is_primary = true',
        [req.userId]
      );
      if (primaryAgent) {
        await db.query(
          `UPDATE agents SET
            name = COALESCE($1, name),
            purpose = COALESCE($2, purpose),
            instructions = COALESCE($3, instructions)
           WHERE id = $4`,
          [config.personality.name, config.personality.purpose, config.personality.instructions, primaryAgent.id]
        );

        // Write SOUL.md to container
        try {
          const { serverIp } = await getUserContainer(req.userId!);
          const soulParts: string[] = [];
          if (config.personality.name) soulParts.push(`# ${config.personality.name}`);
          if (config.personality.purpose) soulParts.push(`\n## Purpose\n${config.personality.purpose}`);
          if (config.personality.instructions) soulParts.push(`\n## Instructions\n${config.personality.instructions}`);

          const soulB64 = Buffer.from(soulParts.join('\n') || '# Agent\n').toString('base64');
          await sshExec(serverIp, `echo '${soulB64}' | base64 -d > ${INSTANCE_DIR}/${req.userId}/SOUL.md`);
        } catch {}
      }
    }

    // 2. Apply tools and skills config to openclaw.json
    try {
      const { serverIp, containerName } = await getUserContainer(req.userId!);
      const containerConfig = await readContainerConfig(serverIp, req.userId!);

      if (config.tools) {
        if (!containerConfig.tools) containerConfig.tools = {};
        for (const [name, val] of Object.entries(config.tools)) {
          containerConfig.tools[name] = val;
        }
      }

      if (config.skills) {
        if (!containerConfig.skills) containerConfig.skills = {};
        if (!containerConfig.skills.entries) containerConfig.skills.entries = {};
        for (const [name, val] of Object.entries(config.skills)) {
          containerConfig.skills.entries[name] = val;
        }
      }

      if (config.protection) {
        containerConfig.protection = { ...containerConfig.protection, ...config.protection };
      }

      await writeContainerConfig(serverIp, req.userId!, containerConfig);
      await restartContainer(serverIp, containerName, 15000);
    } catch {}

    // 3. Apply settings to user_settings
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

    // 4. Create cron jobs
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

    // 5. Add memories
    if (config.memories) {
      const { memorySystem } = await import('../services/memory');
      for (const mem of config.memories) {
        await memorySystem.remember(req.userId!, mem.content, mem.type, mem.importance);
      }
    }

    await db.query(
      'UPDATE agent_templates SET install_count = install_count + 1 WHERE id = $1',
      [req.params.id]
    );

    res.json({ installed: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Share setup — captures the user's current OpenClaw config as a template.
 * Includes: personality (SOUL.md), tools, skills, cron jobs, memories, protection.
 */
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, description, category } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    // Gather current settings
    const [settings, cronJobs, memories] = await Promise.all([
      db.getOne('SELECT agent_name, agent_tone, custom_instructions FROM user_settings WHERE user_id = $1', [req.userId]),
      db.getMany('SELECT name, description, schedule, token_budget FROM cron_jobs WHERE user_id = $1 AND enabled = true', [req.userId]),
      db.getMany('SELECT content, type, importance FROM memories WHERE user_id = $1 ORDER BY importance DESC LIMIT 20', [req.userId]),
    ]);

    // Get primary agent personality
    const primaryAgent = await db.getOne<any>(
      'SELECT name, purpose, instructions FROM agents WHERE user_id = $1 AND is_primary = true',
      [req.userId]
    );

    // Get current openclaw.json tools and skills
    let tools: Record<string, any> = {};
    let skills: Record<string, any> = {};
    let protection: Record<string, any> = {};
    try {
      const { serverIp } = await getUserContainer(req.userId!);
      const containerConfig = await readContainerConfig(serverIp, req.userId!);

      if (containerConfig.tools) {
        for (const [k, v] of Object.entries(containerConfig.tools)) {
          const val = v as any;
          if (val && typeof val === 'object' && val.enabled !== false) {
            tools[k] = { enabled: true };
          }
        }
      }

      if (containerConfig.skills?.entries) {
        for (const [k, v] of Object.entries(containerConfig.skills.entries)) {
          const val = v as any;
          if (val && typeof val === 'object' && val.enabled) {
            skills[k] = { enabled: true };
          }
        }
      }

      if (containerConfig.protection) {
        protection = containerConfig.protection;
      }
    } catch {}

    const config = {
      settings,
      personality: primaryAgent ? {
        name: primaryAgent.name,
        purpose: primaryAgent.purpose,
        instructions: primaryAgent.instructions,
      } : null,
      tools,
      skills,
      protection,
      cronJobs,
      memories,
    };

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
