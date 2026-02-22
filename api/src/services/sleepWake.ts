import db from '../lib/db';
import redis from '../lib/redis';
import { sshExec, waitForReady } from './ssh';
import { updateServerRam } from './serverRegistry';
import { User, Server } from '../types';

const SLEEP_AFTER_MINUTES = 30;

export async function runSleepCycle(): Promise<{ slept: number }> {
  let slept = 0;

  const users = await db.getMany<User & { server_ip: string }>(
    `SELECT u.*, s.ip as server_ip
     FROM users u
     JOIN servers s ON s.id = u.server_id
     WHERE u.status = 'active'`
  );

  for (const user of users) {
    const idleMinutes = (Date.now() - new Date(user.last_active).getTime()) / 60000;
    const ageMinutes = (Date.now() - new Date(user.created_at).getTime()) / 60000;

    // Don't sleep containers less than 60 minutes old (just provisioned)
    if (ageMinutes < 60) continue;

    if (idleMinutes >= SLEEP_AFTER_MINUTES) {
      try {
        await sleepContainer(user);
        slept++;
      } catch (err) {
        console.error(`Failed to sleep container for ${user.id}:`, err);
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
  // Atomic status transition: only proceed if currently sleeping
  const user = await db.getOne<User>(
    `UPDATE users SET status = 'active' WHERE id = $1 AND status = 'sleeping' RETURNING *`,
    [userId]
  );
  if (!user) {
    const current = await db.getOne<User>('SELECT status FROM users WHERE id = $1', [userId]);
    if (!current) throw new Error(`User not found: ${userId}`);
    if (current.status === 'active') return;
    if (current.status === 'cancelled' || current.status === 'paused') {
      throw new Error(`Cannot wake ${current.status} container`);
    }
    return; // Already being woken by another request
  }

  const server = await db.getOne<Server>('SELECT * FROM servers WHERE id = $1', [user.server_id]);
  if (!server) throw new Error(`Server not found for user ${userId}`);

  const containerName = user.container_name || `openclaw-${userId}`;

  // Data persists via host volume mount, just start the container
  await sshExec(server.ip, `docker start ${containerName}`);

  try {
    await waitForReady(server.ip, containerName, 30000);
  } catch {
    console.warn(`Container ${containerName} started but health check timed out`);
  }

  await db.query(
    `UPDATE users SET status = 'active', last_active = NOW() WHERE id = $1`,
    [userId]
  );

  await updateServerRam(server.id);
  await redis.set(`container:status:${userId}`, 'active', 'EX', 300);
  console.log(`Container woke: ${containerName}`);
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
