import { Router, Request, Response, NextFunction } from 'express';
import { internalAuth } from '../middleware/auth';
import db from '../lib/db';
import { getServerLoad, checkCapacity, getAllWorkersStats } from '../services/serverRegistry';
import { provisionUser } from '../services/provisioning';
import { User } from '../types';
import { sshExec } from '../services/ssh';
import { injectApiKeys, ensureProxyKey } from '../services/apiKeys';

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

// Actual container RAM usage (runs docker stats on each worker via SSH)
router.get('/worker-stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getAllWorkersStats();
    res.json({ workers: stats });
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

// Re-provision a stuck user (or all stuck users)
router.post('/reprovision', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body;
    let users: User[];

    if (userId) {
      const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
      if (!user) return res.status(404).json({ error: 'User not found' });
      users = [user];
    } else {
      users = await db.getMany<User>(
        `SELECT * FROM users WHERE status = 'provisioning' AND server_id IS NULL`
      );
    }

    if (users.length === 0) {
      return res.json({ message: 'No stuck users to re-provision', results: [] });
    }

    const results = [];
    for (const user of users) {
      try {
        console.log(`Re-provisioning user ${user.id} (${user.email})...`);
        const result = await provisionUser({
          userId: user.id,
          email: user.email,
          plan: user.plan as any,
          stripeCustomerId: user.stripe_customer_id || undefined,
        });
        results.push({ userId: user.id, email: user.email, status: 'success', subdomain: result.subdomain });
      } catch (err: any) {
        console.error(`Re-provision failed for ${user.id}:`, err.message);
        results.push({ userId: user.id, email: user.email, status: 'failed', error: err.message });
      }
    }

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

/**
 * Inject proxy keys into all active user containers.
 * For each user:
 *   1. Generates a proxy key if they don't have one
 *   2. Writes proxy key into auth-profiles.json + base URLs into openclaw.json
 *   3. Restarts the container so it picks up the changes
 *
 * Real API keys never touch the container — only the proxy key (val_sk_xxx).
 */
router.post('/inject-keys', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body;
    let users: any[];

    if (userId) {
      const user = await db.getOne<any>(
        `SELECT u.*, s.ip as server_ip FROM users u
         LEFT JOIN servers s ON s.id = u.server_id
         WHERE u.id = $1`,
        [userId]
      );
      if (!user) return res.status(404).json({ error: 'User not found' });
      users = [user];
    } else {
      users = await db.getMany<any>(
        `SELECT u.*, s.ip as server_ip FROM users u
         LEFT JOIN servers s ON s.id = u.server_id
         WHERE u.server_id IS NOT NULL AND u.status IN ('active', 'sleeping', 'provisioning')`
      );
    }

    if (users.length === 0) {
      return res.json({ message: 'No users with containers found', results: [] });
    }

    const apiUrl = (process.env.API_URL || 'https://api.yourdomain.com').replace(/\/$/, '');
    const results = [];

    for (const user of users) {
      try {
        const cn = user.container_name || `openclaw-${user.id.slice(0, 12)}`;

        // Generate proxy key if missing
        const proxyKey = await ensureProxyKey(user.id);

        // Write proxy config into filesystem
        await injectApiKeys(user.server_ip, user.id, cn);

        // Recreate container with proxy env vars instead of real keys.
        // We stop the old container, remove it, and re-run with updated env.
        // The host volume (/opt/openclaw/instances/<id>) persists all data.
        const inspectCmd = `docker inspect ${cn} --format='{{json .Config}}' 2>/dev/null`;
        const inspectResult = await sshExec(user.server_ip, inspectCmd).catch(() => null);

        if (inspectResult?.stdout) {
          try {
            const containerConfig = JSON.parse(inspectResult.stdout);
            const existingEnv: string[] = containerConfig.Env || [];

            // Filter out old real API key env vars and old base URL vars
            const filteredEnv = existingEnv.filter((e: string) =>
              !e.startsWith('OPENAI_API_KEY=') &&
              !e.startsWith('ANTHROPIC_API_KEY=') &&
              !e.startsWith('OPENAI_BASE_URL=') &&
              !e.startsWith('ANTHROPIC_BASE_URL=')
            );

            // Add proxy env vars
            filteredEnv.push(
              `OPENAI_API_KEY=${proxyKey}`,
              `OPENAI_BASE_URL=${apiUrl}/proxy/openai/v1`,
              `ANTHROPIC_API_KEY=${proxyKey}`,
              `ANTHROPIC_BASE_URL=${apiUrl}/proxy/anthropic`
            );

            // Get image from current container
            const imageResult = await sshExec(
              user.server_ip,
              `docker inspect ${cn} --format='{{.Config.Image}}'`
            );
            const image = imageResult.stdout.trim();

            // Get other container settings
            const memResult = await sshExec(
              user.server_ip,
              `docker inspect ${cn} --format='{{.HostConfig.Memory}}'`
            );
            const memBytes = parseInt(memResult.stdout.trim()) || 0;
            const memMb = memBytes > 0 ? Math.floor(memBytes / 1048576) : 2048;

            const cpuResult = await sshExec(
              user.server_ip,
              `docker inspect ${cn} --format='{{.HostConfig.NanoCpus}}'`
            );
            const nanoCpus = parseInt(cpuResult.stdout.trim()) || 0;
            const cpus = nanoCpus > 0 ? (nanoCpus / 1e9).toFixed(1) : '1.0';

            // Get labels
            const labelsResult = await sshExec(
              user.server_ip,
              `docker inspect ${cn} --format='{{json .Config.Labels}}'`
            );
            const labels: Record<string, string> = JSON.parse(labelsResult.stdout.trim() || '{}');

            // Stop and remove old container
            await sshExec(user.server_ip, `docker stop ${cn} 2>/dev/null; docker rm ${cn} 2>/dev/null`);

            // Build docker run command
            const envFlags = filteredEnv.map((e: string) => `-e '${e.replace(/'/g, "'\\''")}'`).join(' ');
            const labelFlags = Object.entries(labels)
              .map(([k, v]) => `--label '${k}=${v}'`)
              .join(' ');

            const startScript = `sh -c 'openclaw doctor --fix 2>/dev/null || true; exec openclaw gateway --port 18789 --bind lan --allow-unconfigured run'`;
            const runCmd = [
              `docker run -d --name ${cn}`,
              `--restart unless-stopped --no-healthcheck --network openclaw-net`,
              `--memory ${memMb}m --memory-swap ${memMb}m --cpus ${cpus}`,
              envFlags,
              `-v /opt/openclaw/instances/${user.id}:/root/.openclaw`,
              labelFlags,
              image,
              `${startScript}`,
            ].join(' ');

            await sshExec(user.server_ip, runCmd);
            console.log(`[inject-keys] Recreated container ${cn} with proxy key`);
          } catch (recreateErr: any) {
            console.warn(`[inject-keys] Container recreate failed for ${user.id}, falling back to restart:`, recreateErr.message);
            await sshExec(user.server_ip, `docker start ${cn} 2>/dev/null; docker restart ${cn} 2>/dev/null`).catch(() => {});
          }
        } else {
          await sshExec(user.server_ip, `docker restart ${cn} 2>/dev/null || true`);
        }

        results.push({ userId: user.id, email: user.email, proxyKey: proxyKey.slice(0, 12) + '...', status: 'success' });
      } catch (err: any) {
        console.error(`[inject-keys] Failed for ${user.id}:`, err.message);
        results.push({ userId: user.id, email: user.email, status: 'failed', error: err.message });
      }
    }

    res.json({ fixed: results.filter(r => r.status === 'success').length, total: users.length, results });
  } catch (err) {
    next(err);
  }
});

export default router;
