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
import { PLAN_LIMITS, Plan, Server, User } from '../types';
import { sendWelcomeEmail } from './email';
import { cloudflareDNS } from './cloudflare';
import { v4 as uuid } from 'uuid';
import { buildOpenclawConfig, injectApiKeys } from './apiKeys';
import { reapplyGatewayConfig, writeContainerConfig } from './containerConfig';
import { ensureNexosKey } from './nexos';
import { preInstallSkills } from './defaultSkills';
import { ensureDockerImage } from './dockerImage';
import { UserSettings } from '../types';

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
  if (!existing) {
    throw new Error(`User ${userId} not found — cannot provision a deleted user`);
  }

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
    `UPDATE users SET provision_retries = COALESCE(provision_retries, 0) + 1
     WHERE id = $1 AND COALESCE(provision_retries, 0) < 3`,
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

  // Step 1: Find server — reuse existing if user already has one (re-provision case)
  let server: Server | null = null;
  if (existing.server_id) {
    server = await db.getOne<Server>(
      `SELECT * FROM servers WHERE id = $1 AND status = 'active'`,
      [existing.server_id]
    );
    if (server) {
      console.log(`[provision] Reusing existing server ${server.ip} for re-provision of ${userId}`);
    }
  }
  if (!server) {
    try {
      server = await findBestServer(limits.ramMb, true);
    } catch (err: any) {
      console.error(`[provision] findBestServer failed for ${userId}: ${err.message}`);
      throw err;
    }
  }
  console.log(`[provision] Using server ${server.ip} (${server.hostname || server.id})`);

  let provisionSucceeded = false;
  let dnsCreated = false;
  try {

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
  const previewHost = `preview-${subdomain}.${domain}`;

  validateContainerName(containerName);

  // Batch: cleanup + networks + instance dir in a single SSH call
  const setupResult = await sshExec(server.ip, [
    `docker rm -f ${containerName} 2>/dev/null || true`,
    `docker network create --opt com.docker.network.bridge.enable_icc=false openclaw-net 2>/dev/null || true`,
    `docker network create ${containerName}-net 2>/dev/null || true`,
    `mkdir -p /opt/openclaw/instances/${userId} && chmod 700 /opt/openclaw/instances/${userId}`,
  ].join(' && '));
  if (setupResult.code !== 0) {
    console.error(`[provision] setup failed:`, setupResult.stderr);
    throw new Error(`Server setup failed: ${setupResult.stderr}`);
  }

  // Traefik check — single SSH call to inspect both state and env
  const traefikInfo = await sshExec(server.ip,
    `docker inspect traefik --format='RUNNING={{.State.Running}} ENV={{range .Config.Env}}{{.}},{{end}}' 2>/dev/null || echo 'MISSING'`
  ).catch(() => ({ stdout: 'MISSING', stderr: '', code: 1 }));
  const traefikRunning = traefikInfo.stdout.includes('RUNNING=true');
  const hasApiVersion = traefikInfo.stdout.includes('DOCKER_API_VERSION');
  if (!traefikRunning || !hasApiVersion) {
    console.log(`[provision] Starting Traefik on ${server.ip}`);
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
  console.log(`[provision] Base config written for ${userId}`);

  // Ensure Docker image exists (pre-built at server registration, fallback build here)
  // Run in parallel with API key creation — neither depends on the other
  const [, nexosKey] = await Promise.all([
    ensureDockerImage(server.ip),
    ensureNexosKey(userId),
  ]);

  // Inject API keys + model config into openclaw.json BEFORE container starts
  await injectApiKeys(server.ip, userId, containerName, plan);

  // Upload skills + enable in config BEFORE container starts (no restart needed)
  await preInstallSkills(server.ip, userId);

  // Write USER.md + seed MEMORY.md BEFORE container starts
  try {
    const settings = await db.getOne<UserSettings>(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [userId]
    );

    // Ensure workspace + memory directories exist
    await sshExec(server.ip,
      `mkdir -p /opt/openclaw/instances/${userId}/workspace/memory /opt/openclaw/instances/${userId}/agents/main/agent /opt/openclaw/instances/${userId}/credentials && chmod 700 /opt/openclaw/instances/${userId}/credentials`
    );

    if (settings?.agent_name || settings?.custom_instructions) {
      const parts: string[] = ['# User Profile'];
      if (settings.agent_name) parts.push(`\nThe user's name is: ${settings.agent_name}`);
      if (settings.language) parts.push(`Preferred language: ${settings.language}`);
      if (settings.agent_tone) parts.push(`Communication style: ${settings.agent_tone}`);
      if (settings.response_length) parts.push(`Response length: ${settings.response_length}`);
      if (settings.custom_instructions) parts.push(`\n## Instructions\n${settings.custom_instructions}`);
      parts.push(`\nIMPORTANT: You are the user's AI assistant. The user's name above is who you are talking to — it is NOT your name. If asked your name, say you are their AI assistant.`);
      parts.push(`\n## Memory\nYou have persistent memory. Always save important facts, user preferences, project details, and key decisions to MEMORY.md. For daily notes and conversation context, use memory/YYYY-MM-DD.md. When you're unsure about something the user mentioned before, search your memory first.`);
      parts.push(`\n## Web Preview\nWhen you build websites or web apps, always start the dev server on port 8080 (use \`--port 8080\` or equivalent). The user can preview it live at the URL in the PREVIEW_URL environment variable. Tell the user this URL when you start a dev server.\n\nIMPORTANT: After starting a dev server, also send the preview link to ALL connected messaging apps (Telegram, WhatsApp, Discord, Slack — whichever are connected). This way the user can view the site from their phone even when away from the computer. Format the message like: "Your website preview is ready: [URL]"`);
      parts.push(`\n## AI Models\nYou are running on a platform with multiple AI models. The user may ask you to "switch to sonnet", "use GPT-4o", etc. You have a skill called "switch-model" that can change which AI model processes your responses. Available models: Claude Sonnet 4 (sonnet), Claude Opus 4 (opus), GPT-4o (gpt4o/gpt-4o), GPT-4.1 (gpt4.1), GPT-4.1 Mini (gpt4.1-mini), GPT-4.1 Nano (gpt4.1-nano), Gemini 2.5 Pro (gemini-pro), Gemini 2.5 Flash (gemini-flash), DeepSeek V3 (deepseek), DeepSeek R1 (deepseek-r1), Grok 3 (grok), or "auto" for smart automatic routing. When the user asks to switch models, use the switch-model skill.`);
      const userMdB64 = Buffer.from(parts.join('\n')).toString('base64');
      await sshExec(server.ip, `echo '${userMdB64}' | base64 -d > /opt/openclaw/instances/${userId}/USER.md`);

      // Seed MEMORY.md with user profile so it survives context compaction
      const memParts: string[] = ['# User Profile (from onboarding)'];
      if (settings.agent_name) memParts.push(`- Name: ${settings.agent_name}`);
      if (settings.language) memParts.push(`- Preferred language: ${settings.language}`);
      if (settings.agent_tone) memParts.push(`- Communication style: ${settings.agent_tone}`);
      if (settings.response_length) memParts.push(`- Response length: ${settings.response_length}`);
      if (settings.custom_instructions) memParts.push(`- Custom instructions: ${settings.custom_instructions}`);
      memParts.push('');
      const memB64 = Buffer.from(memParts.join('\n')).toString('base64');
      await sshExec(server.ip, `echo '${memB64}' | base64 -d > /opt/openclaw/instances/${userId}/workspace/MEMORY.md`);
    }
  } catch { /* non-fatal */ }

  // Keep a backup copy after full config is built
  await sshExec(
    server.ip,
    [
      `cp /opt/openclaw/instances/${userId}/openclaw.json /opt/openclaw/instances/${userId}/openclaw.default.json`,
      `cp /opt/openclaw/instances/${userId}/openclaw.json /opt/openclaw/instances/${userId}/config.json`,
    ].join(' && ')
  );

  // Give Node.js ~75% of the container memory for its heap
  const heapMb = Math.floor(limits.ramMb * 0.75);

  // Mount the instance directory at /root/.openclaw so config + credentials persist.
  // The startup script launches the gateway in the background, waits for it to
  // initialize (which may strip auth config via implicit doctor/validation),
  // then re-applies the gateway auth settings using `openclaw config set`.
  // This ensures dangerouslyDisableDeviceAuth survives gateway startup.
  const startScript = [
    `sh -c '`,
    `rm -f /root/.openclaw/agents/*/sessions/*.lock 2>/dev/null;`,
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
    `-e PREVIEW_PORT=8080`,
    `-e "PREVIEW_URL=https://${previewHost}"`,
    `-v /opt/openclaw/instances/${userId}:/root/.openclaw`,
    `--label traefik.enable=true`,
    // Gateway routes (port 18789)
    `--label 'traefik.http.routers.${containerName}.rule=Host(\`${hostRule}\`)'`,
    `--label 'traefik.http.routers.${containerName}.entrypoints=web'`,
    `--label 'traefik.http.routers.${containerName}.service=${containerName}'`,
    `--label 'traefik.http.routers.${containerName}-secure.rule=Host(\`${hostRule}\`)'`,
    `--label 'traefik.http.routers.${containerName}-secure.entrypoints=websecure'`,
    `--label 'traefik.http.routers.${containerName}-secure.tls=true'`,
    `--label 'traefik.http.routers.${containerName}-secure.service=${containerName}'`,
    `--label traefik.http.services.${containerName}.loadbalancer.server.port=18789`,
    `--label 'traefik.http.middlewares.${containerName}-iframe.headers.customResponseHeaders.X-Frame-Options='`,
    `--label 'traefik.http.middlewares.${containerName}-iframe.headers.customResponseHeaders.Content-Security-Policy=frame-ancestors self https://${domain} https://*.${domain}'`,
    `--label 'traefik.http.routers.${containerName}.middlewares=${containerName}-iframe'`,
    `--label 'traefik.http.routers.${containerName}-secure.middlewares=${containerName}-iframe'`,
    // Web preview routes (port 8080) — agent serves websites here
    `--label 'traefik.http.routers.${containerName}-preview.rule=Host(\`${previewHost}\`)'`,
    `--label 'traefik.http.routers.${containerName}-preview.entrypoints=web'`,
    `--label 'traefik.http.routers.${containerName}-preview.service=${containerName}-preview'`,
    `--label 'traefik.http.routers.${containerName}-preview-secure.rule=Host(\`${previewHost}\`)'`,
    `--label 'traefik.http.routers.${containerName}-preview-secure.entrypoints=websecure'`,
    `--label 'traefik.http.routers.${containerName}-preview-secure.tls=true'`,
    `--label 'traefik.http.routers.${containerName}-preview-secure.service=${containerName}-preview'`,
    `--label traefik.http.services.${containerName}-preview.loadbalancer.server.port=8080`,
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

  // Batch: connect isolation network + metadata firewall in one SSH call
  await sshExec(server.ip, [
    `docker network connect ${containerName}-net ${containerName} 2>/dev/null || true`,
    `iptables -C FORWARD -d 169.254.169.254 -j DROP 2>/dev/null || iptables -I FORWARD -d 169.254.169.254 -j DROP 2>/dev/null || true`,
    `iptables -C OUTPUT -d 169.254.169.254 -m owner ! --uid-owner 0 -j DROP 2>/dev/null || iptables -I OUTPUT -d 169.254.169.254 -m owner ! --uid-owner 0 -j DROP 2>/dev/null || true`,
  ].join(' && '));

  // Step 6: Fast alive check — poll every 1s instead of hard sleep
  let containerAlive = false;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const check = await sshExec(
      server.ip,
      `docker inspect ${containerName} --format='{{.State.Running}}' 2>/dev/null`
    ).catch(() => null);
    if (check?.stdout.includes('true')) {
      containerAlive = true;
      break;
    }
  }

  if (!containerAlive) {
    const crashLogs = await sshExec(server.ip, `docker logs --tail 30 ${containerName} 2>&1`).catch(() => null);
    console.error(`[provision] Container ${containerName} not running after 10s! Logs:\n${crashLogs?.stdout || 'no logs'}`);
    console.log(`[provision] Attempting restart of ${containerName}`);
    await sshExec(server.ip, `docker start ${containerName} 2>/dev/null`).catch(() => null);
    await new Promise(r => setTimeout(r, 3000));
  }

  // Step 7: Create DNS records BEFORE waiting — gives Cloudflare time to propagate
  await Promise.all([
    cloudflareDNS.upsertRecord(subdomain, server.ip),
    cloudflareDNS.upsertRecord(`preview-${subdomain}`, server.ip),
  ]);
  dnsCreated = true;

  // Re-apply gateway auth config (doctor --fix on startup may strip it) — needs running container
  await reapplyGatewayConfig(server.ip, userId, containerName);

  // Step 8: Wait for gateway to actually be reachable — don't lie about status
  let gatewayReady = false;
  try {
    await waitForReady(server.ip, containerName, 90000);
    gatewayReady = true;
    console.log(`[provision] Gateway confirmed reachable for ${containerName}`);
  } catch (err) {
    console.warn(`[provision] Gateway health check timed out for ${containerName}: ${(err as Error).message}`);
  }

  // Step 9: Set status based on actual gateway state
  if (gatewayReady) {
    await db.query(
      `UPDATE users SET status = 'active', last_active = NOW(), provision_retries = 0 WHERE id = $1`,
      [userId]
    );
  } else {
    await db.query(
      `UPDATE users SET status = 'starting', last_active = NOW() WHERE id = $1`,
      [userId]
    );
    console.warn(`[provision] ${containerName} marked 'starting' — gateway not yet reachable`);
  }

  await updateServerRam(server.id);

  // Send welcome email (non-blocking)
  sendWelcomeEmail(email, subdomain, domain).catch((err) => {
    console.error('[provision] Welcome email failed:', err);
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[provision] Complete for ${email}: https://${hostRule} (took ${elapsed}s)`);

  provisionSucceeded = true;
  const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
  return user!;

  } catch (provisionErr) {
    // Release RAM reservation on failure so the server isn't phantom-full
    if (!provisionSucceeded) {
      console.warn(`[provision] Releasing RAM for failed provisioning of ${userId} on server ${server.id}`);
      await updateServerRam(server.id).catch((e) =>
        console.error(`[provision] RAM release failed for server ${server.id}:`, e.message)
      );
      // Clean up DNS if it was created but provisioning failed
      if (dnsCreated) {
        console.warn(`[provision] Cleaning up DNS records for ${subdomain} after failed provisioning`);
        await Promise.all([
          cloudflareDNS.deleteRecord(subdomain).catch((e) =>
            console.error(`[provision] DNS cleanup failed for ${subdomain}:`, e.message)
          ),
          cloudflareDNS.deleteRecord(`preview-${subdomain}`).catch((e) =>
            console.error(`[provision] DNS cleanup failed for preview-${subdomain}:`, e.message)
          ),
        ]);
      }
    }
    throw provisionErr;
  }
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
    await Promise.all([
      cloudflareDNS.deleteRecord(user.subdomain),
      cloudflareDNS.deleteRecord(`preview-${user.subdomain}`).catch(() => {}),
    ]);
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

  // Clear stale session locks before restart — a hung request leaves .lock files
  // that block all subsequent messages with "session file locked (timeout)"
  await sshExec(server.ip,
    `rm -f /opt/openclaw/instances/${userId}/agents/*/sessions/*.lock 2>/dev/null`
  ).catch(() => {});

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
