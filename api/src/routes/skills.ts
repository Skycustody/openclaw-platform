import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import {
  getUserContainer,
  readContainerConfig,
  writeContainerConfig,
  restartContainer,
} from '../services/containerConfig';
import { sshExec } from '../services/ssh';

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serverIp, containerName, user } = await getUserContainer(req.userId!);

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

    const config = await readContainerConfig(serverIp, req.userId!);
    const toolsConfig = config.tools || {};

    const enabledTools: string[] = [];
    const disabledTools: string[] = [];
    for (const [name, val] of Object.entries(toolsConfig)) {
      const v = val as any;
      if (v === true || v?.enabled === true) {
        enabledTools.push(name);
      } else if (v === false || v?.enabled === false) {
        disabledTools.push(name);
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
    });
  } catch (err: any) {
    if (err.statusCode === 409) {
      return res.json({ enabled: [], disabled: [], available: [], config: {}, notProvisioned: true });
    }
    next(err);
  }
});

router.put('/:toolName', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const toolName = req.params.toolName as string;
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

    const { serverIp, containerName } = await getUserContainer(req.userId!);
    const config = await readContainerConfig(serverIp, req.userId!);

    if (config.tools) {
      delete config.tools[toolName];
    }

    await writeContainerConfig(serverIp, req.userId!, config);
    await restartContainer(serverIp, containerName);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
