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

  // Generate a URL-safe subdomain from email
  const subdomain = email
    .split('@')[0]
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .slice(0, 20) + '-' + uuid().slice(0, 6);

  const referralCode = uuid().slice(0, 8).toUpperCase();
  const containerName = `openclaw-${userId.slice(0, 12)}`;

  // Step 1: Find best server
  const server = await findBestServer(limits.ramMb);

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

  const createCmd = [
    `mkdir -p /opt/openclaw/instances/${userId}`,
    `&& docker pull ${process.env.DOCKER_REGISTRY || 'openclaw/openclaw'}:latest`,
    `&& docker run -d`,
    `--name ${containerName}`,
    `--restart unless-stopped`,
    `--network openclaw-net`,
    `--memory ${limits.ramMb}m`,
    `--memory-swap ${limits.ramMb}m`,
    `--cpus ${limits.cpus}`,
    `-e USER_ID=${userId}`,
    `-e S3_BUCKET=${s3Bucket}`,
    `-e PLATFORM_API=${apiUrl}`,
    `-e BROWSERLESS_URL=wss://production-sfo.browserless.io?token=${browserlessToken}`,
    `-v /opt/openclaw/instances/${userId}:/data`,
    `--label traefik.enable=true`,
    `--label "traefik.http.routers.${containerName}.rule=Host(\\\`${subdomain}.${domain}\\\`)"`,
    `--label traefik.http.routers.${containerName}.tls=true`,
    `--label traefik.http.routers.${containerName}.tls.certresolver=letsencrypt`,
    `--label traefik.http.services.${containerName}.loadbalancer.server.port=18789`,
    `${process.env.DOCKER_REGISTRY || 'openclaw/openclaw'}:latest`,
  ].join(' ');

  await sshExec(server.ip, createCmd);

  // Step 6: Wait for container to be ready
  try {
    await waitForReady(server.ip, containerName, 60000);
  } catch {
    console.warn(`Container ${containerName} health check timed out but may still start`);
  }

  // Step 7: Update status to active
  await db.query(
    `UPDATE users SET status = 'active' WHERE id = $1`,
    [userId]
  );

  await updateServerRam(server.id);

  // Step 8: Send welcome email
  try {
    await sendWelcomeEmail(email, subdomain, domain);
  } catch (err) {
    console.error('Welcome email failed:', err);
  }

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
