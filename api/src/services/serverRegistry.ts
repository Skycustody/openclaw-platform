/**
 * Server Registry — manages worker server allocation and capacity.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ARCHITECTURE DECISIONS — DO NOT CHANGE WITHOUT UNDERSTANDING           │
 * │                                                                        │
 * │ 1. ATOMIC RAM RESERVATION: findBestServer() uses UPDATE...FOR UPDATE  │
 * │    SKIP LOCKED to atomically reserve RAM. This prevents two concurrent │
 * │    provisioning requests from selecting the same server and            │
 * │    overcommitting its RAM. Do not replace with SELECT then UPDATE.    │
 * │                                                                        │
 * │ 2. PACKING STRATEGY: ORDER BY ram_used DESC picks the busiest server  │
 * │    first (bin-packing). This keeps one server full before spilling to │
 * │    the next, allowing idle servers to be decommissioned.              │
 * │                                                                        │
 * │ 3. CONTROL_PLANE_IP EXCLUSION: The control plane server is excluded   │
 * │    from worker selection. User containers never run on the control    │
 * │    plane — it only runs the API, dashboard, and database.             │
 * │                                                                        │
 * │ 4. SINGLE-FLIGHT PROVISIONING: provisionInProgress ensures only one   │
 * │    Hetzner server is created at a time, even under concurrent demand. │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import db from '../lib/db';
import { Server } from '../types';
import { cloudProvider } from './cloudProvider';
import { sshExec } from './ssh';
import { ensureDockerImage } from './dockerImage';

const controlPlaneIp = (): string | null =>
  process.env.CONTROL_PLANE_IP?.trim() || null;

/** Single-flight: only one "provision new server" at a time to avoid duplicate VPS. */
let provisionInProgress: Promise<Server> | null = null;

/**
 * Find a server with enough RAM for a new container.
 *
 * @param requiredRamMb — RAM needed for the container
 * @param allowNewServer — if true AND no existing server has capacity, create a
 *   new Hetzner server. Set to false for background checks (checkCapacity) so
 *   they NEVER spend money. Only set to true when a real user is waiting.
 */
export async function findBestServer(requiredRamMb = 2048, allowNewServer = false): Promise<Server> {
  const cpIp = controlPlaneIp();

  console.log(`[findBestServer] Looking for server with ${requiredRamMb}MB free RAM (allowNewServer=${allowNewServer})`);

  // Atomically reserve RAM on the best server to prevent double-booking
  let server = await db.getOne<Server>(
    `UPDATE servers SET ram_used = ram_used + $1
     WHERE id = (
       SELECT id FROM servers
       WHERE status = 'active'
         AND (ram_total - ram_used) >= $1
         AND ($2::text IS NULL OR ip != $2)
       ORDER BY ram_used DESC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [requiredRamMb, cpIp]
  );

  if (server) {
    console.log(`[findBestServer] Reserved ${requiredRamMb}MB on ${server.hostname || server.ip} (now ${server.ram_used}/${server.ram_total}MB)`);
    return server;
  }

  // No existing server has capacity
  if (!allowNewServer) {
    throw new Error('No worker server has enough free RAM and auto-provisioning is not allowed for this call');
  }

  // Double-check: are there actually users who need a server?
  const waitingUsers = await db.getOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM users WHERE status = 'provisioning' AND server_id IS NULL`
  );
  const waitingCount = parseInt(waitingUsers?.count || '0');
  if (waitingCount === 0) {
    console.warn('[findBestServer] No users waiting for provisioning — skipping server creation');
    throw new Error('No capacity available and no users need a server');
  }

  console.log(`[findBestServer] ${waitingCount} user(s) waiting — proceeding with new server creation`);

  if (provisionInProgress) {
    console.log('[findBestServer] Another request is already provisioning a worker — waiting');
    server = await provisionInProgress;
    const hasCapacity = server && (server.ram_total - server.ram_used) >= requiredRamMb;
    if (hasCapacity) {
      console.log(`[findBestServer] Newly provisioned server ${server.hostname || server.ip} has capacity`);
      return server;
    }
    console.warn(`[findBestServer] Newly provisioned server has no capacity (${server?.ram_used}/${server?.ram_total}MB) — will try again`);
    provisionInProgress = null;
  }

  provisionInProgress = (async () => {
    try {
      // Re-check existing servers one more time
      server = await db.getOne<Server>(
        `UPDATE servers SET ram_used = ram_used + $1
         WHERE id = (
           SELECT id FROM servers
           WHERE status = 'active'
             AND (ram_total - ram_used) >= $1
             AND ($2::text IS NULL OR ip != $2)
           ORDER BY ram_used DESC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING *`,
        [requiredRamMb, cpIp]
      );
      if (server) {
        console.log(`[findBestServer] Found capacity on retry: ${server.hostname || server.ip}`);
        return server;
      }

      if (!process.env.HETZNER_API_TOKEN) {
        throw new Error(
          'No worker servers registered and HETZNER_API_TOKEN is not set. ' +
          'Register your server first: curl -X POST http://localhost:3001/webhooks/servers/register ' +
          '-H "Content-Type: application/json" -H "x-internal-secret: YOUR_SECRET" ' +
          '-d \'{"ip": "YOUR_SERVER_IP", "ram": SERVER_RAM_MB, "hostname": "srv1"}\''
        );
      }

      console.log('[findBestServer] CREATING NEW HETZNER SERVER — a real user is waiting for provisioning');
      await cloudProvider.provisionNewServer();
      const newServer = await waitForNewServer();
      console.log(`[findBestServer] New server registered: ${newServer.hostname || newServer.ip} (${newServer.ram_total}MB)`);
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
    console.log(`[registerServer] Re-activating existing server ${ip} (${hostname}), RAM=${ramTotal}MB`);
    await db.query(
      `UPDATE servers SET status = 'active', ram_total = $1 WHERE ip = $2`,
      [ramTotal, ip]
    );
    return { ...existing, status: 'active', ram_total: ramTotal };
  }

  console.log(`[registerServer] New server registered: ${ip} (${hostname}), RAM=${ramTotal}MB`);
  const result = await db.query<Server>(
    `INSERT INTO servers (ip, hostname, hostinger_id, ram_total, status)
     VALUES ($1, $2, $3, $4, 'active')
     RETURNING *`,
    [ip, hostname, hostingerId || null, ramTotal]
  );

  // Pre-build Docker image in background so the first user doesn't wait
  ensureDockerImage(ip).catch((err) => {
    console.warn(`[registerServer] Background image pre-build failed for ${ip}: ${err.message}`);
  });

  return result.rows[0];
}

export async function updateServerRam(serverId: string): Promise<void> {
  // Each user gets ONE container with plan-level RAM (agents share it)
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

/**
 * Background capacity check — runs every 10 minutes.
 *
 * THIS FUNCTION MUST NEVER CREATE SERVERS. It only:
 *  1. Recalculates real RAM usage (fixes drift)
 *  2. Logs server status
 *  3. Warns if capacity is low
 *
 * New Hetzner servers are ONLY created when a real user triggers
 * provisionUser() → findBestServer(ram, allowNewServer=true).
 */
export async function checkCapacity(): Promise<void> {
  const cpIp = controlPlaneIp();
  const servers = await db.getMany<Server>(
    `SELECT * FROM servers
     WHERE status = 'active'
       AND ($1::text IS NULL OR ip != $1)`,
    [cpIp]
  );

  if (servers.length === 0) {
    return;
  }

  // Recalculate RAM for all servers to fix any drift from phantom reservations
  for (const server of servers) {
    await updateServerRam(server.id);
  }

  // Re-read after recalculation
  const refreshed = await db.getMany<Server>(
    `SELECT * FROM servers
     WHERE status = 'active'
       AND ($1::text IS NULL OR ip != $1)`,
    [cpIp]
  );

  for (const server of refreshed) {
    const usedPercent = server.ram_total > 0 ? (server.ram_used / server.ram_total) * 100 : 0;
    const freeMb = server.ram_total - server.ram_used;

    if (usedPercent > 85) {
      console.warn(`[checkCapacity] WARNING: ${server.hostname || server.ip} at ${usedPercent.toFixed(1)}% (${server.ram_used}/${server.ram_total}MB, free=${freeMb}MB) — new users may trigger auto-provisioning`);
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
