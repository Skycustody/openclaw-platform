/**
 * Multi-agent routes — uses OpenClaw's NATIVE multi-agent system.
 *
 * All agents live inside the user's SINGLE OpenClaw container.
 * Each agent = an entry in openclaw.json agents.list with:
 *   - Its own workspace (SOUL.md, AGENTS.md for personality)
 *   - Its own session store
 *   - Its own auth profiles (sharing the user's proxy key)
 *   - Its own identity (name, emoji)
 *
 * NO separate containers. RAM is shared within one container.
 * This wraps `openclaw agents add/delete` CLI commands.
 */
import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import db from '../lib/db';
import { User, Server, PLAN_LIMITS, Plan } from '../types';
import { v4 as uuid } from 'uuid';
import {
  getUserContainer, readContainerConfig, writeContainerConfig,
  restartContainer as restartContainerHelper,
} from '../services/containerConfig';
import { sshExec } from '../services/ssh';
import { ensureProxyKey } from '../services/apiKeys';

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

const MAX_AGENTS: Record<string, number> = {
  starter: 1,
  pro: 2,
  business: 4,
};

const INSTANCE_DIR = '/opt/openclaw/instances';

interface Agent {
  id: string;
  user_id: string;
  name: string;
  purpose: string | null;
  instructions: string | null;
  openclaw_agent_id: string;
  status: string;
  ram_mb: number;
  is_primary: boolean;
  created_at: string;
  last_active: string;
}

/**
 * Sync an agent into the user's container openclaw.json agents.list.
 * Creates the workspace directory and writes personality files.
 */
async function syncAgentToContainer(
  serverIp: string,
  userId: string,
  containerName: string,
  agent: { openclawId: string; name: string; purpose: string | null; instructions: string | null },
): Promise<void> {
  const config = await readContainerConfig(serverIp, userId);

  if (!config.agents) config.agents = {};
  if (!Array.isArray(config.agents.list)) config.agents.list = [];

  const existingIdx = config.agents.list.findIndex(
    (a: any) => a.id === agent.openclawId
  );

  const agentEntry: Record<string, any> = {
    id: agent.openclawId,
    workspace: `~/.openclaw/workspace-${agent.openclawId}`,
    agentDir: `~/.openclaw/agents/${agent.openclawId}/agent`,
    identity: { name: agent.name },
  };

  if (existingIdx >= 0) {
    config.agents.list[existingIdx] = { ...config.agents.list[existingIdx], ...agentEntry };
  } else {
    config.agents.list.push(agentEntry);
  }

  // Ensure 'main' agent is first and marked default
  const mainIdx = config.agents.list.findIndex((a: any) => a.id === 'main');
  if (mainIdx > 0) {
    const main = config.agents.list.splice(mainIdx, 1)[0];
    main.default = true;
    config.agents.list.unshift(main);
  } else if (mainIdx === 0) {
    config.agents.list[0].default = true;
  }

  await writeContainerConfig(serverIp, userId, config);

  // Create workspace directory and write personality
  const wsDir = `${INSTANCE_DIR}/${userId}/workspace-${agent.openclawId}`;
  const agentDir = `${INSTANCE_DIR}/${userId}/agents/${agent.openclawId}/agent`;

  const soulContent: string[] = [];
  if (agent.name) soulContent.push(`# ${agent.name}`);
  if (agent.purpose) soulContent.push(`\n## Purpose\n${agent.purpose}`);
  if (agent.instructions) soulContent.push(`\n## Instructions\n${agent.instructions}`);

  const soulB64 = Buffer.from(soulContent.join('\n') || `# ${agent.name}\n`).toString('base64');

  await sshExec(serverIp, [
    `mkdir -p ${wsDir}`,
    `mkdir -p ${agentDir}`,
    `echo '${soulB64}' | base64 -d > ${wsDir}/SOUL.md`,
  ].join(' && '));

  // Copy auth profiles from main agent so this agent can use the proxy
  const proxyKey = await ensureProxyKey(agent.openclawId === 'main' ? '' : '').catch(() => null);
  const mainAuthPath = `${INSTANCE_DIR}/${userId}/agents/main/agent/auth-profiles.json`;
  const agentAuthPath = `${agentDir}/auth-profiles.json`;

  await sshExec(serverIp, [
    `test -f ${mainAuthPath} && cp ${mainAuthPath} ${agentAuthPath} || true`,
    `chmod 600 ${agentAuthPath} 2>/dev/null || true`,
  ].join(' && '));
}

/**
 * Remove an agent from the container's openclaw.json agents.list.
 */
async function removeAgentFromContainer(
  serverIp: string,
  userId: string,
  openclawId: string,
): Promise<void> {
  const config = await readContainerConfig(serverIp, userId);

  if (config.agents?.list) {
    config.agents.list = config.agents.list.filter((a: any) => a.id !== openclawId);
  }

  // Remove any bindings for this agent
  if (Array.isArray(config.bindings)) {
    config.bindings = config.bindings.filter((b: any) => b.agentId !== openclawId);
  }

  await writeContainerConfig(serverIp, userId, config);

  // Clean up workspace and agent dir
  const wsDir = `${INSTANCE_DIR}/${userId}/workspace-${openclawId}`;
  const agentDir = `${INSTANCE_DIR}/${userId}/agents/${openclawId}`;
  await sshExec(serverIp, `rm -rf ${wsDir} ${agentDir}`).catch(() => {});
}

/**
 * GET /agents — list all agents, synced with container's agents.list.
 */
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Ensure primary agent record exists in DB
    const existingPrimary = await db.getOne<Agent>(
      'SELECT * FROM agents WHERE user_id = $1 AND is_primary = true',
      [req.userId]
    );

    if (!existingPrimary) {
      await db.query(
        `INSERT INTO agents (id, user_id, name, purpose, status, ram_mb, is_primary)
         VALUES ($1, $2, 'Primary Agent', 'Your main AI assistant',
           $3, $4, true)
         ON CONFLICT DO NOTHING`,
        [
          uuid(), req.userId,
          user.status === 'active' || user.status === 'sleeping' ? user.status : 'pending',
          PLAN_LIMITS[(user.plan || 'starter') as Plan].ramMb,
        ]
      );
    }

    const agents = await db.getMany<Agent>(
      'SELECT * FROM agents WHERE user_id = $1 ORDER BY is_primary DESC, created_at ASC',
      [req.userId]
    );

    const plan = user.plan || 'starter';
    const maxAgents = MAX_AGENTS[plan] || 1;
    const planLimits = PLAN_LIMITS[plan as Plan];

    // RAM is shared within one container — plan RAM is the total pool
    const totalRamMb = planLimits.ramMb;
    const agentCount = agents.length;

    res.json({
      agents: agents.map(a => ({
        ...a,
        openclawAgentId: a.is_primary ? 'main' : (a.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20) || `agent-${a.id.slice(0, 6)}`),
      })),
      limits: {
        maxAgents,
        currentCount: agentCount,
        canCreate: agentCount < maxAgents,
        totalRamMb,
        sharedRam: true,
      },
      plan,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /agents — create a new agent inside the user's OpenClaw container.
 * Uses openclaw.json agents.list — NO new container.
 */
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
    const openclawId = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)
      || `agent-${agentId.slice(0, 6)}`;

    // Require a running container
    let container;
    try {
      container = await getUserContainer(req.userId!);
    } catch {
      return res.status(409).json({
        error: 'Your primary agent must be set up first. Go to the chat page to provision it.',
      });
    }

    // Add agent to openclaw.json agents.list + create workspace
    await syncAgentToContainer(
      container.serverIp, req.userId!, container.containerName,
      { openclawId, name: name.trim(), purpose: purpose || null, instructions: instructions || null }
    );

    // Restart container so it picks up the new agent
    await restartContainerHelper(container.serverIp, container.containerName, 15000);

    // Save to DB
    await db.query(
      `INSERT INTO agents (id, user_id, name, purpose, instructions, status, ram_mb, is_primary)
       VALUES ($1, $2, $3, $4, $5, 'active', 0, false)`,
      [agentId, req.userId, name.trim(), purpose || null, instructions || null]
    );

    const agent = await db.getOne<Agent>('SELECT * FROM agents WHERE id = $1', [agentId]);

    res.json({
      agent: { ...agent, openclawAgentId: openclawId },
      message: 'Agent created inside your OpenClaw container. All agents share RAM.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /agents/:agentId — update agent personality in the container.
 */
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

    // Update the container's openclaw.json and workspace SOUL.md
    if (!agent.is_primary) {
      try {
        const container = await getUserContainer(req.userId!);
        const updatedAgent = await db.getOne<Agent>('SELECT * FROM agents WHERE id = $1', [agentId]);
        const openclawId = (updatedAgent?.name || agent.name).toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)
          || `agent-${agentId.slice(0, 6)}`;

        await syncAgentToContainer(
          container.serverIp, req.userId!, container.containerName,
          {
            openclawId,
            name: updatedAgent?.name || agent.name,
            purpose: updatedAgent?.purpose || agent.purpose,
            instructions: updatedAgent?.instructions || agent.instructions,
          }
        );

        await restartContainerHelper(container.serverIp, container.containerName, 15000);
      } catch (err) {
        console.warn(`[agents] Config update failed for agent ${agentId}:`, err);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /agents/:agentId — remove agent from container's agents.list + workspace.
 */
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

    // Remove from container's openclaw.json and clean up workspace
    try {
      const container = await getUserContainer(req.userId!);
      const openclawId = agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20)
        || `agent-${agentId.slice(0, 6)}`;

      await removeAgentFromContainer(container.serverIp, req.userId!, openclawId);
      await restartContainerHelper(container.serverIp, container.containerName, 15000);
    } catch (err) {
      console.warn(`[agents] Container cleanup failed for agent ${agentId}:`, err);
    }

    await db.query('DELETE FROM agents WHERE id = $1', [agentId]);

    res.json({ ok: true, message: 'Agent removed from your OpenClaw instance' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /agents/:agentId/start — agents are always running inside the container.
 * This just marks the DB status.
 */
router.post('/:agentId/start', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { agentId } = req.params;
    const agent = await db.getOne<Agent>(
      'SELECT * FROM agents WHERE id = $1 AND user_id = $2',
      [agentId, req.userId]
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    if (agent.is_primary) {
      return res.json({ ok: true, status: 'active', message: 'Primary agent — use the main chat.' });
    }

    await db.query(
      `UPDATE agents SET status = 'active', last_active = NOW() WHERE id = $1`,
      [agentId]
    );

    res.json({ ok: true, status: 'active', message: 'Agent is running inside your OpenClaw container.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /agents/:agentId/stop — mark agent as sleeping.
 * The agent still exists in the container but is not actively used.
 */
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
