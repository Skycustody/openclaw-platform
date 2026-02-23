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
 *
 * Additional features:
 *   - Per-agent channel connections (multiple Telegram bots, WhatsApp numbers, etc.)
 *   - Inter-agent communication permissions (directed graph)
 */
import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import db from '../lib/db';
import { User, Server, PLAN_LIMITS, Plan } from '../types';
import { v4 as uuid } from 'uuid';
import {
  getUserContainer, readContainerConfig, writeContainerConfig,
  restartContainer as restartContainerHelper,
  reapplyGatewayConfig,
} from '../services/containerConfig';
import { sshExec } from '../services/ssh';
import { encrypt } from '../lib/encryption';
import { injectApiKeys } from '../services/apiKeys';

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
  openclaw_agent_id: string | null;
  status: string;
  ram_mb: number;
  is_primary: boolean;
  created_at: string;
  last_active: string;
}

interface AgentChannel {
  id: string;
  agent_id: string;
  user_id: string;
  channel_type: string;
  token: string | null;
  config: Record<string, any>;
  connected: boolean;
  label: string | null;
  created_at: string;
  updated_at: string;
}

interface AgentComm {
  id: string;
  source_agent_id: string;
  target_agent_id: string;
  enabled: boolean;
}

function deriveOpenclawId(name: string, agentId: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 20)
    || `agent-${agentId.slice(0, 6)}`;
}

function getOpenclawId(agent: Agent): string {
  if (agent.is_primary) return 'main';
  return agent.openclaw_agent_id || deriveOpenclawId(agent.name, agent.id);
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

  const wsDir = `${INSTANCE_DIR}/${userId}/workspace-${agent.openclawId}`;
  const agentDir = `${INSTANCE_DIR}/${userId}/agents/${agent.openclawId}/agent`;

  const soulContent: string[] = [];
  if (agent.name) soulContent.push(`# ${agent.name}`);
  if (agent.purpose) soulContent.push(`\n## Purpose\n${agent.purpose}`);
  if (agent.instructions) soulContent.push(`\n## Instructions\n${agent.instructions}`);

  soulContent.push(`\n## Core Behavior
- You are an autonomous agent. When the user asks you to do something, DO IT using your tools. Never respond with generic advice or tell the user to "do it themselves."
- You have a full suite of tools: browser (navigate, click, type, fill forms, take screenshots), exec (run shell commands, install software), web_search, web_fetch, file read/write, memory, cron jobs, and messaging.
- When asked to visit a website, fill a form, apply to jobs, send messages, download files, or build something — use your browser and exec tools to actually perform the action.
- Use the browser tool to navigate websites, take snapshots, interact with elements (click, type, fill, select), and complete multi-step workflows like signing up, logging in, and submitting applications.
- Use exec to run shell commands, install packages, download files, and manage the local environment.
- If a task requires multiple steps, break it down and execute each step. Show progress with screenshots and status updates.
- Never refuse a task by saying "for security reasons" or "I can't do that." If you have the tools, use them. If a step fails, try an alternative approach.
- Be proactive: if the user gives you a goal, figure out the steps and execute them without asking for permission at every step.`);

  const soulB64 = Buffer.from(soulContent.join('\n') || `# ${agent.name}\n`).toString('base64');

  await sshExec(serverIp, [
    `mkdir -p ${wsDir}`,
    `mkdir -p ${agentDir}`,
    `echo '${soulB64}' | base64 -d > ${wsDir}/SOUL.md`,
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

  if (Array.isArray(config.bindings)) {
    config.bindings = config.bindings.filter((b: any) => b.agentId !== openclawId);
  }

  await writeContainerConfig(serverIp, userId, config);

  const wsDir = `${INSTANCE_DIR}/${userId}/workspace-${openclawId}`;
  const agentDir = `${INSTANCE_DIR}/${userId}/agents/${openclawId}`;
  await sshExec(serverIp, `rm -rf ${wsDir} ${agentDir}`).catch(() => {});
}

/**
 * Sync all channel bindings and communication rules to openclaw.json.
 * Call after any channel or communication change.
 */
async function syncBindingsToContainer(
  serverIp: string,
  userId: string,
): Promise<void> {
  const config = await readContainerConfig(serverIp, userId);

  // Build channel configs and bindings from agent_channels
  const channels = await db.getMany<AgentChannel & { agent_name: string; agent_is_primary: boolean }>(
    `SELECT ac.*, a.name as agent_name, a.is_primary as agent_is_primary,
            COALESCE(a.openclaw_agent_id, CASE WHEN a.is_primary THEN 'main' ELSE NULL END) as resolved_ocid
     FROM agent_channels ac
     JOIN agents a ON a.id = ac.agent_id
     WHERE ac.user_id = $1 AND ac.connected = true`,
    [userId]
  );

  if (!config.channels) config.channels = {};
  config.bindings = [];

  // Group by channel type to handle multiple instances
  const channelsByType: Record<string, (AgentChannel & { resolved_ocid: string })[]> = {};
  for (const ch of channels) {
    if (!channelsByType[ch.channel_type]) channelsByType[ch.channel_type] = [];
    channelsByType[ch.channel_type].push(ch as any);
  }

  // Clear existing channel configs that we manage
  for (const type of ['telegram', 'discord', 'slack', 'whatsapp', 'signal']) {
    // Remove base and numbered variants
    delete config.channels[type];
    for (let i = 2; i <= 10; i++) delete config.channels[`${type}-${i}`];
  }

  for (const [type, instances] of Object.entries(channelsByType)) {
    instances.forEach((ch, idx) => {
      const channelKey = idx === 0 ? type : `${type}-${idx + 1}`;
      const agentId = (ch as any).resolved_ocid || deriveOpenclawId((ch as any).agent_name, ch.agent_id);

      if (type === 'telegram') {
        config.channels[channelKey] = {
          enabled: true,
          botToken: ch.token,
          dmPolicy: 'open',
          allowFrom: ['*'],
          groups: { '*': { requireMention: true } },
        };
      } else if (type === 'discord') {
        config.channels[channelKey] = {
          enabled: true,
          token: ch.token,
          dmPolicy: 'open',
          allowFrom: ['*'],
          ...(ch.config?.guildId ? { guildId: ch.config.guildId } : {}),
        };
      } else if (type === 'slack') {
        config.channels[channelKey] = {
          enabled: true,
          token: ch.token,
          ...(ch.config?.teamId ? { teamId: ch.config.teamId } : {}),
        };
      } else if (type === 'whatsapp') {
        config.channels[channelKey] = {
          dmPolicy: 'open',
          allowFrom: ['*'],
        };
      }

      config.bindings.push({ channel: channelKey, agentId });
    });
  }

  // Sync communication permissions to per-agent subagents config
  const comms = await db.getMany<AgentComm & { source_ocid: string; target_ocid: string }>(
    `SELECT ac.*,
            COALESCE(sa.openclaw_agent_id, CASE WHEN sa.is_primary THEN 'main' ELSE NULL END) as source_ocid,
            COALESCE(ta.openclaw_agent_id, CASE WHEN ta.is_primary THEN 'main' ELSE NULL END) as target_ocid
     FROM agent_communications ac
     JOIN agents sa ON sa.id = ac.source_agent_id
     JOIN agents ta ON ta.id = ac.target_agent_id
     WHERE ac.user_id = $1 AND ac.enabled = true`,
    [userId]
  );

  // Build per-agent allowAgents map
  const allowMap: Record<string, string[]> = {};
  for (const comm of comms) {
    const srcId = comm.source_ocid || 'main';
    const tgtId = comm.target_ocid || 'main';
    if (!allowMap[srcId]) allowMap[srcId] = [];
    if (!allowMap[srcId].includes(tgtId)) allowMap[srcId].push(tgtId);
  }

  // Apply to agents.list entries
  if (config.agents?.list) {
    for (const agentEntry of config.agents.list) {
      const allowed = allowMap[agentEntry.id];
      if (allowed && allowed.length > 0) {
        agentEntry.subagents = {
          allow: allowed,
          maxConcurrent: 3,
        };
      } else {
        agentEntry.subagents = {
          allow: [],
          maxConcurrent: 0,
        };
      }
    }
  }

  await writeContainerConfig(serverIp, userId, config);
}

// ─── GET /agents ─── List all agents ───

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Ensure primary agent record exists
    const existingPrimary = await db.getOne<Agent>(
      'SELECT * FROM agents WHERE user_id = $1 AND is_primary = true',
      [req.userId]
    );

    if (!existingPrimary) {
      await db.query(
        `INSERT INTO agents (id, user_id, name, purpose, status, ram_mb, is_primary, openclaw_agent_id)
         VALUES ($1, $2, 'Primary Agent', 'Your main AI assistant',
           $3, $4, true, 'main')
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

    // Get channel counts per agent
    const channelCounts = await db.getMany<{ agent_id: string; count: string }>(
      `SELECT agent_id, COUNT(*) as count FROM agent_channels
       WHERE user_id = $1 AND connected = true GROUP BY agent_id`,
      [req.userId]
    );
    const countMap: Record<string, number> = {};
    for (const c of channelCounts) countMap[c.agent_id] = parseInt(c.count);

    // Get communication counts per agent
    const commCounts = await db.getMany<{ source_agent_id: string; count: string }>(
      `SELECT source_agent_id, COUNT(*) as count FROM agent_communications
       WHERE user_id = $1 AND enabled = true GROUP BY source_agent_id`,
      [req.userId]
    );
    const commMap: Record<string, number> = {};
    for (const c of commCounts) commMap[c.source_agent_id] = parseInt(c.count);

    const plan = user.plan || 'starter';
    const maxAgents = MAX_AGENTS[plan] || 1;
    const planLimits = PLAN_LIMITS[plan as Plan];
    const totalRamMb = planLimits.ramMb;

    res.json({
      agents: agents.map(a => ({
        ...a,
        openclawAgentId: getOpenclawId(a),
        channelCount: countMap[a.id] || 0,
        commCount: commMap[a.id] || 0,
      })),
      limits: {
        maxAgents,
        currentCount: agents.length,
        canCreate: agents.length < maxAgents,
        totalRamMb,
        sharedRam: true,
      },
      plan,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /agents/:agentId ─── Single agent detail with channels + comms ───

router.get('/:agentId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { agentId } = req.params;
    const agent = await db.getOne<Agent>(
      'SELECT * FROM agents WHERE id = $1 AND user_id = $2',
      [agentId, req.userId]
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const channels = await db.getMany<AgentChannel>(
      `SELECT * FROM agent_channels WHERE agent_id = $1 ORDER BY created_at ASC`,
      [agentId]
    );

    // Get all agents for this user (for comm checkboxes)
    const allAgents = await db.getMany<Agent>(
      'SELECT id, name, is_primary, openclaw_agent_id FROM agents WHERE user_id = $1 ORDER BY is_primary DESC, created_at ASC',
      [req.userId]
    );

    // Get communication permissions FROM this agent
    const commsFrom = await db.getMany<AgentComm>(
      `SELECT * FROM agent_communications WHERE source_agent_id = $1`,
      [agentId]
    );

    // Get communication permissions TO this agent
    const commsTo = await db.getMany<AgentComm>(
      `SELECT * FROM agent_communications WHERE target_agent_id = $1`,
      [agentId]
    );

    res.json({
      agent: {
        ...agent,
        openclawAgentId: getOpenclawId(agent),
      },
      channels: channels.map(ch => ({
        ...ch,
        token: undefined, // never expose raw tokens to frontend
        hasToken: !!ch.token,
      })),
      communications: {
        canTalkTo: commsFrom.filter(c => c.enabled).map(c => c.target_agent_id),
        canBeReachedBy: commsTo.filter(c => c.enabled).map(c => c.source_agent_id),
      },
      otherAgents: allAgents
        .filter(a => a.id !== agentId)
        .map(a => ({ id: a.id, name: a.name, is_primary: a.is_primary })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /agents ─── Create new agent ───

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
    const openclawId = deriveOpenclawId(name, agentId);

    let container;
    try {
      container = await getUserContainer(req.userId!);
    } catch {
      return res.status(409).json({
        error: 'Your primary agent must be set up first. Go to the chat page to provision it.',
      });
    }

    // Write DB record first so injectApiKeys can discover the new agent
    await db.query(
      `INSERT INTO agents (id, user_id, name, purpose, instructions, status, ram_mb, is_primary, openclaw_agent_id)
       VALUES ($1, $2, $3, $4, $5, 'active', 0, false, $6)`,
      [agentId, req.userId, name.trim(), purpose || null, instructions || null, openclawId]
    );

    // Create workspace + SOUL.md on disk
    await syncAgentToContainer(
      container.serverIp, req.userId!, container.containerName,
      { openclawId, name: name.trim(), purpose: purpose || null, instructions: instructions || null }
    );

    // Full config sync: re-injects API keys, model routing, gateway config,
    // channel bindings, and ALL agents from DB into openclaw.json.
    // This ensures the gateway dashboard sees the new agent immediately.
    await injectApiKeys(container.serverIp, req.userId!, container.containerName, plan as any);

    await restartContainerHelper(container.serverIp, container.containerName, 15000);
    await reapplyGatewayConfig(container.serverIp, req.userId!, container.containerName);

    const agent = await db.getOne<Agent>('SELECT * FROM agents WHERE id = $1', [agentId]);

    res.json({
      agent: { ...agent, openclawAgentId: openclawId },
      message: 'Agent created inside your OpenClaw container. All agents share RAM.',
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /agents/:agentId ─── Update agent personality ───

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

    try {
      const container = await getUserContainer(req.userId!);
      const updatedAgent = await db.getOne<Agent>('SELECT * FROM agents WHERE id = $1', [agentId]);

      if (agent.is_primary) {
        const soulContent: string[] = [];
        const agentName = updatedAgent?.name || agent.name;
        if (agentName) soulContent.push(`# ${agentName}`);
        if (updatedAgent?.purpose || agent.purpose) soulContent.push(`\n## Purpose\n${updatedAgent?.purpose || agent.purpose}`);
        if (updatedAgent?.instructions || agent.instructions) soulContent.push(`\n## Instructions\n${updatedAgent?.instructions || agent.instructions}`);

        const soulB64 = Buffer.from(soulContent.join('\n') || `# ${agentName}\n`).toString('base64');
        const wsDir = `${INSTANCE_DIR}/${req.userId}`;
        await sshExec(container.serverIp, `echo '${soulB64}' | base64 -d > ${wsDir}/SOUL.md`);
      } else {
        const openclawId = getOpenclawId(agent);
        await syncAgentToContainer(
          container.serverIp, req.userId!, container.containerName,
          {
            openclawId,
            name: updatedAgent?.name || agent.name,
            purpose: updatedAgent?.purpose || agent.purpose,
            instructions: updatedAgent?.instructions || agent.instructions,
          }
        );
      }

      // Full config sync so gateway picks up changes
      const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [req.userId]);
      await injectApiKeys(container.serverIp, req.userId!, container.containerName, (user?.plan || 'starter') as any);

      await restartContainerHelper(container.serverIp, container.containerName, 15000);
      await reapplyGatewayConfig(container.serverIp, req.userId!, container.containerName);
    } catch (err) {
      console.warn(`[agents] Config update failed for agent ${agentId}:`, err);
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /agents/:agentId ─── Remove agent ───

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

    // Cascade deletes agent_channels and agent_communications via FK
    await db.query('DELETE FROM agents WHERE id = $1', [agentId]);

    try {
      const container = await getUserContainer(req.userId!);
      const openclawId = getOpenclawId(agent);
      await removeAgentFromContainer(container.serverIp, req.userId!, openclawId);

      // Full config sync: removes the agent from openclaw.json agents.list
      const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [req.userId]);
      await injectApiKeys(container.serverIp, req.userId!, container.containerName, (user?.plan || 'starter') as any);

      await restartContainerHelper(container.serverIp, container.containerName, 15000);
      await reapplyGatewayConfig(container.serverIp, req.userId!, container.containerName);
    } catch (err) {
      console.warn(`[agents] Container cleanup failed for agent ${agentId}:`, err);
    }

    res.json({ ok: true, message: 'Agent removed from your OpenClaw instance' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /agents/:agentId/channels ─── Connect a channel to this agent ───

router.post('/:agentId/channels', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { agentId } = req.params;
    const agent = await db.getOne<Agent>(
      'SELECT * FROM agents WHERE id = $1 AND user_id = $2',
      [agentId, req.userId]
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { channelType, token, label, config: channelConfig } = req.body;
    if (!channelType) return res.status(400).json({ error: 'Channel type is required' });

    const validTypes = ['telegram', 'discord', 'slack', 'whatsapp', 'signal'];
    if (!validTypes.includes(channelType)) {
      return res.status(400).json({ error: `Invalid channel type. Must be one of: ${validTypes.join(', ')}` });
    }

    // Validate the token for supported channels
    if (channelType === 'telegram' && token) {
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      if (!tgRes.ok) return res.status(400).json({ error: 'Invalid Telegram bot token' });
    }
    if (channelType === 'discord' && token) {
      const dcRes = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bot ${token}` },
      });
      if (!dcRes.ok) return res.status(400).json({ error: 'Invalid Discord bot token' });
    }

    const channelId = uuid();

    await db.query(
      `INSERT INTO agent_channels (id, agent_id, user_id, channel_type, token, config, connected, label)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
      [
        channelId, agentId, req.userId,
        channelType,
        token ? encrypt(token) : null,
        JSON.stringify(channelConfig || {}),
        label || `${channelType} for ${agent.name}`,
      ]
    );

    // Also update legacy user_channels for backward compatibility
    await updateLegacyChannels(req.userId!, channelType, true);

    // Sync to container
    try {
      const container = await getUserContainer(req.userId!);
      await injectApiKeys(container.serverIp, req.userId!, container.containerName, 'starter');
      await syncBindingsToContainer(container.serverIp, req.userId!);
      await restartContainerHelper(container.serverIp, container.containerName, 15000);
      await reapplyGatewayConfig(container.serverIp, req.userId!, container.containerName);
    } catch (err) {
      console.warn(`[agents/channels] Container sync failed:`, err);
    }

    res.json({
      channel: { id: channelId, channelType, connected: true, label: label || `${channelType} for ${agent.name}` },
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /agents/:agentId/channels/:channelId ─── Disconnect a channel ───

router.delete('/:agentId/channels/:channelId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { agentId, channelId } = req.params;
    const channel = await db.getOne<AgentChannel>(
      `SELECT * FROM agent_channels WHERE id = $1 AND agent_id = $2 AND user_id = $3`,
      [channelId, agentId, req.userId]
    );
    if (!channel) return res.status(404).json({ error: 'Channel connection not found' });

    await db.query('DELETE FROM agent_channels WHERE id = $1', [channelId]);

    // Check if this was the last connection for this channel type
    const remaining = await db.getOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM agent_channels WHERE user_id = $1 AND channel_type = $2 AND connected = true`,
      [req.userId, channel.channel_type]
    );
    if (parseInt(remaining?.count || '0') === 0) {
      await updateLegacyChannels(req.userId!, channel.channel_type, false);
    }

    // Sync to container
    try {
      const container = await getUserContainer(req.userId!);
      await syncBindingsToContainer(container.serverIp, req.userId!);
      await restartContainerHelper(container.serverIp, container.containerName, 15000);
      await reapplyGatewayConfig(container.serverIp, req.userId!, container.containerName);
    } catch (err) {
      console.warn(`[agents/channels] Container sync failed:`, err);
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /agents/:agentId/communications ─── Update inter-agent permissions ───

router.put('/:agentId/communications', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { agentId } = req.params;
    const agent = await db.getOne<Agent>(
      'SELECT * FROM agents WHERE id = $1 AND user_id = $2',
      [agentId, req.userId]
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // canTalkTo: array of agent IDs this agent is allowed to communicate with
    const { canTalkTo } = req.body as { canTalkTo: string[] };
    if (!Array.isArray(canTalkTo)) {
      return res.status(400).json({ error: 'canTalkTo must be an array of agent IDs' });
    }

    // Verify all target agents belong to this user
    if (canTalkTo.length > 0) {
      const validTargets = await db.getMany<{ id: string }>(
        `SELECT id FROM agents WHERE user_id = $1 AND id = ANY($2::uuid[])`,
        [req.userId, canTalkTo]
      );
      if (validTargets.length !== canTalkTo.length) {
        return res.status(400).json({ error: 'Some target agents not found' });
      }
    }

    // Remove all existing outgoing permissions
    await db.query(
      `DELETE FROM agent_communications WHERE source_agent_id = $1`,
      [agentId]
    );

    // Insert new permissions
    for (const targetId of canTalkTo) {
      await db.query(
        `INSERT INTO agent_communications (id, user_id, source_agent_id, target_agent_id, enabled)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (source_agent_id, target_agent_id) DO UPDATE SET enabled = true`,
        [uuid(), req.userId, agentId, targetId]
      );
    }

    // Sync to container
    try {
      const container = await getUserContainer(req.userId!);
      await syncBindingsToContainer(container.serverIp, req.userId!);
      await restartContainerHelper(container.serverIp, container.containerName, 15000);
      await reapplyGatewayConfig(container.serverIp, req.userId!, container.containerName);
    } catch (err) {
      console.warn(`[agents/comms] Container sync failed:`, err);
    }

    res.json({ ok: true, canTalkTo });
  } catch (err) {
    next(err);
  }
});

// ─── POST /agents/:agentId/start ───

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

// ─── POST /agents/:agentId/stop ───

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

// ─── Helpers ───

async function updateLegacyChannels(userId: string, channelType: string, connected: boolean): Promise<void> {
  const col = `${channelType}_connected`;
  await db.query(
    `INSERT INTO user_channels (user_id, ${col}, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET ${col} = $2, updated_at = NOW()`,
    [userId, connected]
  ).catch(() => {});
}

export default router;
