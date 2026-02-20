import db from '../lib/db';
import { sshExec, waitForReady } from './ssh';
import { createUserBucket } from './s3';
import { findBestServer, updateServerRam } from './serverRegistry';
import { PLAN_LIMITS, Plan, User } from '../types';
import { sendWelcomeEmail } from './email';
import { v4 as uuid } from 'uuid';

interface ProvisionParams {
  userId: string;
  email: string;
  plan: Plan;
  stripeCustomerId?: string;
}

export async function provisionUser(params: ProvisionParams): Promise<User> {
  const { userId, email, plan, stripeCustomerId } = params;
  const limits = PLAN_LIMITS[plan];

  const existing = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
  const subdomain = existing?.subdomain || (
    email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20) + '-' + uuid().slice(0, 6)
  );
  const referralCode = existing?.referral_code || uuid().slice(0, 8).toUpperCase();
  const containerName = existing?.container_name || `openclaw-${userId.slice(0, 12)}`;

  console.log(`[provision] Starting for ${email} (${userId}), plan=${plan}`);

  // Step 1: Find best server
  const server = await findBestServer(limits.ramMb);
  console.log(`[provision] Using server ${server.ip} (${server.id})`);

  // Step 2: Create S3 bucket
  const s3Bucket = await createUserBucket(userId);

  // Step 3: Update user record
  await db.query(
    `UPDATE users SET
      server_id = $1,
      container_name = $2,
      subdomain = $3,
      s3_bucket = $4,
      stripe_customer_id = $5,
      referral_code = $6,
      status = 'provisioning'
    WHERE id = $7`,
    [server.id, containerName, subdomain, s3Bucket, stripeCustomerId || null, referralCode, userId]
  );

  // Step 4: Initialize user settings, channels, and token balance
  await Promise.all([
    db.query(
      `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    ),
    db.query(
      `INSERT INTO user_channels (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    ),
    db.query(
      `INSERT INTO token_balances (user_id, balance, total_purchased)
       VALUES ($1, $2, $2) ON CONFLICT (user_id) DO NOTHING`,
      [userId, limits.includedTokens]
    ),
    db.query(
      `INSERT INTO token_transactions (user_id, amount, type, description)
       VALUES ($1, $2, 'subscription_grant', $3)`,
      [userId, limits.includedTokens, `${plan} plan signup bonus`]
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

  // Ensure Docker network and Traefik reverse proxy are running on the worker
  await sshExec(server.ip, `docker network create openclaw-net 2>/dev/null || true`);
  const traefikCheck = await sshExec(server.ip, `docker inspect traefik --format='{{.State.Running}}' 2>/dev/null`).catch(() => null);
  if (!traefikCheck || !traefikCheck.stdout.includes('true')) {
    console.log(`[provision] Starting Traefik on ${server.ip}`);
    const adminEmail = process.env.EMAIL_FROM?.replace('noreply@', '') || 'admin@yourdomain.com';
    const traefikCfgB64 = Buffer.from([
      'api:',
      '  dashboard: false',
      'entryPoints:',
      '  web:',
      '    address: ":80"',
      '    http:',
      '      redirections:',
      '        entryPoint:',
      '          to: websecure',
      '          scheme: https',
      '  websecure:',
      '    address: ":443"',
      'providers:',
      '  docker:',
      '    endpoint: "unix:///var/run/docker.sock"',
      '    exposedByDefault: false',
      '    network: openclaw-net',
      'certificatesResolvers:',
      '  letsencrypt:',
      '    acme:',
      `      email: ${adminEmail}`,
      '      storage: /opt/openclaw/traefik/acme.json',
      '      httpChallenge:',
      '        entryPoint: web',
    ].join('\n')).toString('base64');
    await sshExec(server.ip, [
      `mkdir -p /opt/openclaw/{config,traefik}`,
      `echo '${traefikCfgB64}' | base64 -d > /opt/openclaw/config/traefik.yml`,
      `touch /opt/openclaw/traefik/acme.json && chmod 600 /opt/openclaw/traefik/acme.json`,
      `docker rm -f traefik 2>/dev/null || true`,
      `docker run -d --name traefik --restart unless-stopped --network openclaw-net -p 80:80 -p 443:443 -v /var/run/docker.sock:/var/run/docker.sock:ro -v /opt/openclaw/config/traefik.yml:/traefik.yml:ro -v /opt/openclaw/traefik/acme.json:/opt/openclaw/traefik/acme.json traefik:v3.0`,
    ].join(' && '));
  }

  // Create data directory and initial config
  const mkdirResult = await sshExec(server.ip, `mkdir -p /opt/openclaw/instances/${userId}`);
  if (mkdirResult.code !== 0) {
    console.error(`[provision] mkdir failed:`, mkdirResult.stderr);
    throw new Error(`mkdir failed: ${mkdirResult.stderr}`);
  }

  const internalSecret = process.env.INTERNAL_SECRET || 'changeme';
  const openclawConfig = {
    server: { port: 18789, host: '0.0.0.0' },
    browser: {
      enabled: true,
      defaultProfile: 'browserless',
      profiles: {
        browserless: { type: 'cdp', cdpUrl: `wss://production-sfo.browserless.io?token=${browserlessToken}` },
      },
    },
    memory: { enabled: true, maxItems: 2000 },
    hooks: {
      onMessage: {
        url: `${apiUrl}/webhooks/container/message`,
        headers: { 'x-internal-secret': internalSecret },
      },
    },
  };

  const configBase64 = Buffer.from(JSON.stringify(openclawConfig, null, 2)).toString('base64');
  const writeConfigResult = await sshExec(
    server.ip,
    `echo '${configBase64}' | base64 -d > /opt/openclaw/instances/${userId}/openclaw.json`
  );
  if (writeConfigResult.code !== 0) {
    console.warn(`[provision] config write warning:`, writeConfigResult.stderr);
  }

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
      'RUN apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*',
      'RUN npm install -g openclaw@latest',
      'WORKDIR /data',
      'HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD openclaw health || exit 1',
      'EXPOSE 18789',
      'CMD ["openclaw", "gateway", "--port", "18789", "run"]',
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

  // Run container
  const dockerRunCmd = [
    'docker run -d',
    `--name ${containerName}`,
    '--restart unless-stopped',
    '--network openclaw-net',
    `--memory ${limits.ramMb}m`,
    `--memory-swap ${limits.ramMb}m`,
    `--cpus ${limits.cpus}`,
    `-e USER_ID=${userId}`,
    `-e S3_BUCKET=${s3Bucket}`,
    `-e PLATFORM_API=${apiUrl}`,
    `-e INTERNAL_SECRET=${internalSecret}`,
    `-e "BROWSERLESS_URL=wss://production-sfo.browserless.io?token=${browserlessToken}"`,
    `-v /opt/openclaw/instances/${userId}:/data`,
    `--label traefik.enable=true`,
    `--label 'traefik.http.routers.${containerName}.rule=Host(\`${hostRule}\`)'`,
    `--label 'traefik.http.routers.${containerName}.entrypoints=web'`,
    `--label 'traefik.http.routers.${containerName}-secure.rule=Host(\`${hostRule}\`)'`,
    `--label 'traefik.http.routers.${containerName}-secure.entrypoints=websecure'`,
    `--label 'traefik.http.routers.${containerName}-secure.tls=true'`,
    `--label 'traefik.http.routers.${containerName}-secure.tls.certresolver=letsencrypt'`,
    `--label traefik.http.services.${containerName}.loadbalancer.server.port=18789`,
    image,
  ].join(' ');

  console.log(`[provision] Running docker on ${server.ip}: ${dockerRunCmd.slice(0, 200)}...`);
  const runResult = await sshExec(server.ip, dockerRunCmd);

  if (runResult.code !== 0) {
    console.error(`[provision] docker run FAILED (code ${runResult.code}):`, runResult.stderr, runResult.stdout);
    throw new Error(`docker run failed: ${runResult.stderr || runResult.stdout}`);
  }

  console.log(`[provision] Container ${containerName} started: ${runResult.stdout.slice(0, 20)}`);

  // Step 6: Wait for container to be ready
  try {
    await waitForReady(server.ip, containerName, 60000);
    console.log(`[provision] Container ${containerName} is healthy`);
  } catch {
    console.warn(`[provision] Container ${containerName} health check timed out but may still start`);
  }

  // Step 7: Update status to active
  await db.query(
    `UPDATE users SET status = 'active', last_active = NOW() WHERE id = $1`,
    [userId]
  );

  await updateServerRam(server.id);

  // Step 8: Send welcome email
  try {
    await sendWelcomeEmail(email, subdomain, domain);
  } catch (err) {
    console.error('Welcome email failed:', err);
  }

  console.log(`[provision] Complete for ${email}: https://${hostRule}`);

  const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
  return user!;
}

export async function deprovisionUser(userId: string): Promise<void> {
  const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user || !user.server_id) return;

  const server = await db.getOne<any>('SELECT * FROM servers WHERE id = $1', [user.server_id]);
  if (!server) return;

  const containerName = user.container_name || `openclaw-${userId}`;

  try {
    await sshExec(server.ip, `docker stop ${containerName} && docker rm ${containerName}`);
    await sshExec(server.ip, `rm -rf /opt/openclaw/instances/${userId}`);
  } catch (err) {
    console.error('Container cleanup failed:', err);
  }

  await db.query(
    `UPDATE users SET status = 'cancelled', server_id = NULL, container_name = NULL WHERE id = $1`,
    [userId]
  );

  await updateServerRam(server.id);
}

export async function restartContainer(userId: string): Promise<void> {
  const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user?.server_id) throw new Error('User has no server assigned');

  const server = await db.getOne<any>('SELECT * FROM servers WHERE id = $1', [user.server_id]);
  if (!server) throw new Error('Server not found');

  const containerName = user.container_name || `openclaw-${userId}`;
  await sshExec(server.ip, `docker restart ${containerName}`);
}

export async function updateContainerConfig(userId: string, config: Record<string, any>): Promise<void> {
  const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user?.server_id) throw new Error('User has no server assigned');

  const server = await db.getOne<any>('SELECT * FROM servers WHERE id = $1', [user.server_id]);
  if (!server) throw new Error('Server not found');

  const configJson = JSON.stringify(config).replace(/"/g, '\\"');
  const containerName = user.container_name || `openclaw-${userId}`;

  await sshExec(
    server.ip,
    `docker exec ${containerName} sh -c 'echo "${configJson}" | openclaw config merge -'`
  );
}
