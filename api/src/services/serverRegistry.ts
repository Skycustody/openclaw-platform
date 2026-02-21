import db from '../lib/db';
import { Server } from '../types';
import { cloudProvider } from './cloudProvider';
import { sshExec } from './ssh';

const controlPlaneIp = (): string | null =>
  process.env.CONTROL_PLANE_IP?.trim() || null;

/** Single-flight: only one "provision new server" at a time to avoid duplicate VPS. */
let provisionInProgress: Promise<Server> | null = null;

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

  // Single-server fallback: if no dedicated workers exist, use any server (including control plane)
  if (cpIp) {
    server = await db.getOne<Server>(
      `SELECT * FROM servers
       WHERE status = 'active'
         AND (ram_total - ram_used) >= $1
       ORDER BY ram_used DESC
       LIMIT 1`,
      [requiredRamMb]
    );
    if (server) {
      console.log('No dedicated worker servers — using control plane as fallback');
      return server;
    }
  }

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
         ORDER BY ram_used DESC
         LIMIT 1`,
        [requiredRamMb]
      );
      if (server) return server;

      if (!process.env.HETZNER_API_TOKEN) {
        throw new Error(
          'No worker servers registered and HETZNER_API_TOKEN is not set. ' +
          'Register your server first: curl -X POST http://localhost:3001/webhooks/servers/register ' +
          '-H "Content-Type: application/json" -H "x-internal-secret: YOUR_SECRET" ' +
          '-d \'{"ip": "YOUR_SERVER_IP", "ram": SERVER_RAM_MB, "hostname": "srv1"}\''
        );
      }

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
        WHEN 'starter' THEN 2048
        WHEN 'pro' THEN 4096
        WHEN 'business' THEN 8192
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

export interface ContainerMemStat {
  name: string;
  memUsage: string;
  memPerc: string;
}

export interface WorkerStatsResult {
  id: string;
  hostname: string;
  ip: string;
  ramTotalMb: number;
  ramUsedBookedMb: number;
  containers: ContainerMemStat[];
  error?: string;
}

/** Run `docker stats --no-stream` on a worker and return actual RAM usage per container. */
export async function getWorkerContainerStats(server: Server): Promise<WorkerStatsResult> {
  const out: WorkerStatsResult = {
    id: server.id,
    hostname: server.hostname || server.ip || 'unknown',
    ip: server.ip,
    ramTotalMb: server.ram_total,
    ramUsedBookedMb: server.ram_used,
    containers: [],
  };

  try {
    const result = await sshExec(
      server.ip,
      `docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}' 2>/dev/null || true`
    );
    const lines = (result.stdout || '').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const parts = line.split(/\t/);
      if (parts.length >= 3) {
        out.containers.push({
          name: parts[0],
          memUsage: parts[1],
          memPerc: parts[2],
        });
      }
    }
  } catch (err: any) {
    out.error = err?.message || 'SSH failed';
  }

  return out;
}

/** Get actual container RAM usage for all workers. */
export async function getAllWorkersStats(): Promise<WorkerStatsResult[]> {
  const cpIp = controlPlaneIp();
  const servers = await db.getMany<Server>(
    `SELECT * FROM servers WHERE status = 'active' AND ($1::text IS NULL OR ip != $1) ORDER BY hostname`,
    [cpIp]
  );
  return Promise.all(servers.map((s) => getWorkerContainerStats(s)));
}
