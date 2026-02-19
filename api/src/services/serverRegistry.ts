import db from '../lib/db';
import { Server } from '../types';
import { sshExec } from './ssh';
import { hostingerManager } from './hostinger';

export async function findBestServer(requiredRamMb = 2048): Promise<Server> {
  // Pack servers: pick the most loaded one that still has room
  const server = await db.getOne<Server>(
    `SELECT * FROM servers
     WHERE status = 'active'
       AND (ram_total - ram_used) >= $1
     ORDER BY ram_used DESC
     LIMIT 1`,
    [requiredRamMb]
  );

  if (server) return server;

  console.log('No available servers — provisioning new one');
  await hostingerManager.provisionNewServer();
  const newServer = await waitForNewServer();
  return newServer;
}

async function waitForNewServer(timeoutMs = 300000): Promise<Server> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const server = await db.getOne<Server>(
      `SELECT * FROM servers
       WHERE status = 'active'
         AND registered_at > NOW() - INTERVAL '10 minutes'
         AND (ram_total - ram_used) >= 2048
       ORDER BY registered_at DESC
       LIMIT 1`
    );
    if (server) return server;
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error('Timeout waiting for new server to register');
}

export async function registerServer(ip: string, ramTotal: number, hostname: string, hostingerId?: string): Promise<Server> {
  const existing = await db.getOne<Server>('SELECT * FROM servers WHERE ip = $1', [ip]);
  if (existing) {
    await db.query(
      `UPDATE servers SET status = 'active', ram_total = $1 WHERE ip = $2`,
      [ramTotal, ip]
    );
    return { ...existing, status: 'active', ram_total: ramTotal };
  }

  const result = await db.query<Server>(
    `INSERT INTO servers (ip, hostname, hostinger_id, ram_total, status)
     VALUES ($1, $2, $3, $4, 'active')
     RETURNING *`,
    [ip, hostname, hostingerId || null, ramTotal]
  );
  return result.rows[0];
}

export async function updateServerRam(serverId: string): Promise<void> {
  // Sum RAM of all active/sleeping containers
  const result = await db.getOne<{ total: string }>(
    `SELECT COALESCE(SUM(
      CASE u.plan
        WHEN 'starter' THEN 1024
        WHEN 'pro' THEN 2048
        WHEN 'business' THEN 4096
        ELSE 2048
      END
    ), 0) as total
     FROM users u
     WHERE u.server_id = $1
       AND u.status IN ('active', 'sleeping', 'provisioning')`,
    [serverId]
  );

  await db.query('UPDATE servers SET ram_used = $1 WHERE id = $2', [
    parseInt(result?.total || '0'),
    serverId,
  ]);
}

export async function getServerLoad(): Promise<Array<Server & { user_count: number }>> {
  return db.getMany(
    `SELECT s.*, COUNT(u.id) as user_count
     FROM servers s
     LEFT JOIN users u ON u.server_id = s.id AND u.status != 'cancelled'
     WHERE s.status = 'active'
     GROUP BY s.id
     ORDER BY s.ram_used DESC`
  );
}

export async function checkCapacity(): Promise<void> {
  const servers = await db.getMany<Server>('SELECT * FROM servers WHERE status = $1', ['active']);

  for (const server of servers) {
    const usedPercent = (server.ram_used / server.ram_total) * 100;
    if (usedPercent > 85) {
      console.log(`Server ${server.hostname} at ${usedPercent.toFixed(1)}% — triggering provisioning`);
      await hostingerManager.provisionNewServer();
      return; // Only provision one at a time
    }
  }
}
