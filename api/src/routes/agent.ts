/**
 * Agent routes — container lifecycle, status, logs, embed URL.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ARCHITECTURE DECISIONS — DO NOT CHANGE WITHOUT UNDERSTANDING           │
 * │                                                                        │
 * │ 1. EMBED URL: The /agent/embed-url endpoint returns a URL that the    │
 * │    dashboard opens in an iframe. The URL includes the gateway token   │
 * │    in the query string so the Control UI can connect to the WebSocket.│
 * │    The gateway token is per-user and acts as the auth credential.     │
 * │                                                                        │
 * │ 2. LOG REDACTION: /agent/logs redacts API keys, INTERNAL_SECRET,      │
 * │    CONTAINER_SECRET, and GATEWAY_TOKEN patterns from output. Without  │
 * │    this, the dashboard shows secrets in container logs. Max 500 lines.│
 * │                                                                        │
 * │ 3. BACKGROUND PROVISIONING: POST /agent/open returns 202 immediately │
 * │    and provisions in the background. The dashboard polls /agent/status │
 * │    until status changes from 'provisioning' to 'active'.              │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import db from '../lib/db';
import { wakeContainer, sleepContainer, getContainerStatus, touchActivity } from '../services/sleepWake';
import { restartContainer, provisionUser } from '../services/provisioning';
import { User, Server } from '../types';
import { sshExec } from '../services/ssh';
import { injectApiKeys } from '../services/apiKeys';
import { getUserContainer, reapplyGatewayConfig } from '../services/containerConfig';
import { rateLimitSensitive } from '../middleware/rateLimit';

const router = Router();
router.use(authenticate);

const CONTAINER_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/;

function safeContainerName(name: string | null | undefined, fallbackUserId: string): string {
  const cn = name || `openclaw-${fallbackUserId.slice(0, 12)}`;
  if (!CONTAINER_NAME_RE.test(cn)) throw new Error(`Invalid container name: ${cn}`);
  return cn;
}

/** Track in-flight provisioning so we never duplicate work for the same user. */
const provisioningInFlight = new Map<string, Promise<User>>();

/**
 * Ensure Traefik on a worker has DOCKER_API_VERSION set.
 * Without it, Traefik v3 can't talk to Docker and returns 404 for everything.
 * Returns true if Traefik was recreated (caller should wait a moment).
 */
async function ensureTraefik(serverIp: string): Promise<boolean> {
  try {
    const envCheck = await sshExec(
      serverIp,
      `docker inspect traefik --format='{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null`
    ).catch(() => null);

    if (envCheck?.stdout?.includes('DOCKER_API_VERSION')) return false;

    console.log(`[traefik] Fixing Traefik on ${serverIp} — missing DOCKER_API_VERSION`);
    const traefikCfgB64 = Buffer.from([
      'api:',
      '  dashboard: false',
      'entryPoints:',
      '  web:',
      '    address: ":80"',
      '  websecure:',
      '    address: ":443"',
      'providers:',
      '  docker:',
      '    endpoint: "unix:///var/run/docker.sock"',
      '    exposedByDefault: false',
      '    network: openclaw-net',
    ].join('\n')).toString('base64');

    await sshExec(serverIp, [
      `mkdir -p /opt/openclaw/config`,
      `echo '${traefikCfgB64}' | base64 -d > /opt/openclaw/config/traefik.yml`,
      `docker rm -f traefik 2>/dev/null || true`,
      `docker run -d --name traefik --restart unless-stopped --network openclaw-net -e DOCKER_API_VERSION=$(docker version --format '{{.Server.APIVersion}}' 2>/dev/null || echo 1.44) -p 80:80 -p 443:443 -v /var/run/docker.sock:/var/run/docker.sock:ro -v /opt/openclaw/config/traefik.yml:/etc/traefik/traefik.yml:ro traefik:latest`,
    ].join(' && '));

    console.log(`[traefik] Traefik recreated on ${serverIp} with worker Docker API version`);
    return true;
  } catch (err) {
    console.error(`[traefik] Failed to fix Traefik on ${serverIp}:`, err);
    return false;
  }
}

interface AgentUrlParts {
  url: string;
  baseUrl: string;
  gatewayUrl: string | null;
  gatewayToken: string | null;
  gatewayWsUrl: string | null;
}

/**
 * Build the agent URL with gateway auth token + gatewayUrl so the Control UI
 * auto-connects without requiring the user to paste a token manually.
 * Returns both the full URL and the individual components for iframe embedding.
 */
async function agentUrlParts(subdomain: string, userId: string, server?: Server | null): Promise<AgentUrlParts> {
  const domain = process.env.DOMAIN || 'yourdomain.com';
  const baseUrl = `https://${subdomain}.${domain}`;

  let token: string | null = null;

  const row = await db.getOne<{ gateway_token: string }>(
    'SELECT gateway_token FROM users WHERE id = $1',
    [userId]
  ).catch(() => null);

  if (row?.gateway_token) {
    token = row.gateway_token;
  }

  if (!token && server) {
    try {
      const containerName = safeContainerName(
        (await db.getOne<User>('SELECT container_name FROM users WHERE id = $1', [userId]))?.container_name,
        userId
      );
      const result = await sshExec(
        server.ip,
        `docker exec ${containerName} openclaw config get gateway.auth.token 2>/dev/null`
      );
      const fetched = result.stdout.replace(/["\s]/g, '').trim();
      if (fetched && fetched.length > 8) {
        token = fetched;
        await db.query('UPDATE users SET gateway_token = $1 WHERE id = $2', [token, userId]).catch((e) => console.warn('[agent] gateway_token save failed:', e.message));
      }
    } catch {
      // SSH failed
    }
  }

  if (token) {
    const gatewayWsUrl = `wss://${subdomain}.${domain}`;
    const gatewayUrl = `${gatewayWsUrl}?token=${token}`;
    const wsUrl = encodeURIComponent(gatewayUrl);
    return { url: `${baseUrl}/?gatewayUrl=${wsUrl}&token=${token}`, baseUrl, gatewayUrl, gatewayToken: token, gatewayWsUrl };
  }

  return { url: baseUrl, baseUrl, gatewayUrl: null, gatewayToken: null, gatewayWsUrl: null };
}

async function agentUrl(subdomain: string, userId: string, server?: Server | null): Promise<string> {
  return (await agentUrlParts(subdomain, userId, server)).url;
}

// Get agent status
router.get('/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const status = await getContainerStatus(req.userId!);

    // Quick stats from multiple tables
    const [convResult, activityMsgResult, routingResult, skillsCountResult] = await Promise.all([
      db.getOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM conversations
         WHERE user_id = $1 AND created_at > CURRENT_DATE`,
        [req.userId]
      ),
      db.getOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM activity_log
         WHERE user_id = $1 AND type = 'message' AND created_at > CURRENT_DATE`,
        [req.userId]
      ),
      db.getOne<{ total: string; distinct_msgs: string }>(
        `SELECT COUNT(*) as total,
                COUNT(DISTINCT message_preview) as distinct_msgs
         FROM routing_decisions
         WHERE user_id = $1 AND created_at > CURRENT_DATE
           AND message_preview != '[mode switch]'
           AND message_preview IS NOT NULL`,
        [req.userId]
      ),
      (async () => {
        try {
          const { getUserContainer, readContainerConfig } = await import('../services/containerConfig');
          const { serverIp } = await getUserContainer(req.userId!);
          const config = await readContainerConfig(serverIp, req.userId!);
          const skillEntries = config?.skills?.entries || {};
          const toolEntries = config?.tools || {};
          const skillCount = Object.values(skillEntries)
            .filter((e: any) => e && (e === true || e.enabled !== false)).length;
          const toolCount = Object.values(toolEntries)
            .filter((e: any) => e && (e === true || e.enabled !== false)).length;
          return skillCount + toolCount;
        } catch { return -1; }
      })(),
    ]);

    const convCount = parseInt(convResult?.count || '0');
    const activityMsgCount = parseInt(activityMsgResult?.count || '0');
    const distinctMsgs = parseInt(routingResult?.distinct_msgs || '0');
    const messagesToday = Math.max(convCount, activityMsgCount, distinctMsgs);

    const aiRequests = parseInt(routingResult?.total || '0');

    const containerSkills = typeof skillsCountResult === 'number' ? skillsCountResult : -1;

    const domain = process.env.DOMAIN || 'yourdomain.com';
    const previewUrl = user.subdomain ? `https://preview-${user.subdomain}.${domain}` : null;

    res.json({
      userId: user.id,
      email: user.email,
      status,
      subscriptionStatus: user.status,
      subdomain: user.subdomain,
      plan: user.plan,
      lastActive: user.last_active,
      createdAt: user.created_at,
      isAdmin: user.is_admin || false,
      previewUrl,
      stats: {
        messagesToday,
        aiRequestsToday: aiRequests,
        activeSkills: containerSkills >= 0 ? containerSkills : 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Fast embed URL lookup — returns the gateway URL + token for iframe embedding
 * without triggering provisioning or wake. Returns null fields if unavailable.
 */
router.get('/embed-url', requireActiveSubscription, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.subdomain) {
      return res.json({ available: false, reason: 'not_provisioned', subscriptionStatus: user.status });
    }

    if (user.status === 'cancelled') {
      return res.json({ available: false, reason: 'cancelled', subscriptionStatus: user.status });
    }
    if (user.status === 'paused') {
      return res.json({ available: false, reason: 'paused', subscriptionStatus: user.status });
    }

    const server = user.server_id
      ? await db.getOne<Server>('SELECT * FROM servers WHERE id = $1', [user.server_id])
      : null;

    const parts = await agentUrlParts(user.subdomain, user.id, server);
    return res.json({
      available: true,
      url: parts.url,
      gatewayUrl: parts.gatewayUrl,
      gatewayWsUrl: parts.gatewayWsUrl,
      gatewayToken: parts.gatewayToken,
      subscriptionStatus: user.status,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Ensure the user's agent is provisioned and running, then return its URL.
 * - No container yet → full provision (creates worker if needed, builds image, starts container)
 * - Sleeping → wake it
 * - Already active → return URL immediately
 */
router.post('/open', rateLimitSensitive, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status === 'pending') {
      return res.status(403).json({ error: 'Please choose a plan and complete payment first.' });
    }
    if (user.status === 'cancelled') {
      return res.status(403).json({ error: 'Subscription cancelled. Please resubscribe.' });
    }
    if (user.status === 'paused') {
      return res.status(403).json({ error: 'Agent paused — update your subscription or payment to resume.' });
    }
    if (!user.stripe_customer_id && user.status === 'provisioning') {
      console.warn(`[agent/open] User ${user.id} in provisioning but no stripe_customer_id — rejecting (no payment)`);
      return res.status(403).json({ error: 'Payment not confirmed. Please complete checkout.' });
    }

    const respond = (parts: AgentUrlParts, status: string) =>
      res.json({ url: parts.url, status, gatewayUrl: parts.gatewayUrl, gatewayWsUrl: parts.gatewayWsUrl, gatewayToken: parts.gatewayToken });

    // Case 1: never provisioned (no server assigned)
    if (!user.server_id || !user.subdomain) {
      if (provisioningInFlight.has(user.id)) {
        return res.status(202).json({ status: 'provisioning', message: 'Agent is being set up — this takes a few minutes for a new server...' });
      }

      console.log(`[agent/open] User ${user.id} not provisioned — starting background provisioning`);
      await db.query(`UPDATE users SET status = 'provisioning' WHERE id = $1`, [user.id]);

      const promise = provisionUser({
        userId: user.id,
        email: user.email,
        plan: user.plan,
        stripeCustomerId: user.stripe_customer_id || undefined,
      }).catch((err) => {
        console.error(`[agent/open] Background provisioning failed for ${user.id}: ${err.message}`);
        // Log the full error for debugging
        if (err.stack) console.error(`[agent/open] Stack: ${err.stack}`);
        throw err;
      }).finally(() => {
        provisioningInFlight.delete(user.id);
      });
      provisioningInFlight.set(user.id, promise);

      return res.status(202).json({ status: 'provisioning', message: 'Agent is being set up — this takes a few minutes for a new server...' });
    }

    // Resolve the server once for token retrieval
    const server = user.server_id
      ? await db.getOne<Server>('SELECT * FROM servers WHERE id = $1', [user.server_id])
      : null;

    // Proactively fix Traefik on existing workers (don't await — runs in background)
    if (server) {
      ensureTraefik(server.ip).catch((err) => console.warn(`[agent/open] ensureTraefik failed:`, err.message));
    }

    // Ensure API keys + model router config are injected (fixes existing users)
    const cn = safeContainerName(user.container_name, user.id);
    if (server) {
      injectApiKeys(server.ip, user.id, cn, user.plan as any)
        .then(() => new Promise(r => setTimeout(r, 5000)))
        .then(() => reapplyGatewayConfig(server.ip, user.id, cn))
        .catch((err) =>
          console.warn(`[agent/open] Key injection failed for ${user.id}:`, err.message)
        );
    }

    // Case 2: sleeping — wake it up
    if (user.status === 'sleeping') {
      console.log(`[agent/open] Waking container for ${user.id}`);
      await wakeContainer(user.id);
      // Wait for gateway to finish startup init, then re-apply auth config
      if (server) {
        setTimeout(() => {
          reapplyGatewayConfig(server.ip, user.id, cn).catch(() => {});
        }, 10000);
      }
      return respond(await agentUrlParts(user.subdomain!, user.id, server), 'active');
    }

    // Case 3a: provisioning completed but gateway wasn't reachable — re-check now
    if (user.status === 'starting') {
      if (server) {
        const containerName = safeContainerName(user.container_name, user.id);
        const check = await sshExec(server.ip, `docker inspect ${containerName} --format='{{.State.Running}}' 2>/dev/null`).catch(() => null);
        if (check && check.stdout.includes('true')) {
          let currentStatus = 'starting';
          try {
            const { waitForReady } = await import('../services/ssh');
            await waitForReady(server.ip, containerName, 15000);
            await db.query(`UPDATE users SET status = 'active', last_active = NOW() WHERE id = $1`, [user.id]);
            currentStatus = 'active';
          } catch {
            reapplyGatewayConfig(server.ip, user.id, containerName).catch(() => {});
          }
          return respond(await agentUrlParts(user.subdomain!, user.id, server), currentStatus);
        }
      }
      // Container not found — fall through to re-provision below
    }

    // Case 3b: still provisioning from a previous attempt — verify the container actually exists
    if (user.status === 'provisioning' || (user.status === 'starting' && !server)) {
      if (server) {
        const containerName = safeContainerName(user.container_name, user.id);
        const check = await sshExec(server.ip, `docker inspect ${containerName} --format='{{.State.Running}}' 2>/dev/null`).catch(() => null);
        if (check && check.stdout.includes('true')) {
          await db.query(`UPDATE users SET status = 'active', last_active = NOW() WHERE id = $1`, [user.id]);
          return respond(await agentUrlParts(user.subdomain!, user.id, server), 'active');
        }
      }

      // Already being provisioned in background — tell dashboard to keep polling
      if (provisioningInFlight.has(user.id)) {
        return res.status(202).json({ status: 'provisioning', message: 'Agent is being set up — this takes a few minutes for a new server...' });
      }

      // Stuck in provisioning with no background job — re-provision
      console.log(`[agent/open] User ${user.id} stuck in provisioning — starting background re-provision`);
      const promise = provisionUser({
        userId: user.id,
        email: user.email,
        plan: user.plan,
        stripeCustomerId: user.stripe_customer_id || undefined,
      }).catch((err) => {
        console.error(`[agent/open] Background re-provisioning failed for ${user.id}:`, err.message);
        throw err;
      }).finally(() => {
        provisioningInFlight.delete(user.id);
      });
      provisioningInFlight.set(user.id, promise);

      return res.status(202).json({ status: 'provisioning', message: 'Agent is being set up — this takes a few minutes for a new server...' });
    }

    // Case 4: active or grace_period — verify the container is actually running
    if (server) {
      const containerName = safeContainerName(user.container_name, user.id);
      const check = await sshExec(server.ip, `docker inspect ${containerName} --format='{{.State.Running}}' 2>/dev/null`).catch(() => null);
      if (!check || !check.stdout.includes('true')) {
        console.log(`[agent/open] Container for ${user.id} not running — restarting`);
        const startResult = await sshExec(server.ip, `docker start ${containerName} 2>/dev/null`).catch(() => null);
        if (!startResult || startResult.code !== 0) {
          if (provisioningInFlight.has(user.id)) {
            return res.status(202).json({ status: 'provisioning', message: 'Agent is being re-created...' });
          }

          console.log(`[agent/open] Container missing — background re-provisioning`);
          const promise = provisionUser({
            userId: user.id,
            email: user.email,
            plan: user.plan,
            stripeCustomerId: user.stripe_customer_id || undefined,
          }).catch((err) => {
            console.error(`[agent/open] Re-provisioning failed for ${user.id}:`, err.message);
            throw err;
          }).finally(() => {
            provisioningInFlight.delete(user.id);
          });
          provisioningInFlight.set(user.id, promise);

          return res.status(202).json({ status: 'provisioning', message: 'Agent is being re-created...' });
        }
        // Container was stopped and just started — wait for gateway init, then re-apply auth
        setTimeout(() => {
          reapplyGatewayConfig(server.ip, user.id, containerName).catch(() => {});
        }, 10000);
      }
    }

    await touchActivity(user.id);
    return respond(await agentUrlParts(user.subdomain!, user.id, server), 'active');
  } catch (err) {
    next(err);
  }
});

// Start/wake agent
router.post('/start', requireActiveSubscription, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await wakeContainer(req.userId!);
    res.json({ status: 'active' });
  } catch (err) {
    next(err);
  }
});

// Stop/sleep agent
router.post('/stop', requireActiveSubscription, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User & { server_ip: string }>(
      `SELECT u.*, s.ip as server_ip FROM users u
       JOIN servers s ON s.id = u.server_id
       WHERE u.id = $1`,
      [req.userId]
    );
    if (user) await sleepContainer(user);
    res.json({ status: 'sleeping' });
  } catch (err) {
    next(err);
  }
});

// Restart agent
router.post('/restart', rateLimitSensitive, requireActiveSubscription, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await restartContainer(req.userId!);
    res.json({ status: 'restarting' });
  } catch (err) {
    next(err);
  }
});

// Get container logs
router.get('/logs', requireActiveSubscription, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!user?.server_id) return res.json({ logs: '' });

    const server = await db.getOne<Server>('SELECT * FROM servers WHERE id = $1', [user.server_id]);
    if (!server) return res.json({ logs: '' });

    const lines = Math.min(parseInt(req.query.lines as string) || 100, 500);
    const containerName = safeContainerName(user.container_name, req.userId!);
    const result = await sshExec(server.ip, `docker logs --tail ${lines} ${containerName} 2>&1`);

    // Redact secrets from log output
    result.stdout = result.stdout
      .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED]')
      .replace(/val_sk_[a-zA-Z0-9]+/g, '[REDACTED]')
      .replace(/INTERNAL_SECRET=[^\s]+/g, 'INTERNAL_SECRET=[REDACTED]')
      .replace(/CONTAINER_SECRET=[^\s]+/g, 'CONTAINER_SECRET=[REDACTED]')
      .replace(/GATEWAY_TOKEN=[^\s]+/g, 'GATEWAY_TOKEN=[REDACTED]')
      .replace(/OPENAI_API_KEY=[^\s]+/g, 'OPENAI_API_KEY=[REDACTED]')
      .replace(/ANTHROPIC_API_KEY=[^\s]+/g, 'ANTHROPIC_API_KEY=[REDACTED]')
      .replace(/OPENROUTER_API_KEY=[^\s]+/g, 'OPENROUTER_API_KEY=[REDACTED]')
      .replace(/BROWSERLESS_TOKEN=[^\s]+/g, 'BROWSERLESS_TOKEN=[REDACTED]')
      .replace(/BROWSERLESS_URL=[^\s]+/g, 'BROWSERLESS_URL=[REDACTED]')
      .replace(/GEMINI_API_KEY=[^\s]+/g, 'GEMINI_API_KEY=[REDACTED]')
      .replace(/[a-f0-9]{64}/gi, '[REDACTED-TOKEN]');

    res.json({ logs: result.stdout });
  } catch (err) {
    next(err);
  }
});

/**
 * Server-side readiness probe: SSH into the worker and curl the container
 * through Traefik to confirm routing works end-to-end.
 * Auto-fixes broken Traefik (missing DOCKER_API_VERSION) when detected.
 */
router.get('/ready', requireActiveSubscription, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!user?.server_id || !user?.subdomain) {
      console.log(`[ready] User ${req.userId} not provisioned`);
      return res.json({ ready: false, reason: 'not_provisioned' });
    }

    const server = await db.getOne<Server>('SELECT * FROM servers WHERE id = $1', [user.server_id]);
    if (!server) {
      console.log(`[ready] Server ${user.server_id} not found for user ${req.userId}`);
      return res.json({ ready: false, reason: 'no_server' });
    }

    const containerName = safeContainerName(user.container_name, user.id);

    // 1. Check if container is running
    const inspect = await sshExec(
      server.ip,
      `docker inspect ${containerName} --format='{{.State.Running}}' 2>/dev/null`
    ).catch((err) => {
      console.error(`[ready] SSH to ${server.ip} failed:`, err.message);
      return null;
    });

    if (!inspect || !inspect.stdout.includes('true')) {
      const readyLogs = await sshExec(server.ip, `docker logs --tail 15 ${containerName} 2>&1`).catch(() => null);
      console.log(`[ready] Container ${containerName} not running on ${server.ip}. Logs: ${readyLogs?.stdout?.slice(-200) || 'none'}`);
      return res.json({
        ready: false,
        reason: 'container_not_running',
        detail: 'Container is starting up...',
      });
    }

    // 2. Check Traefik can route to it
    const domain = process.env.DOMAIN || 'yourdomain.com';
    const hostHeader = `${user.subdomain}.${domain}`;
    const probe = await sshExec(
      server.ip,
      `curl -o /dev/null -w '%{http_code}' -H 'Host: ${hostHeader}' --max-time 5 http://127.0.0.1/ 2>/dev/null`
    ).catch(() => null);

    const httpCode = (probe?.stdout?.trim() || '000').slice(-3);
    const isReady = httpCode === '200' || httpCode === '101';

    if (isReady) {
      if (user.status === 'starting' || user.status === 'provisioning') {
        await db.query(`UPDATE users SET status = 'active', last_active = NOW() WHERE id = $1`, [user.id]);
        console.log(`[ready] Auto-promoted user ${user.id} from '${user.status}' to 'active'`);
      }
      return res.json({ ready: true, httpCode });
    }

    console.log(`[ready] Traefik probe for ${hostHeader} on ${server.ip} returned HTTP ${httpCode}`);

    // 3. Auto-fix: if Traefik returns 404, it likely can't discover containers
    if (httpCode === '404' || httpCode === '000') {
      const wasFixed = await ensureTraefik(server.ip);
      if (wasFixed) {
        return res.json({
          ready: false,
          reason: 'traefik_fixed',
          detail: 'Fixing routing, retrying shortly...',
          httpCode,
        });
      }
    }

    return res.json({
      ready: false,
      reason: 'routing_not_ready',
      detail: `Routing not ready (HTTP ${httpCode})`,
      httpCode,
    });
  } catch (err) {
    next(err);
  }
});

// Touch activity (called by frontend periodically)
router.post('/heartbeat', requireActiveSubscription, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await touchActivity(req.userId!);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Chat is handled entirely by the gateway (iframe). No duplicate chat system.

export default router;
