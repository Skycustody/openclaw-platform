import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import db from '../lib/db';
import { User, Server, PLAN_LIMITS, Plan } from '../types';
import { v4 as uuid } from 'uuid';

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

const MAX_AGENTS: Record<string, number> = {
  starter: 1,
  pro: 2,
  business: 4,
};

const AGENT_RAM_MB = 2048;

interface Agent {
  id: string;
  user_id: string;
  name: string;
  purpose: string | null;
  instructions: string | null;
  server_id: string | null;
  container_name: string | null;
  subdomain: string | null;
  status: string;
  ram_mb: number;
  is_primary: boolean;
  created_at: string;
  last_active: string;
}

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const agents = await db.getMany<Agent>(
      'SELECT * FROM agents WHERE user_id = $1 ORDER BY is_primary DESC, created_at ASC',
      [req.userId]
    );

    const plan = user.plan || 'starter';
    const maxAgents = MAX_AGENTS[plan] || 1;
    const planLimits = PLAN_LIMITS[plan as Plan];

    const totalRamAllocated = agents.reduce((sum, a) => sum + a.ram_mb, 0);
    const totalRamAvailable = planLimits.ramMb;

    const activeAgents = agents.filter(a => ['active', 'sleeping'].includes(a.status));
    const idleAgents = agents.filter(a => a.status === 'sleeping');
    const borrowableRam = idleAgents.reduce((sum, a) => sum + Math.floor(a.ram_mb * 0.5), 0);

    res.json({
      agents,
      limits: {
        maxAgents,
        currentCount: agents.length,
        canCreate: agents.length < maxAgents,
        totalRamMb: totalRamAvailable,
        usedRamMb: totalRamAllocated,
        freeRamMb: Math.max(0, totalRamAvailable - totalRamAllocated),
        borrowableRamMb: borrowableRam,
        agentRamMb: AGENT_RAM_MB,
      },
      plan,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const plan = user.plan || 'starter';
    const maxAgents = MAX_AGENTS[plan] || 1;

    const existingCount = await db.getOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM agents WHERE user_id = $1',
      [req.userId]
    );

    const count = parseInt(existingCount?.count || '0');
    if (count >= maxAgents) {
      return res.status(403).json({
        error: `Your ${plan} plan allows up to ${maxAgents} agent${maxAgents > 1 ? 's' : ''}. Upgrade to add more.`,
      });
    }

    const { name, purpose, instructions } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Agent name is required' });
    }

    const agentId = uuid();
    await db.query(
      `INSERT INTO agents (id, user_id, name, purpose, instructions, ram_mb, is_primary, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
      [agentId, req.userId, name.trim(), purpose || null, instructions || null, AGENT_RAM_MB, count === 0]
    );

    const agent = await db.getOne<Agent>('SELECT * FROM agents WHERE id = $1', [agentId]);

    res.json({ agent, message: 'Agent created. It will be provisioned when you start it.' });
  } catch (err) {
    next(err);
  }
});

router.put('/:agentId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { agentId } = req.params;
    const agent = await db.getOne<Agent>(
      'SELECT * FROM agents WHERE id = $1 AND user_id = $2',
      [agentId, req.userId]
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { name, purpose, instructions } = req.body;

    await db.query(
      `UPDATE agents SET
        name = COALESCE($1, name),
        purpose = COALESCE($2, purpose),
        instructions = COALESCE($3, instructions)
       WHERE id = $4`,
      [name || null, purpose || null, instructions || null, agentId]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:agentId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { agentId } = req.params;
    const agent = await db.getOne<Agent>(
      'SELECT * FROM agents WHERE id = $1 AND user_id = $2',
      [agentId, req.userId]
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    if (agent.is_primary) {
      return res.status(400).json({ error: 'Cannot delete your primary agent' });
    }

    await db.query('DELETE FROM agents WHERE id = $1', [agentId]);

    res.json({ ok: true, message: 'Agent deleted' });
  } catch (err) {
    next(err);
  }
});

router.post('/:agentId/start', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { agentId } = req.params;
    const agent = await db.getOne<Agent>(
      'SELECT * FROM agents WHERE id = $1 AND user_id = $2',
      [agentId, req.userId]
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    await db.query(
      `UPDATE agents SET status = 'active', last_active = NOW() WHERE id = $1`,
      [agentId]
    );

    res.json({ ok: true, status: 'active' });
  } catch (err) {
    next(err);
  }
});

router.post('/:agentId/stop', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { agentId } = req.params;
    const agent = await db.getOne<Agent>(
      'SELECT * FROM agents WHERE id = $1 AND user_id = $2',
      [agentId, req.userId]
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    await db.query(
      `UPDATE agents SET status = 'sleeping' WHERE id = $1`,
      [agentId]
    );

    res.json({ ok: true, status: 'sleeping' });
  } catch (err) {
    next(err);
  }
});

export default router;
