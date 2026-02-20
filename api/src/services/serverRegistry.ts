import db from '../lib/db';
import { Server } from '../types';
import { cloudProvider } from './cloudProvider';

const controlPlaneIp = (): string | null =>
  process.env.CONTROL_PLANE_IP?.trim() || null;

/** Single-flight: only one "provision new server" at a time to avoid duplicate VPS. */
let provisionInProgress: Promise<Server> | null = null;

/** Never run user containers on the control plane — only on dedicated worker servers. */
export async function findBestServer(requiredRamMb = 2048): Promise<Server> {
  const cpIp = controlPlaneIp();
  let server = await db.getOne<Server>(
    `SELECT * FROM servers
     WHERE status = 'active'
       AND (ram_total - ram_used) >= $1
       AND ($2::text IS NULL OR ip != $2)
     ORDER BY ram_used DESC
     LIMIT 1`,
    [requiredRamMb, cpIp]
  );

  if (server) return server;

  if (provisionInProgress) {
    console.log('Another request is already provisioning a worker — waiting');
    server = await provisionInProgress;
    const hasCapacity = server && (server.ram_total - server.ram_used) >= requiredRamMb;
    if (hasCapacity) return server;
    provisionInProgress = null;
  }

  provisionInProgress = (async () => {
    try {
      server = await db.getOne<Server>(
        `SELECT * FROM servers
         WHERE status = 'active'
           AND (ram_total - ram_used) >= $1
           AND ($2::text IS NULL OR ip != $2)
         ORDER BY ram_used DESC
         LIMIT 1`,
        [requiredRamMb, cpIp]
      );
      if (server) return server;

      console.log('No worker servers available — provisioning new worker');
      await cloudProvider.provisionNewServer();
      const newServer = await waitForNewServer();
      return newServer;
    } finally {
      provisionInProgress = null;
    }
  })();

  return provisionInProgress;
}

async function waitForNewServer(timeoutMs = 600000): Promise<Server> {
  const start = Date.now();
  const cpIp = controlPlaneIp();
  while (Date.now() - start < timeoutMs) {
    const server = await db.getOne<Server>(
      `SELECT * FROM servers
       WHERE status = 'active'
         AND registered_at > NOW() - INTERVAL '10 minutes'
         AND (ram_total - ram_used) >= 2048
         AND ($1::text IS NULL OR ip != $1)
       ORDER BY registered_at DESC
       LIMIT 1`,
      [cpIp]
    );
    if (server) return server;
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error('Timeout waiting for new worker server to register');
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
  const cpIp = controlPlaneIp();
  return db.getMany(
    `SELECT s.*, COUNT(u.id) as user_count
     FROM servers s
     LEFT JOIN users u ON u.server_id = s.id AND u.status != 'cancelled'
     WHERE s.status = 'active'
       AND ($1::text IS NULL OR s.ip != $1)
     GROUP BY s.id
     ORDER BY s.ram_used DESC`,
    [cpIp]
  );
}

export async function checkCapacity(): Promise<void> {
  const cpIp = controlPlaneIp();
  const servers = await db.getMany<Server>(
    `SELECT * FROM servers
     WHERE status = 'active'
       AND ($1::text IS NULL OR ip != $1)`,
    [cpIp]
  );

  for (const server of servers) {
    const usedPercent = (server.ram_used / server.ram_total) * 100;
    if (usedPercent > 85) {
      console.log(`Worker ${server.hostname} at ${usedPercent.toFixed(1)}% — ensuring extra capacity`);
      await findBestServer(2048);
      return;
    }
  }
}
