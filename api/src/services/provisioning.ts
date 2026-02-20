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

  const subdomain = email
    .split('@')[0]
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .slice(0, 20) + '-' + uuid().slice(0, 6);

  const referralCode = uuid().slice(0, 8).toUpperCase();
  const containerName = `openclaw-${userId.slice(0, 12)}`;

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

  // Create data directory
  const mkdirResult = await sshExec(server.ip, `mkdir -p /opt/openclaw/instances/${userId}`);
  if (mkdirResult.code !== 0) {
    console.error(`[provision] mkdir failed:`, mkdirResult.stderr);
    throw new Error(`mkdir failed: ${mkdirResult.stderr}`);
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

  // Verify image exists locally
  const imageCheck = await sshExec(server.ip, `docker image inspect ${image} > /dev/null 2>&1 && echo OK || echo MISSING`);
  if (imageCheck.stdout.includes('MISSING')) {
    throw new Error(`Docker image ${image} not found on server ${server.ip}. Build it first: cd /opt/openclaw-platform/docker && docker build -t ${image} -f Dockerfile.openclaw .`);
  }

  // Run container — each flag on its own line for clarity
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
    `-e "BROWSERLESS_URL=wss://production-sfo.browserless.io?token=${browserlessToken}"`,
    `-v /opt/openclaw/instances/${userId}:/data`,
    `--label traefik.enable=true`,
    `--label 'traefik.http.routers.${containerName}.rule=Host(\`${hostRule}\`)'`,
    `--label 'traefik.http.routers.${containerName}.entrypoints=web'`,
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
