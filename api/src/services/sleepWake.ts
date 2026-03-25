/**
 * Sleep/Wake — idle containers are stopped to free RAM, then restarted on demand.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ARCHITECTURE DECISIONS — DO NOT CHANGE WITHOUT UNDERSTANDING           │
 * │                                                                        │
 * │ 1. ATOMIC WAKE: wakeContainer() uses UPDATE...WHERE status='sleeping' │
 * │    RETURNING * to prevent duplicate wakes. Multiple concurrent POST   │
 * │    /agent/open requests all trigger wake — without the atomic check,  │
 * │    the container would restart multiple times and sometimes crash.    │
 * │                                                                        │
 * │ 2. API KEY RE-INJECTION: After waking, injectApiKeys() re-writes     │
 * │    OpenRouter keys and config. Docker stop/start preserves volumes,  │
 * │    but config may change while sleeping (e.g. user changed models).  │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import db from '../lib/db';
import redis from '../lib/redis';
import { sshExec, waitForReady } from './ssh';
import { updateServerRam } from './serverRegistry';
import { reapplyGatewayConfig } from './containerConfig';
import { User, Server } from '../types';

const SLEEP_AFTER_MINUTES = 30;

export async function runSleepCycle(): Promise<{ slept: number }> {
  let slept = 0;

  const users = await db.getMany<User & { server_ip: string; has_channels: boolean }>(
    `SELECT u.*, s.ip as server_ip,
       COALESCE(
         c.telegram_connected OR c.discord_connected OR c.slack_connected OR c.whatsapp_connected,
         false
       ) as has_channels
     FROM users u
     JOIN servers s ON s.id = u.server_id
     LEFT JOIN user_channels c ON c.user_id = u.id
     WHERE u.status = 'active'`
  );

  if (users.length > 0) {
    console.log(`[sleep] Checking ${users.length} active containers for idle timeout (>${SLEEP_AFTER_MINUTES}min)`);
  }

  for (const user of users) {
    const idleMinutes = (Date.now() - new Date(user.last_active).getTime()) / 60000;
    const ageMinutes = (Date.now() - new Date(user.created_at).getTime()) / 60000;

    if (ageMinutes < 60) continue;

    if (user.has_channels) continue;

    if (idleMinutes >= SLEEP_AFTER_MINUTES) {
      try {
        console.log(`[sleep] Sleeping ${user.container_name || user.id} (idle ${idleMinutes.toFixed(0)}min)`);
        await sleepContainer(user);
        slept++;
      } catch (err: any) {
        console.error(`[sleep] Failed to sleep container for ${user.id}: ${err.message}`);
      }
    }
  }

  return { slept };
}

export async function sleepContainer(user: User & { server_ip?: string }): Promise<void> {
  let serverIp = (user as any).server_ip;
  if (!serverIp && user.server_id) {
    const server = await db.getOne<Server>('SELECT * FROM servers WHERE id = $1', [user.server_id]);
    if (!server) throw new Error(`Server not found for user ${user.id}`);
    serverIp = server.ip;
  }

  const containerName = user.container_name || `openclaw-${user.id}`;

  // Data persists via host volume mount (/opt/openclaw/instances/{userId}), no S3 needed
  await sshExec(serverIp, `docker stop ${containerName}`);

  await db.query(
    `UPDATE users SET status = 'sleeping' WHERE id = $1`,
    [user.id]
  );

  if (user.server_id) {
    await updateServerRam(user.server_id);
  }

  await redis.del(`container:status:${user.id}`);
  console.log(`Container slept: ${containerName}`);
}

export async function wakeContainer(userId: string): Promise<void> {
  const startTime = Date.now();
  console.log(`[wake] Waking container for user ${userId}`);

  // Atomic status transition: only proceed if currently sleeping
  const user = await db.getOne<User>(
    `UPDATE users SET status = 'active' WHERE id = $1 AND status = 'sleeping' RETURNING *`,
    [userId]
  );
  if (!user) {
    const current = await db.getOne<User>('SELECT status FROM users WHERE id = $1', [userId]);
    if (!current) throw new Error(`User not found: ${userId}`);
    if (current.status === 'active') {
      console.log(`[wake] User ${userId} already active`);
      return;
    }
    if (current.status === 'cancelled' || current.status === 'paused') {
      console.warn(`[wake] Cannot wake ${current.status} container for ${userId}`);
      throw new Error(`Cannot wake ${current.status} container`);
    }
    console.log(`[wake] User ${userId} status=${current.status}, already being woken`);
    return;
  }

  const server = await db.getOne<Server>('SELECT * FROM servers WHERE id = $1', [user.server_id]);
  if (!server) {
    console.error(`[wake] Server ${user.server_id} not found for user ${userId}`);
    throw new Error(`Server not found for user ${userId}`);
  }

  const containerName = user.container_name || `openclaw-${userId}`;
  console.log(`[wake] Starting container ${containerName} on ${server.ip}`);

  // Clear stale session locks before starting — a previous session may have left
  // .lock files that block all messages with "session file locked (timeout)"
  await sshExec(server.ip,
    `rm -f /opt/openclaw/instances/${userId}/agents/*/sessions/*.lock 2>/dev/null`
  ).catch(() => {});

  await sshExec(server.ip, `docker start ${containerName}`);

  try {
    await waitForReady(server.ip, containerName, 30000);
    console.log(`[wake] Container ${containerName} health check passed (${Date.now() - startTime}ms)`);
  } catch {
    console.warn(`[wake] Container ${containerName} started but health check timed out (${Date.now() - startTime}ms)`);
  }

  await reapplyGatewayConfig(server.ip, userId, containerName);

  await db.query(
    `UPDATE users SET status = 'active', last_active = NOW() WHERE id = $1`,
    [userId]
  );

  await updateServerRam(server.id);
  await redis.set(`container:status:${userId}`, 'active', 'EX', 300);
  console.log(`[wake] Container ${containerName} woke (${Date.now() - startTime}ms)`);
}

export async function touchActivity(userId: string): Promise<void> {
  await db.query('UPDATE users SET last_active = NOW() WHERE id = $1', [userId]);
  await redis.set(`last_active:${userId}`, Date.now().toString(), 'EX', 3600);
}

export async function getContainerStatus(userId: string): Promise<string> {
  const cached = await redis.get(`container:status:${userId}`);
  if (cached) return cached;

  const user = await db.getOne<User>('SELECT status FROM users WHERE id = $1', [userId]);
  return user?.status || 'unknown';
}
