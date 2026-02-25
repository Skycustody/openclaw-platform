/**
 * Container Provisioning — creates and manages OpenClaw containers on worker servers.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ARCHITECTURE DECISIONS — DO NOT CHANGE WITHOUT UNDERSTANDING           │
 * │                                                                        │
 * │ 1. DOCKER NETWORKING:                                                  │
 * │    - Containers start on `openclaw-net` (Traefik's discovery network). │
 * │      Traefik config has `network: openclaw-net` — if a container is    │
 * │      NOT on this network, Traefik returns 404 for all requests.        │
 * │    - Each container also gets `{name}-net` (isolation network) so      │
 * │      containers can't reach each other's ports directly.               │
 * │    DO NOT remove openclaw-net from docker run — Traefik routing breaks.│
 * │                                                                        │
 * │ 2. CONTAINER_SECRET (not INTERNAL_SECRET):                             │
 * │    - Containers get CONTAINER_SECRET = HMAC(INTERNAL_SECRET, userId).  │
 * │    - This prevents a compromised container from impersonating other    │
 * │      users on webhook endpoints. Never pass raw INTERNAL_SECRET.       │
 * │                                                                        │
 * │ 3. SHELL INJECTION PREVENTION:                                         │
 * │    - All user-derived values in SSH commands must be escaped or base64 │
 * │      encoded. updateContainerConfig() uses base64 piping.             │
 * │    - userIds are UUIDs (safe) but always validate before shell use.    │
 * │                                                                        │
 * │ 4. RESOURCE LIMITS:                                                    │
 * │    - --memory, --memory-swap, --cpus from PLAN_LIMITS                  │
 * │    - --pids-limit 256 prevents fork bombs                              │
 * │                                                                        │
 * │ 5. DOCKERFILE BUILD TOOLS:                                             │
 * │    - The Dockerfile must include `python3 make g++` for native module  │
 * │      compilation (@discordjs/opus). Without these, npm install fails.  │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import crypto from 'crypto';
import db from '../lib/db';
import { sshExec, waitForReady } from './ssh';
import { findBestServer, updateServerRam } from './serverRegistry';
import { PLAN_LIMITS, Plan, User } from '../types';
import { sendWelcomeEmail } from './email';
import { cloudflareDNS } from './cloudflare';
import { v4 as uuid } from 'uuid';
import { buildOpenclawConfig, injectApiKeys } from './apiKeys';
import { reapplyGatewayConfig, writeContainerConfig } from './containerConfig';
import { ensureNexosKey } from './nexos';
import { installDefaultSkills } from './defaultSkills';

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CONTAINER_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/;

function validateUserId(userId: string): void {
  if (!UUID_RE.test(userId)) throw new Error('Invalid user ID format');
}

function validateContainerName(name: string): void {
  if (!CONTAINER_NAME_RE.test(name)) throw new Error('Invalid container name format');
}

function redactSecrets(cmd: string): string {
  return cmd
    .replace(/CONTAINER_SECRET=[^\s"]+/g, 'CONTAINER_SECRET=[REDACTED]')
    .replace(/BROWSERLESS_URL=[^\s"]+/g, 'BROWSERLESS_URL=[REDACTED]')
    .replace(/OPENCLAW_GATEWAY_TOKEN=[^\s"]+/g, 'OPENCLAW_GATEWAY_TOKEN=[REDACTED]')
    .replace(/OPENROUTER_API_KEY=[^\s"]+/g, 'OPENROUTER_API_KEY=[REDACTED]')
    .replace(/token=[a-zA-Z0-9_-]+/gi, 'token=[REDACTED]');
}

/** Generate a per-container secret bound to a specific userId. */
export function generateContainerSecret(userId: string): string {
  const secret = process.env.INTERNAL_SECRET;
  if (!secret) throw new Error('INTERNAL_SECRET required');
  return crypto.createHmac('sha256', secret).update(userId).digest('hex');
}

interface ProvisionParams {
  userId: string;
  email: string;
  plan: Plan;
  stripeCustomerId?: string;
}

export async function provisionUser(params: ProvisionParams): Promise<User> {
  const { userId, email, plan, stripeCustomerId } = params;
  validateUserId(userId);
  const limits = PLAN_LIMITS[plan];
  const startTime = Date.now();

  const existing = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);

  // Check retry count — don't infinite-loop server creation
  const retryCount = (existing as any)?.provision_retries || 0;
  if (retryCount >= 3) {
    console.error(`[provision] User ${userId} has failed provisioning ${retryCount} times — halting. Manual intervention needed.`);
    await db.query(
      `UPDATE users SET status = 'paused' WHERE id = $1`,
      [userId]
    );
    throw new Error(`Provisioning failed ${retryCount} times. Please contact support.`);
  }

  await db.query(
    `UPDATE users SET provision_retries = COALESCE(provision_retries, 0) + 1 WHERE id = $1`,
    [userId]
  ).catch(() => {
    // Column may not exist yet — non-fatal
  });

  const subdomain = existing?.subdomain || (
    email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20) + '-' + uuid().slice(0, 6)
  );
  const referralCode = existing?.referral_code || uuid().slice(0, 8).toUpperCase();
  const containerName = existing?.container_name || `openclaw-${userId.slice(0, 12)}`;

  console.log(`[provision] Starting for ${email} (${userId}), plan=${plan}, retry=${retryCount}`);

  // Step 1: Find best server (allowNewServer=true because a real user is waiting)
  let server;
  try {
    server = await findBestServer(limits.ramMb, true);
  } catch (err: any) {
    console.error(`[provision] findBestServer failed for ${userId}: ${err.message}`);
    throw err;
  }
  console.log(`[provision] Using server ${server.ip} (${server.hostname || server.id})`);

  // Step 2: Update user record (S3 removed — files live in container workspace)
  await db.query(
    `UPDATE users SET
      server_id = $1,
      container_name = $2,
      subdomain = $3,
      stripe_customer_id = $4,
      referral_code = $5,
      status = 'provisioning'
    WHERE id = $6`,
    [server.id, containerName, subdomain, stripeCustomerId || null, referralCode, userId]
  );

  // Step 4: Initialize user settings and channels
  await Promise.all([
    db.query(
      `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    ),
    db.query(
      `INSERT INTO user_channels (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    ),
  ]);

  // Step 5: SSH into server and create container
  const domain = process.env.DOMAIN || 'yourdomain.com';
  const apiUrl = process.env.API_URL || 'https://api.yourdomain.com';
  const browserlessToken = process.env.BROWSERLESS_TOKEN || '';
  const image = `${process.env.DOCKER_REGISTRY || 'openclaw/openclaw'}:latest`;
  const hostRule = `${subdomain}.${domain}`;

  // Remove any existing container with same name first
  await sshExec(server.ip, `docker rm -f ${containerName} 2>/dev/null || true`);

  // Ensure shared Traefik network exists with ICC disabled so containers cannot reach each other
  await sshExec(server.ip, `docker network create --opt com.docker.network.bridge.enable_icc=false openclaw-net 2>/dev/null || true`);

  // Per-user isolated network
  validateContainerName(containerName);
  await sshExec(server.ip, `docker network create ${containerName}-net 2>/dev/null || true`);
  // Always verify Traefik has DOCKER_API_VERSION set; recreate if missing
  const traefikCheck = await sshExec(server.ip, `docker inspect traefik --format='{{.State.Running}}' 2>/dev/null`).catch(() => null);
  const traefikEnvCheck = await sshExec(server.ip, `docker inspect traefik --format='{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null`).catch(() => null);
  const hasApiVersion = traefikEnvCheck?.stdout?.includes('DOCKER_API_VERSION');
  if (!traefikCheck || !traefikCheck.stdout.includes('true') || !hasApiVersion) {
    console.log(`[provision] Starting Traefik on ${server.ip}`);
    const adminEmail = process.env.EMAIL_FROM?.replace('noreply@', '') || 'admin@yourdomain.com';
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
    await sshExec(server.ip, [
      `mkdir -p /opt/openclaw/config`,
      `echo '${traefikCfgB64}' | base64 -d > /opt/openclaw/config/traefik.yml`,
      `docker rm -f traefik 2>/dev/null || true`,
      `docker run -d --name traefik --restart unless-stopped --network openclaw-net -e DOCKER_API_VERSION=$(docker version --format '{{.Server.APIVersion}}' 2>/dev/null || echo 1.44) -p 80:80 -p 443:443 -v /var/run/docker.sock:/var/run/docker.sock:ro -v /opt/openclaw/config/traefik.yml:/etc/traefik/traefik.yml:ro traefik:latest`,
    ].join(' && '));
  }

  // Create data directory and initial config
  const mkdirResult = await sshExec(server.ip, `mkdir -p /opt/openclaw/instances/${userId}`);
  if (mkdirResult.code !== 0) {
    console.error(`[provision] mkdir failed:`, mkdirResult.stderr);
    throw new Error(`mkdir failed: ${mkdirResult.stderr}`);
  }

  const internalSecret = process.env.INTERNAL_SECRET;
  if (!internalSecret) throw new Error('INTERNAL_SECRET env var is required');

  // Generate gateway auth token early so it goes into the config JSON
  const gatewayToken = crypto.randomBytes(32).toString('hex');
  await db.query(
    `UPDATE users SET gateway_token = $1 WHERE id = $2`,
    [gatewayToken, userId]
  ).catch(() => {
    console.warn(`[provision] Could not store gateway_token (column may not exist)`);
  });

  const openclawConfig = buildOpenclawConfig(gatewayToken);

  await writeContainerConfig(server.ip, userId, openclawConfig);
  // Keep a backup copy so readContainerConfig can recover from corruption
  await sshExec(
    server.ip,
    [
      `cp /opt/openclaw/instances/${userId}/openclaw.json /opt/openclaw/instances/${userId}/openclaw.default.json`,
      `cp /opt/openclaw/instances/${userId}/openclaw.json /opt/openclaw/instances/${userId}/config.json`,
    ].join(' && ')
  );
  console.log(`[provision] Config written to /opt/openclaw/instances/${userId}/`);

  // Pull image only if using a remote registry
  if (process.env.DOCKER_REGISTRY) {
    console.log(`[provision] Pulling image ${image}...`);
    const pullResult = await sshExec(server.ip, `docker pull ${image}`);
    if (pullResult.code !== 0) {
      console.error(`[provision] docker pull failed:`, pullResult.stderr);
      throw new Error(`docker pull failed: ${pullResult.stderr}`);
    }
  }

  // Verify image exists — if missing, build it on the worker
  const imageCheck = await sshExec(server.ip, `docker image inspect ${image} > /dev/null 2>&1 && echo OK || echo MISSING`);
  if (imageCheck.stdout.includes('MISSING')) {
    console.log(`[provision] Image ${image} not on ${server.ip} — building it now`);
    const dockerfile = [
      'FROM node:22-slim',
      'RUN apt-get update && apt-get install -y curl git python3 make g++ chromium --no-install-recommends && rm -rf /var/lib/apt/lists/*',
      'RUN npm install -g openclaw@latest',
      'WORKDIR /data',
      'EXPOSE 18789',
      'CMD ["sh", "-c", "exec openclaw gateway --port 18789 --bind lan --allow-unconfigured run"]',
    ].join('\n');
    const dockerfileB64 = Buffer.from(dockerfile).toString('base64');
    const defaultCfgB64 = Buffer.from(JSON.stringify(openclawConfig, null, 2)).toString('base64');
    const buildCmd = [
      `mkdir -p /tmp/oc-build`,
      `echo '${dockerfileB64}' | base64 -d > /tmp/oc-build/Dockerfile`,
      `echo '${defaultCfgB64}' | base64 -d > /tmp/oc-build/openclaw.default.json`,
      `docker build -t ${image} /tmp/oc-build`,
      `rm -rf /tmp/oc-build`,
    ].join(' && ');
    const buildResult = await sshExec(server.ip, buildCmd);
    if (buildResult.code !== 0) {
      console.error(`[provision] Image build failed:`, buildResult.stderr);
      throw new Error(`Docker image build failed on ${server.ip}: ${buildResult.stderr}`);
    }
    console.log(`[provision] Image ${image} built successfully`);
  }

  // Give Node.js ~75% of the container memory for its heap
  const heapMb = Math.floor(limits.ramMb * 0.75);

  // Ensure user has an OpenRouter API key before container creation
  const nexosKey = await ensureNexosKey(userId);

  // Mount the instance directory at /root/.openclaw so config + credentials persist.
  // The startup script launches the gateway in the background, waits for it to
  // initialize (which may strip auth config via implicit doctor/validation),
  // then re-applies the gateway auth settings using `openclaw config set`.
  // This ensures dangerouslyDisableDeviceAuth survives gateway startup.
  const startScript = [
    `sh -c '`,
    `openclaw gateway --port 18789 --bind lan --allow-unconfigured run &`,
    `GW_PID=$!;`,
    `sleep 10;`,
    `openclaw config set browser.defaultProfile openclaw 2>/dev/null;`,
    `openclaw config set browser.headless true 2>/dev/null;`,
    `openclaw config set browser.noSandbox true 2>/dev/null;`,
    `openclaw devices approve --latest --token "$OPENCLAW_GATEWAY_TOKEN" 2>/dev/null;`,
    `sleep 3;`,
    `openclaw devices approve --latest --token "$OPENCLAW_GATEWAY_TOKEN" 2>/dev/null;`,
    `wait $GW_PID`,
    `'`,
  ].join(' ');
  const dockerRunCmd = [
    'docker run -d',
    `--name ${containerName}`,
    '--restart unless-stopped',
    '--no-healthcheck',
    '--network openclaw-net',
    '--cap-drop ALL',
    '--cap-add NET_BIND_SERVICE',
    '--security-opt seccomp=unconfined',
    '--no-new-privileges',
    '--pids-limit 256',
    `--memory ${limits.ramMb}m`,
    `--memory-swap ${limits.ramMb}m`,
    `--cpus ${limits.cpus}`,
    `-e "NODE_OPTIONS=--max-old-space-size=${heapMb}"`,
    `-e USER_ID=${userId}`,
    `-e PLATFORM_API=${apiUrl}`,
    `-e CONTAINER_SECRET=${generateContainerSecret(userId)}`,
    `-e "BROWSERLESS_URL=wss://production-sfo.browserless.io?token=${browserlessToken}"`,
    `-e OPENCLAW_GATEWAY_TOKEN=${gatewayToken}`,
    `-e OPENROUTER_API_KEY=${nexosKey}`,
    `-v /opt/openclaw/instances/${userId}:/root/.openclaw`,
    `--label traefik.enable=true`,
    `--label 'traefik.http.routers.${containerName}.rule=Host(\`${hostRule}\`)'`,
    `--label 'traefik.http.routers.${containerName}.entrypoints=web'`,
    `--label 'traefik.http.routers.${containerName}-secure.rule=Host(\`${hostRule}\`)'`,
    `--label 'traefik.http.routers.${containerName}-secure.entrypoints=websecure'`,
    `--label 'traefik.http.routers.${containerName}-secure.tls=true'`,
    `--label traefik.http.services.${containerName}.loadbalancer.server.port=18789`,
    `--label 'traefik.http.middlewares.${containerName}-iframe.headers.customResponseHeaders.X-Frame-Options='`,
    `--label 'traefik.http.middlewares.${containerName}-iframe.headers.customResponseHeaders.Content-Security-Policy=frame-ancestors self https://${domain} https://*.${domain}'`,
    `--label 'traefik.http.routers.${containerName}.middlewares=${containerName}-iframe'`,
    `--label 'traefik.http.routers.${containerName}-secure.middlewares=${containerName}-iframe'`,
    image,
    startScript,
  ].join(' ');

  console.log(`[provision] Running docker on ${server.ip}: ${redactSecrets(dockerRunCmd).slice(0, 300)}...`);
  const runResult = await sshExec(server.ip, dockerRunCmd);

  if (runResult.code !== 0) {
    console.error(`[provision] docker run FAILED (code ${runResult.code}):`, runResult.stderr, runResult.stdout);
    throw new Error(`docker run failed: ${runResult.stderr || runResult.stdout}`);
  }

  console.log(`[provision] Container ${containerName} started: ${runResult.stdout.slice(0, 20)}`);

  // Also connect container to its own isolated network (prevents cross-container access)
  await sshExec(server.ip, `docker network connect ${containerName}-net ${containerName} 2>/dev/null || true`);

  // Block ALL Docker containers from reaching cloud metadata endpoint (survives container restarts/IP changes)
  await sshExec(server.ip, [
    `iptables -C FORWARD -d 169.254.169.254 -j DROP 2>/dev/null || iptables -I FORWARD -d 169.254.169.254 -j DROP 2>/dev/null || true`,
    `iptables -C OUTPUT -d 169.254.169.254 -m owner ! --uid-owner 0 -j DROP 2>/dev/null || iptables -I OUTPUT -d 169.254.169.254 -m owner ! --uid-owner 0 -j DROP 2>/dev/null || true`,
  ].join(' && '));

  // Step 6: Quick alive check — give the container 5s to start, then verify
  await new Promise(r => setTimeout(r, 5000));
  const aliveCheck = await sshExec(
    server.ip,
    `docker inspect ${containerName} --format='{{.State.Running}}' 2>/dev/null`
  ).catch(() => null);

  if (!aliveCheck || !aliveCheck.stdout.includes('true')) {
    const crashLogs = await sshExec(server.ip, `docker logs --tail 30 ${containerName} 2>&1`).catch(() => null);
    console.error(`[provision] Container ${containerName} crashed! Logs:\n${crashLogs?.stdout || 'no logs'}`);
    console.log(`[provision] Attempting restart of ${containerName}`);
    await sshExec(server.ip, `docker start ${containerName} 2>/dev/null`).catch(() => null);
    await new Promise(r => setTimeout(r, 3000));
  }

  // Step 6b: Inject OpenRouter key + configure model router per plan tier
  await injectApiKeys(server.ip, userId, containerName, plan);

  // Step 6b2: Install default skills (browser-use, job-auto-apply, etc.) so new users get them out of the box
  await installDefaultSkills(server.ip, userId, containerName);

  // Step 6c: Re-apply gateway auth config (doctor --fix on existing images may strip it)
  await reapplyGatewayConfig(server.ip, userId, containerName);

  // Step 7: Create DNS record pointing subdomain → worker IP
  await cloudflareDNS.upsertRecord(subdomain, server.ip);

  // Background: health check + routing probes (don't block the response)
  (async () => {
    try {
      await waitForReady(server.ip, containerName, 60000);
      console.log(`[provision] Container ${containerName} health check passed`);
    } catch {
      console.warn(`[provision] Container ${containerName} health check timed out`);
    }
  })().catch(() => {});

  // Step 8: Update status to active and reset retry count
  await db.query(
    `UPDATE users SET status = 'active', last_active = NOW(), provision_retries = 0 WHERE id = $1`,
    [userId]
  ).catch(() => {
    // provision_retries column might not exist
    db.query(`UPDATE users SET status = 'active', last_active = NOW() WHERE id = $1`, [userId]);
  });

  await updateServerRam(server.id);

  // Step 9: Send welcome email
  try {
    await sendWelcomeEmail(email, subdomain, domain);
  } catch (err) {
    console.error('[provision] Welcome email failed:', err);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[provision] Complete for ${email}: https://${hostRule} (took ${elapsed}s)`);

  const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
  return user!;
}

export async function deprovisionUser(userId: string): Promise<void> {
  validateUserId(userId);
  const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user || !user.server_id) return;

  const server = await db.getOne<any>('SELECT * FROM servers WHERE id = $1', [user.server_id]);
  if (!server) return;

  const containerName = user.container_name || `openclaw-${userId}`;
  validateContainerName(containerName);

  try {
    await sshExec(server.ip, `docker stop ${containerName} && docker rm ${containerName}`);
    await sshExec(server.ip, `rm -rf /opt/openclaw/instances/${userId}`);
  } catch (err) {
    console.error('Container cleanup failed:', err);
  }

  if (user.subdomain) {
    await cloudflareDNS.deleteRecord(user.subdomain);
  }

  await db.query(
    `UPDATE users SET status = 'cancelled', server_id = NULL, container_name = NULL WHERE id = $1`,
    [userId]
  );

  await updateServerRam(server.id);
}

export async function restartContainer(userId: string): Promise<void> {
  validateUserId(userId);
  const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user?.server_id) throw new Error('User has no server assigned');

  const server = await db.getOne<any>('SELECT * FROM servers WHERE id = $1', [user.server_id]);
  if (!server) throw new Error('Server not found');

  const containerName = user.container_name || `openclaw-${userId}`;
  validateContainerName(containerName);
  await sshExec(server.ip, `docker restart ${containerName}`);

  // Wait for the gateway process to finish its startup initialization
  // (which may strip auth config), then re-apply gateway auth settings.
  // The startup script already does this via config set commands (8s delay),
  // but we also apply from the platform side for containers with older scripts.
  await new Promise(r => setTimeout(r, 10000));
  await reapplyGatewayConfig(server.ip, userId, containerName);
}

export async function updateContainerConfig(userId: string, config: Record<string, any>): Promise<void> {
  validateUserId(userId);
  const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user?.server_id) throw new Error('User has no server assigned');

  const server = await db.getOne<any>('SELECT * FROM servers WHERE id = $1', [user.server_id]);
  if (!server) throw new Error('Server not found');

  const containerName = user.container_name || `openclaw-${userId}`;
  validateContainerName(containerName);
  const configB64 = Buffer.from(JSON.stringify(config)).toString('base64');

  await sshExec(
    server.ip,
    `echo '${configB64}' | base64 -d | docker exec -i ${containerName} openclaw config merge -`
  );
}
