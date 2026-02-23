/**
 * Skills routes — manages agent tools AND bundled skills in openclaw.json.
 *
 * Two config sections:
 *   tools.*          → built-in tool enable/disable (exec, browser, web_search, etc.)
 *   skills.entries.* → bundled skill enable/disable + env/apiKey overrides
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ SECURITY — DO NOT CHANGE WITHOUT UNDERSTANDING                         │
 * │                                                                        │
 * │ 1. PROTOTYPE POLLUTION: names validated against __proto__,             │
 * │    constructor, prototype. Without this, PUT /__proto__ would pollute │
 * │    the config object and potentially the process.                     │
 * │                                                                        │
 * │ 2. NAME FORMAT: Only alphanumeric chars and hyphens/underscores.      │
 * │    This prevents shell injection when the name is used in file paths. │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import {
  getUserContainer,
  readContainerConfig,
  writeContainerConfig,
  restartContainer,
} from '../services/containerConfig';
import { sshExec } from '../services/ssh';
import { PLATFORM_SKILLS, SKILLS_REPO_URL } from '../data/platformSkills';

const router = Router();
const INSTANCE_DIR = '/opt/openclaw/instances';
router.use(authenticate);

// GET /skills/marketplace — list of installable platform skills (no container needed)
router.get('/marketplace', (req: AuthRequest, res: Response) => {
  res.json({ skills: PLATFORM_SKILLS });
});

// POST /skills/install — install a platform skill into user's container
router.post('/install', requireActiveSubscription, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { skillId } = req.body;
    if (!skillId || typeof skillId !== 'string') {
      return res.status(400).json({ error: 'skillId required' });
    }
    const skill = PLATFORM_SKILLS.find(s => s.id === skillId);
    if (!skill) {
      return res.status(400).json({ error: 'Unknown skill' });
    }
    if (!isValidName(skill.id)) {
      return res.status(400).json({ error: 'Invalid skill name' });
    }

    const { serverIp, containerName } = await getUserContainer(req.userId!);
    const userId = req.userId!;
    const skillsDir = `${INSTANCE_DIR}/${userId}/skills`;
    const tmpDir = `/tmp/openclaw-skill-${userId}-${Date.now()}`;

    // Clone repo, copy skill, cleanup
    const repoPath = skill.repoPath;
    const cmd = [
      `mkdir -p ${skillsDir}`,
      `git clone --depth 1 ${SKILLS_REPO_URL} ${tmpDir}`,
      `cp -r ${tmpDir}/skills/${repoPath} ${skillsDir}/${skill.id}`,
      `rm -rf ${tmpDir}`,
    ].join(' && ');

    await sshExec(serverIp, cmd);

    // Enable in openclaw.json
    const config = await readContainerConfig(serverIp, userId);
    if (!config.skills) config.skills = {};
    if (!config.skills.entries) config.skills.entries = {};
    config.skills.entries[skill.id] = { enabled: true };
    await writeContainerConfig(serverIp, userId, config);

    const ready = await restartContainer(serverIp, containerName);

    res.json({ ok: true, skill: skill.id, restarted: ready });
  } catch (err) {
    next(err);
  }
});

router.use(requireActiveSubscription);

function isValidName(name: string): boolean {
  return !!name && !/^(__proto__|constructor|prototype)$/.test(name) && /^[a-zA-Z0-9_\-.:]+$/.test(name);
}

// GET /skills — returns both tools config AND bundled skills config
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serverIp, containerName } = await getUserContainer(req.userId!);

    let availableTools: string[] = [];
    try {
      const listResult = await sshExec(
        serverIp,
        `docker exec ${containerName} openclaw tools list --json 2>/dev/null || echo '[]'`
      );
      const parsed = JSON.parse(listResult.stdout.trim() || '[]');
      if (Array.isArray(parsed)) {
        availableTools = parsed.map((t: any) => typeof t === 'string' ? t : t.name || t.id);
      }
    } catch {}

    let availableSkills: any[] = [];
    try {
      const skillsResult = await sshExec(
        serverIp,
        `docker exec ${containerName} openclaw skills list --json 2>/dev/null || echo '[]'`
      );
      const parsed = JSON.parse(skillsResult.stdout.trim() || '[]');
      if (Array.isArray(parsed)) {
        availableSkills = parsed;
      }
    } catch {}

    const config = await readContainerConfig(serverIp, req.userId!);
    const toolsConfig = config.tools || {};
    const skillsEntries = config.skills?.entries || {};

    const enabledTools: string[] = [];
    const disabledTools: string[] = [];
    for (const [name, val] of Object.entries(toolsConfig)) {
      const v = val as any;
      if (typeof v === 'object' && v !== null && !v.enabled && v.enabled !== undefined) {
        disabledTools.push(name);
      } else if (v === false) {
        disabledTools.push(name);
      } else {
        enabledTools.push(name);
      }
    }

    for (const t of availableTools) {
      if (!enabledTools.includes(t) && !disabledTools.includes(t)) {
        enabledTools.push(t);
      }
    }

    res.json({
      enabled: enabledTools,
      disabled: disabledTools,
      available: availableTools,
      config: toolsConfig,
      skills: availableSkills,
      skillsConfig: skillsEntries,
    });
  } catch (err: any) {
    if (err.statusCode === 409) {
      return res.json({
        enabled: [], disabled: [], available: [], config: {},
        skills: [], skillsConfig: {},
        notProvisioned: true,
      });
    }
    next(err);
  }
});

// PUT /skills/tool/:name — toggle a built-in tool
router.put('/tool/:toolName', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const toolName = req.params.toolName as string;
    if (!isValidName(toolName)) return res.status(400).json({ error: 'Invalid tool name' });
    const { enabled, settings } = req.body;

    const { serverIp, containerName } = await getUserContainer(req.userId!);
    const config = await readContainerConfig(serverIp, req.userId!);

    if (!config.tools) config.tools = {};

    if (settings && typeof settings === 'object') {
      config.tools[toolName] = { ...config.tools[toolName], ...settings, enabled: enabled !== false };
    } else {
      const existing = typeof config.tools[toolName] === 'object' ? config.tools[toolName] : {};
      config.tools[toolName] = { ...existing, enabled: enabled !== false };
    }

    await writeContainerConfig(serverIp, req.userId!, config);
    const ready = await restartContainer(serverIp, containerName);

    res.json({ ok: true, restarted: ready, tool: toolName, enabled: enabled !== false });
  } catch (err) {
    next(err);
  }
});

// PUT /skills/bundled/:name — toggle a bundled skill + set API keys
router.put('/bundled/:skillName', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const skillName = req.params.skillName as string;
    if (!isValidName(skillName)) return res.status(400).json({ error: 'Invalid skill name' });
    const { enabled, apiKey, envKey } = req.body;

    const { serverIp, containerName } = await getUserContainer(req.userId!);
    const config = await readContainerConfig(serverIp, req.userId!);

    if (!config.skills) config.skills = {};
    if (!config.skills.entries) config.skills.entries = {};

    const entry: Record<string, any> = { ...config.skills.entries[skillName], enabled: enabled !== false };

    if (apiKey && envKey) {
      if (!entry.env) entry.env = {};
      entry.env[envKey] = apiKey;
    }

    config.skills.entries[skillName] = entry;

    await writeContainerConfig(serverIp, req.userId!, config);
    const ready = await restartContainer(serverIp, containerName);

    res.json({ ok: true, restarted: ready, skill: skillName, enabled: enabled !== false });
  } catch (err) {
    next(err);
  }
});

// Legacy: PUT /skills/:toolName — backwards compatible tool toggle
router.put('/:toolName', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const toolName = req.params.toolName as string;
    if (!isValidName(toolName)) return res.status(400).json({ error: 'Invalid tool name' });
    const { enabled, settings } = req.body;

    const { serverIp, containerName } = await getUserContainer(req.userId!);
    const config = await readContainerConfig(serverIp, req.userId!);

    if (!config.tools) config.tools = {};

    if (settings && typeof settings === 'object') {
      config.tools[toolName] = { ...config.tools[toolName], ...settings, enabled: enabled !== false };
    } else {
      const existing = typeof config.tools[toolName] === 'object' ? config.tools[toolName] : {};
      config.tools[toolName] = { ...existing, enabled: enabled !== false };
    }

    await writeContainerConfig(serverIp, req.userId!, config);
    const ready = await restartContainer(serverIp, containerName);

    res.json({ ok: true, restarted: ready, tool: toolName, enabled: enabled !== false });
  } catch (err) {
    next(err);
  }
});

router.delete('/:toolName', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const toolName = req.params.toolName as string;
    if (!isValidName(toolName)) return res.status(400).json({ error: 'Invalid tool name' });

    const { serverIp, containerName } = await getUserContainer(req.userId!);
    const config = await readContainerConfig(serverIp, req.userId!);

    if (config.tools) delete config.tools[toolName];
    if (config.skills?.entries) delete config.skills.entries[toolName];

    await writeContainerConfig(serverIp, req.userId!, config);
    await restartContainer(serverIp, containerName);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
