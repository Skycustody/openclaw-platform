import db from '../lib/db';
import { sshExec } from './ssh';
import { User } from '../types';

const INSTANCE_DIR = '/opt/openclaw/instances';
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CONTAINER_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/;

function validateUserId(userId: string): void {
  if (!UUID_RE.test(userId)) throw new Error('Invalid user ID format');
}

function validateContainerName(name: string): void {
  if (!CONTAINER_NAME_RE.test(name)) throw new Error('Invalid container name format');
}

export async function getUserContainer(userId: string): Promise<{
  serverIp: string;
  containerName: string;
  user: User;
}> {
  const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user?.server_id) {
    const err: any = new Error('Your agent is not provisioned yet. Open Agent first, then try again.');
    err.statusCode = 409;
    throw err;
  }

  const server = await db.getOne<any>('SELECT ip FROM servers WHERE id = $1', [user.server_id]);
  if (!server) {
    const err: any = new Error('Worker server not found. Please open your agent again to re-provision.');
    err.statusCode = 409;
    throw err;
  }

  const containerName = user.container_name || `openclaw-${userId}`;
  validateContainerName(containerName);

  return { serverIp: server.ip, containerName, user };
}

export async function requireRunningContainer(userId: string): Promise<{
  serverIp: string;
  containerName: string;
  user: User;
}> {
  const result = await getUserContainer(userId);

  const running = await sshExec(
    result.serverIp,
    `docker inspect ${result.containerName} --format='{{.State.Running}}' 2>/dev/null`
  ).catch(() => null);

  if (!running || !running.stdout.includes('true')) {
    const err: any = new Error('Your agent is not running. Open Agent, wait until it is online, then retry.');
    err.statusCode = 409;
    throw err;
  }

  return result;
}

export async function readContainerConfig(serverIp: string, userId: string): Promise<Record<string, any>> {
  validateUserId(userId);
  const result = await sshExec(
    serverIp,
    `cat ${INSTANCE_DIR}/${userId}/openclaw.json 2>/dev/null || echo '{}'`
  );
  try {
    return JSON.parse(result.stdout);
  } catch {
    return {};
  }
}

export async function writeContainerConfig(serverIp: string, userId: string, config: Record<string, any>): Promise<void> {
  validateUserId(userId);
  const b64 = Buffer.from(JSON.stringify(config, null, 2)).toString('base64');
  const result = await sshExec(
    serverIp,
    `echo '${b64}' | base64 -d > ${INSTANCE_DIR}/${userId}/openclaw.json`
  );
  if (result.code !== 0) {
    throw new Error(`Failed to write config: ${result.stderr}`);
  }
}

export async function restartContainer(serverIp: string, containerName: string, waitMs = 30000): Promise<boolean> {
  validateContainerName(containerName);
  await sshExec(serverIp, `docker restart ${containerName}`);
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    const check = await sshExec(
      serverIp,
      `docker inspect ${containerName} --format='{{.State.Running}}' 2>/dev/null`
    ).catch(() => null);
    if (check?.stdout.includes('true')) return true;
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

/**
 * Re-apply gateway config to a RUNNING container via `openclaw config merge`.
 *
 * This is necessary because existing containers run `openclaw doctor --fix`
 * at startup, which strips gateway auth keys (dangerouslyDisableDeviceAuth,
 * allowInsecureAuth, etc.) from openclaw.json. Without these keys the gateway
 * demands device pairing, breaking the browser tool and iframe embed.
 *
 * Call this AFTER the container has fully started (gateway is listening).
 */
export async function reapplyGatewayConfig(
  serverIp: string,
  userId: string,
  containerName: string,
): Promise<void> {
  validateUserId(userId);
  validateContainerName(containerName);

  const tokenRow = await db.getOne<{ gateway_token: string }>(
    'SELECT gateway_token FROM users WHERE id = $1',
    [userId]
  );
  if (!tokenRow?.gateway_token) return;

  const token = tokenRow.gateway_token;

  const commands = [
    `openclaw config set browser.defaultProfile openclaw`,
    `openclaw config set browser.headless true`,
    `openclaw config set browser.noSandbox true`,
    `openclaw devices approve --latest --token "${token}"`,
  ].join(' 2>/dev/null; ') + ' 2>/dev/null';

  await sshExec(
    serverIp,
    `docker exec ${containerName} sh -c '${commands}'`
  ).catch((err) => {
    console.warn(`[reapplyGatewayConfig] config/pairing failed for ${containerName}:`, err.message);
  });
}

export async function sendContainerMessage(
  serverIp: string,
  containerName: string,
  message: string,
): Promise<string> {
  validateContainerName(containerName);
  const msgB64 = Buffer.from(message).toString('base64');
  const cmd = `echo '${msgB64}' | base64 -d | timeout 120 docker exec -i ${containerName} openclaw run --stdin 2>&1`;

  const result = await sshExec(serverIp, cmd);
  return result.stdout || result.stderr || 'Task completed';
}
