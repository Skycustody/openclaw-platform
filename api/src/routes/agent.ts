import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import db from '../lib/db';
import { wakeContainer, sleepContainer, getContainerStatus, touchActivity } from '../services/sleepWake';
import { restartContainer, provisionUser } from '../services/provisioning';
import { User, Server } from '../types';
import { sshExec } from '../services/ssh';

const router = Router();
router.use(authenticate);

// Get agent status
router.get('/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const status = await getContainerStatus(req.userId!);

    // Quick stats from Redis/DB
    const [messagesResult, tokensResult, cronResult] = await Promise.all([
      db.getOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM conversations
         WHERE user_id = $1 AND created_at > CURRENT_DATE`,
        [req.userId]
      ),
      db.getOne<{ total: string }>(
        `SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM token_transactions
         WHERE user_id = $1 AND type = 'usage' AND created_at > CURRENT_DATE`,
        [req.userId]
      ),
      db.getOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM cron_jobs WHERE user_id = $1 AND enabled = true`,
        [req.userId]
      ),
    ]);

    res.json({
      status,
      subscriptionStatus: user.status,
      subdomain: user.subdomain,
      plan: user.plan,
      lastActive: user.last_active,
      createdAt: user.created_at,
      stats: {
        messagesToday: parseInt(messagesResult?.count || '0'),
        tokensToday: parseInt(tokensResult?.total || '0'),
        activeSkills: parseInt(cronResult?.count || '0'),
      },
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
router.post('/open', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status === 'cancelled') {
      return res.status(403).json({ error: 'Subscription cancelled. Please resubscribe.' });
    }
    if (user.status === 'paused') {
      return res.status(403).json({ error: 'Agent paused — you need more tokens.' });
    }

    const domain = process.env.DOMAIN || 'yourdomain.com';

    // Case 1: never provisioned (no server assigned)
    if (!user.server_id || !user.subdomain) {
      console.log(`[agent/open] User ${user.id} not provisioned — starting provisioning`);
      const provisioned = await provisionUser({
        userId: user.id,
        email: user.email,
        plan: user.plan,
        stripeCustomerId: user.stripe_customer_id || undefined,
      });
      return res.json({
        url: `https://${provisioned.subdomain}.${domain}`,
        status: 'active',
      });
    }

    // Case 2: sleeping — wake it up
    if (user.status === 'sleeping') {
      console.log(`[agent/open] Waking container for ${user.id}`);
      await wakeContainer(user.id);
      return res.json({
        url: `https://${user.subdomain}.${domain}`,
        status: 'active',
      });
    }

    // Case 3: still provisioning from a previous attempt — verify the container actually exists
    if (user.status === 'provisioning') {
      const server = await db.getOne<Server>('SELECT * FROM servers WHERE id = $1', [user.server_id]);
      if (server) {
        const containerName = user.container_name || `openclaw-${user.id}`;
        const check = await sshExec(server.ip, `docker inspect ${containerName} --format='{{.State.Running}}' 2>/dev/null`).catch(() => null);
        if (check && check.stdout.includes('true')) {
          await db.query(`UPDATE users SET status = 'active', last_active = NOW() WHERE id = $1`, [user.id]);
          return res.json({ url: `https://${user.subdomain}.${domain}`, status: 'active' });
        }
      }
      // Container doesn't exist — re-provision
      console.log(`[agent/open] User ${user.id} stuck in provisioning — re-provisioning`);
      const provisioned = await provisionUser({
        userId: user.id,
        email: user.email,
        plan: user.plan,
        stripeCustomerId: user.stripe_customer_id || undefined,
      });
      return res.json({
        url: `https://${provisioned.subdomain}.${domain}`,
        status: 'active',
      });
    }

    // Case 4: active or grace_period — verify the container is actually running
    if (user.server_id) {
      const server = await db.getOne<Server>('SELECT * FROM servers WHERE id = $1', [user.server_id]);
      if (server) {
        const containerName = user.container_name || `openclaw-${user.id}`;
        const check = await sshExec(server.ip, `docker inspect ${containerName} --format='{{.State.Running}}' 2>/dev/null`).catch(() => null);
        if (!check || !check.stdout.includes('true')) {
          console.log(`[agent/open] Container for ${user.id} not running — restarting`);
          const startResult = await sshExec(server.ip, `docker start ${containerName} 2>/dev/null`).catch(() => null);
          if (!startResult || startResult.code !== 0) {
            console.log(`[agent/open] Container missing — re-provisioning`);
            const provisioned = await provisionUser({
              userId: user.id,
              email: user.email,
              plan: user.plan,
              stripeCustomerId: user.stripe_customer_id || undefined,
            });
            return res.json({ url: `https://${provisioned.subdomain}.${domain}`, status: 'active' });
          }
        }
      }
    }

    await touchActivity(user.id);
    return res.json({
      url: `https://${user.subdomain}.${domain}`,
      status: 'active',
    });
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
router.post('/restart', requireActiveSubscription, async (req: AuthRequest, res: Response, next: NextFunction) => {
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

    const lines = parseInt(req.query.lines as string) || 100;
    const containerName = user.container_name || `openclaw-${req.userId}`;
    const result = await sshExec(server.ip, `docker logs --tail ${lines} ${containerName} 2>&1`);

    res.json({ logs: result.stdout });
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

export default router;
