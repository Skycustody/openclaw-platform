import db from '../lib/db';
import { encrypt } from '../lib/encryption';
import { sshExec } from './ssh';
import { User } from '../types';
import { injectApiKeys } from './apiKeys';
import { readContainerConfig, writeContainerConfig } from './containerConfig';

// ── Helpers ──

const INSTANCE_DIR = '/opt/openclaw/instances';
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function validateUserId(userId: string): void {
  if (!UUID_RE.test(userId)) throw new Error('Invalid user ID format');
}

async function getUserContainer(userId: string): Promise<{
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

  const running = await sshExec(
    server.ip,
    `docker inspect ${containerName} --format='{{.State.Running}}' 2>/dev/null`
  ).catch(() => null);

  if (!running || !running.stdout.includes('true')) {
    const err: any = new Error('Your agent is not running. Open Agent, wait until it is online, then retry.');
    err.statusCode = 409;
    throw err;
  }

  return { serverIp: server.ip, containerName, user };
}


/**
 * Poll until a container is running, up to timeoutMs.
 */
async function waitForContainer(serverIp: string, containerName: string, timeoutMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const check = await sshExec(
      serverIp,
      `docker inspect ${containerName} --format='{{.State.Running}}' 2>/dev/null`
    ).catch(() => null);
    if (check?.stdout.includes('true')) return true;
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

// ── Telegram ──

export async function connectTelegram(userId: string, botToken: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  if (!res.ok) throw new Error('Invalid Telegram bot token');
  const botInfo: any = await res.json();

  const { serverIp, containerName, user } = await getUserContainer(userId);

  // Ensure API keys + model router are configured before starting the channel
  await injectApiKeys(serverIp, userId, containerName, user.plan as any);

  const config = await readContainerConfig(serverIp, userId);
  if (!config.channels) config.channels = {};
  config.channels.telegram = {
    enabled: true,
    botToken,
    dmPolicy: 'open',
    allowFrom: ['*'],
    groups: { '*': { requireMention: true } },
  };
  await writeContainerConfig(serverIp, userId, config);

  await sshExec(serverIp, `docker restart ${containerName}`);

  const ready = await waitForContainer(serverIp, containerName);
  if (!ready) {
    throw new Error('Agent failed to restart after configuring Telegram. Please try again.');
  }

  await db.query(
    `UPDATE user_channels
     SET telegram_token = $1, telegram_connected = true, telegram_chat_id = $2, updated_at = NOW()
     WHERE user_id = $3`,
    [encrypt(botToken), botInfo.result?.username || '', userId]
  );
}

export async function disconnectTelegram(userId: string): Promise<void> {
  try {
    const { serverIp, containerName } = await getUserContainer(userId);

    const config = await readContainerConfig(serverIp, userId);
    delete config.channels?.telegram;
    await writeContainerConfig(serverIp, userId, config);

    await sshExec(serverIp, `docker restart ${containerName}`);
  } catch {
    // agent might not be running — still update DB
  }

  await db.query(
    `UPDATE user_channels
     SET telegram_token = NULL, telegram_connected = false, telegram_chat_id = NULL, updated_at = NOW()
     WHERE user_id = $1`,
    [userId]
  );
}

// ── Discord ──

export async function connectDiscord(userId: string, botToken: string, guildId?: string): Promise<void> {
  const res = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bot ${botToken}` },
  });
  if (!res.ok) throw new Error('Invalid Discord bot token');

  const { serverIp, containerName } = await getUserContainer(userId);

  const config = await readContainerConfig(serverIp, userId);
  if (!config.channels) config.channels = {};
  config.channels.discord = {
    enabled: true,
    token: botToken,
    dmPolicy: 'open',
    allowFrom: ['*'],
  };
  await writeContainerConfig(serverIp, userId, config);

  await sshExec(serverIp, `docker restart ${containerName}`);

  const ready = await waitForContainer(serverIp, containerName);
  if (!ready) {
    throw new Error('Agent failed to restart after configuring Discord. Please try again.');
  }

  await db.query(
    `UPDATE user_channels
     SET discord_token = $1, discord_connected = true, discord_guild_id = $2, updated_at = NOW()
     WHERE user_id = $3`,
    [encrypt(botToken), guildId || null, userId]
  );
}

export async function disconnectDiscord(userId: string): Promise<void> {
  try {
    const { serverIp, containerName } = await getUserContainer(userId);

    const config = await readContainerConfig(serverIp, userId);
    delete config.channels?.discord;
    await writeContainerConfig(serverIp, userId, config);

    await sshExec(serverIp, `docker restart ${containerName}`);
  } catch {
    // agent might not be running
  }

  await db.query(
    `UPDATE user_channels
     SET discord_token = NULL, discord_connected = false, discord_guild_id = NULL, updated_at = NOW()
     WHERE user_id = $1`,
    [userId]
  );
}

// ── Slack ──

export async function connectSlack(userId: string, accessToken: string, teamId: string): Promise<void> {
  const { serverIp, containerName } = await getUserContainer(userId);

  const config = await readContainerConfig(serverIp, userId);
  if (!config.channels) config.channels = {};
  config.channels.slack = {
    enabled: true,
    token: accessToken,
  };
  await writeContainerConfig(serverIp, userId, config);

  await sshExec(serverIp, `docker restart ${containerName}`);

  const ready = await waitForContainer(serverIp, containerName);
  if (!ready) {
    throw new Error('Agent failed to restart after configuring Slack. Please try again.');
  }

  await db.query(
    `UPDATE user_channels
     SET slack_token = $1, slack_connected = true, slack_team_id = $2, updated_at = NOW()
     WHERE user_id = $3`,
    [encrypt(accessToken), teamId, userId]
  );
}

export async function disconnectSlack(userId: string): Promise<void> {
  try {
    const { serverIp, containerName } = await getUserContainer(userId);

    const config = await readContainerConfig(serverIp, userId);
    delete config.channels?.slack;
    await writeContainerConfig(serverIp, userId, config);

    await sshExec(serverIp, `docker restart ${containerName}`);
  } catch {
    // agent might not be running
  }

  await db.query(
    `UPDATE user_channels
     SET slack_token = NULL, slack_connected = false, slack_team_id = NULL, updated_at = NOW()
     WHERE user_id = $1`,
    [userId]
  );
}

// ── WhatsApp ──

/**
 * Extract QR data from combined log output.
 * Searches newest-to-oldest for:
 *  1. Raw Baileys pairing string (2@…) — renderable client-side via qrcode.react
 *  2. Any long base64-ish token that looks like a WhatsApp QR payload
 *  3. Content between ---QR CODE--- markers
 *  4. Unicode block-art QR (≥15 contiguous lines of block chars)
 */
function extractQrFromLogs(raw: string): string | null {
  const cleaned = raw.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  const lines = cleaned.split('\n');

  // 1. Raw Baileys pairing string (2@...) — search whole content then newest line
  const globalBaileys = cleaned.match(/(2@[A-Za-z0-9+/=,._-]{20,})/);
  if (globalBaileys) return globalBaileys[1];
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/(2@[A-Za-z0-9+/=,._-]{20,})/);
    if (m) return m[1];
  }

  // 2. Generic WhatsApp QR payload (long alphanumeric strings on their own line)
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (/^[A-Za-z0-9+/=,._@-]{50,}$/.test(trimmed) && !trimmed.startsWith('eyJ')) {
      return trimmed;
    }
  }

  // 3. Between ---QR CODE--- markers
  const mm = cleaned.match(/---\s*QR\s*CODE\s*---\r?\n([\s\S]*?)\r?\n[\s\S]*?---/i);
  if (mm) {
    const block = mm[1].trim();
    if (block.length > 10) return block;
  }

  // 4. Unicode block art — collect contiguous blocks, pick last ≥ 15 lines
  const qrRe = /[\u2580\u2584\u2588\u2591\u2592\u2593\u2596-\u259F]/;
  const blocks: string[][] = [];
  let cur: string[] = [];
  let gap = 0;

  for (const line of lines) {
    const t = line.trimEnd();
    if (qrRe.test(t) && t.length > 20) {
      cur.push(t);
      gap = 0;
    } else if (cur.length > 0) {
      if (++gap > 1) { blocks.push(cur); cur = []; gap = 0; }
    }
  }
  if (cur.length > 0) blocks.push(cur);

  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].length >= 15) return blocks[i].join('\n');
  }

  return null;
}

/**
 * Check for WhatsApp credentials on the host-mounted volume.
 */
async function hasWhatsAppCredentials(serverIp: string, userId: string): Promise<boolean> {
  const check = await sshExec(
    serverIp,
    `ls ${INSTANCE_DIR}/${userId}/credentials/whatsapp/*/creds.json 2>/dev/null || echo NONE`
  ).catch(() => null);
  return !!check && !check.stdout.includes('NONE');
}

/**
 * Start WhatsApp pairing:
 *  1. Write WhatsApp into the config via host filesystem
 *  2. Clear old QR artifacts
 *  3. Restart container and wait for it to be healthy
 *  4. Run `openclaw channels login --channel whatsapp` with output captured to the host volume
 *
 * Returns immediately — the frontend polls GET /channels/whatsapp/qr for the code.
 */
export async function initiateWhatsAppPairing(userId: string): Promise<{
  agentUrl: string;
  dashboardUrl: string;
  alreadyLinked: boolean;
}> {
  const { serverIp, containerName, user } = await getUserContainer(userId);

  const domain = process.env.DOMAIN || 'yourdomain.com';
  const subdomain = user.subdomain || '';
  const agentUrl = subdomain ? `https://${subdomain}.${domain}` : '';
  const dashboardUrl = agentUrl && user.gateway_token
    ? `${agentUrl}/?token=${encodeURIComponent(user.gateway_token)}`
    : agentUrl;

  // Ensure API keys + model router are configured before starting the channel
  await injectApiKeys(serverIp, userId, containerName, user.plan as any);

  // Write WhatsApp config via host filesystem (no docker exec needed)
  const config = await readContainerConfig(serverIp, userId);
  if (!config.channels) config.channels = {};
  if (!config.channels.whatsapp) {
    config.channels.whatsapp = { dmPolicy: 'open', allowFrom: ['*'] };
    await writeContainerConfig(serverIp, userId, config);
    console.log(`[whatsapp] Config written for user ${userId}`);
  }

  // Check credentials on host filesystem
  if (await hasWhatsAppCredentials(serverIp, userId)) {
    await db.query(
      `UPDATE user_channels SET whatsapp_connected = true, updated_at = NOW() WHERE user_id = $1`,
      [userId]
    );
    return { agentUrl, dashboardUrl, alreadyLinked: true };
  }

  // Clear old QR output so stale data isn't returned
  await sshExec(
    serverIp,
    `rm -f ${INSTANCE_DIR}/${userId}/whatsapp-qr.log`
  ).catch(() => {});

  // Restart so the gateway picks up WhatsApp config
  await sshExec(serverIp, `docker restart ${containerName}`);

  // Wait for container to come back up before launching login
  const ready = await waitForContainer(serverIp, containerName);
  if (!ready) {
    throw new Error('Agent failed to restart. Please try again in a moment.');
  }

  // Give the gateway time to finish startup so "channels login" can run
  await new Promise(r => setTimeout(r, 8000));

  console.log(`[whatsapp] Starting channels login for user ${userId}`);
  // Run `openclaw channels login --channel whatsapp` in background inside the container.
  // Output is written to the host-mounted volume so we can read it via SSH cat.
  const execResult = await sshExec(
    serverIp,
    `docker exec -d ${containerName} sh -c 'openclaw channels login --channel whatsapp > /root/.openclaw/whatsapp-qr.log 2>&1'`
  ).catch((err) => {
    console.warn(`[whatsapp] channels login exec failed:`, err.message);
    return { code: 1, stderr: err.message, stdout: '' };
  });

  if (execResult?.code !== 0) {
    console.warn(`[whatsapp] exec returned code ${execResult?.code} for user ${userId}`);
  }

  return { agentUrl, dashboardUrl, alreadyLinked: false };
}

/**
 * Poll for the WhatsApp QR code.
 * Reads from the host-mounted volume + docker logs for maximum coverage.
 */
export async function getWhatsAppQr(userId: string): Promise<{
  status: 'waiting' | 'qr' | 'paired' | 'finalizing' | 'error';
  qrText?: string;
  message?: string;
}> {
  let serverIp: string;
  let containerName: string;

  try {
    const result = await getUserContainer(userId);
    serverIp = result.serverIp;
    containerName = result.containerName;
  } catch {
    return { status: 'waiting', message: 'Waiting for agent to start...' };
  }

  // Check credentials on host filesystem
  if (await hasWhatsAppCredentials(serverIp, userId)) {
    // Credentials exist. Restart container so the gateway fully initializes
    // the WhatsApp connection (this completes the handshake on the phone side
    // and stops the phone from showing "logging in" forever).
    const needsRestart = await sshExec(
      serverIp,
      `cat ${INSTANCE_DIR}/${userId}/whatsapp-qr.log 2>/dev/null`
    ).catch(() => null);

    // If qr log still exists, this is the first time we're seeing paired status
    // after a fresh scan — restart the container to finalize the connection.
    if (needsRestart?.stdout && needsRestart.stdout.trim().length > 0) {
      console.log(`[whatsapp] Credentials found for ${userId}, restarting container to finalize connection`);

      // Clear the QR log so we don't restart again on next poll
      await sshExec(serverIp, `rm -f ${INSTANCE_DIR}/${userId}/whatsapp-qr.log`).catch(() => {});

      // Restart in background so this poll returns quickly
      void sshExec(serverIp, `docker restart ${containerName}`).catch(() => {});

      await db.query(
        `UPDATE user_channels SET whatsapp_connected = true, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );
      return { status: 'finalizing', message: 'Finalizing connection...' };
    }

    await db.query(
      `UPDATE user_channels SET whatsapp_connected = true, updated_at = NOW() WHERE user_id = $1`,
      [userId]
    );
    return { status: 'paired' };
  }

  // Read QR output from the host-mounted volume (primary source)
  const qrFile = await sshExec(
    serverIp,
    `cat ${INSTANCE_DIR}/${userId}/whatsapp-qr.log 2>/dev/null`
  ).catch(() => null);

  // Docker logs as fallback
  const logs = await sshExec(
    serverIp,
    `docker logs --tail 300 ${containerName} 2>&1`
  ).catch(() => null);

  const combined = [qrFile?.stdout, logs?.stdout].filter(Boolean).join('\n');
  if (!combined || combined.trim().length === 0) {
    return { status: 'waiting', message: 'Generating QR code...' };
  }

  // Check for QR first — if found, return it even if logs contain unrelated errors
  // (e.g. "failed to persist plugin" / "Unrecognized key: enabled" is non-fatal)
  const qrText = extractQrFromLogs(combined);
  if (qrText) {
    console.log(`[whatsapp] QR found for user ${userId}`);
    return { status: 'qr', qrText };
  }

  // Only then check for WhatsApp-specific fatal errors. Exclude non-fatal OpenClaw
  // persist errors ("failed to persist", "Unrecognized key: enabled").
  const lowerCombined = combined.toLowerCase();
  if (lowerCombined.includes('failed to persist plugin') || lowerCombined.includes('unrecognized key')) {
    return { status: 'waiting', message: 'Waiting for QR code from WhatsApp...' };
  }

  const whatsappErrorPatterns = [
    'Connection Closed',
    'QR refs attempts ended',
    'Stream Errored',
    'DisconnectReason',
    'connection refused',
    'ECONNREFUSED',
    'Unknown channel',
    'channel not found',
    'command not found',
    'is not a function',
  ];
  const hasWhatsAppError = whatsappErrorPatterns.some(p => lowerCombined.includes(p.toLowerCase()));
  if (hasWhatsAppError) {
    const errorLines = combined.split('\n')
      .filter(l => whatsappErrorPatterns.some(p => l.toLowerCase().includes(p.toLowerCase())))
      .slice(-3);
    const msg = errorLines.join(' ').trim().slice(0, 220) || 'WhatsApp connection failed. Click Retry to try again.';
    console.warn(`[whatsapp] Error for user ${userId}:`, msg);
    return { status: 'error', message: msg };
  }

  if (combined.trim().length > 50) {
    console.warn(`[whatsapp] Log output present but no QR extracted for user ${userId} (${combined.trim().length} chars)`);
  }

  return { status: 'waiting', message: 'Waiting for QR code from WhatsApp...' };
}

export async function checkWhatsAppStatus(userId: string): Promise<{ paired: boolean; unlinked?: boolean }> {
  try {
    const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user?.server_id) return { paired: false };

    const server = await db.getOne<any>('SELECT ip FROM servers WHERE id = $1', [user.server_id]);
    if (!server) return { paired: false };

    // Check if credentials exist on disk
    if (!(await hasWhatsAppCredentials(server.ip, userId))) {
      await db.query(
        `UPDATE user_channels SET whatsapp_connected = false, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );
      return { paired: false };
    }

    // Credentials exist — check recent logs for disconnect signals.
    // When a user removes the device from WhatsApp's linked devices list,
    // Baileys emits a disconnect event with statusCode 401 or 515 (logged out).
    const containerName = user.container_name || `openclaw-${userId}`;
    const logs = await sshExec(
      server.ip,
      `docker logs --tail 100 ${containerName} 2>&1`
    ).catch(() => null);

    if (logs?.stdout) {
      const lower = logs.stdout.toLowerCase();
      const loggedOut = lower.includes('logged out') ||
        lower.includes('device removed') ||
        lower.includes('statuscode: 401') ||
        lower.includes('connection closed') && lower.includes('loggedout');

      if (loggedOut) {
        // Device was unlinked from the phone — clean up
        await sshExec(
          server.ip,
          `rm -rf ${INSTANCE_DIR}/${userId}/credentials/whatsapp`
        ).catch(() => {});
        await db.query(
          `UPDATE user_channels SET whatsapp_connected = false, updated_at = NOW() WHERE user_id = $1`,
          [userId]
        );
        return { paired: false, unlinked: true };
      }
    }

    await db.query(
      `UPDATE user_channels SET whatsapp_connected = true, updated_at = NOW() WHERE user_id = $1`,
      [userId]
    );
    return { paired: true };
  } catch {
    return { paired: false };
  }
}

export async function confirmWhatsAppConnected(userId: string): Promise<void> {
  await db.query(
    `UPDATE user_channels SET whatsapp_connected = true, updated_at = NOW() WHERE user_id = $1`,
    [userId]
  );
}

export async function disconnectWhatsApp(userId: string): Promise<void> {
  try {
    const { serverIp, containerName } = await getUserContainer(userId);

    // Remove WhatsApp from config and clear all credentials/session data
    const config = await readContainerConfig(serverIp, userId);
    delete config.channels?.whatsapp;
    await writeContainerConfig(serverIp, userId, config);

    await sshExec(
      serverIp,
      `rm -rf ${INSTANCE_DIR}/${userId}/credentials/whatsapp ${INSTANCE_DIR}/${userId}/whatsapp-qr.log`
    ).catch(() => {});

    await sshExec(serverIp, `docker restart ${containerName}`);
  } catch {
    // Agent might not be running — still clean up credentials if possible
    try {
      const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
      if (user?.server_id) {
        const server = await db.getOne<any>('SELECT ip FROM servers WHERE id = $1', [user.server_id]);
        if (server) {
          await sshExec(
            server.ip,
            `rm -rf ${INSTANCE_DIR}/${userId}/credentials/whatsapp ${INSTANCE_DIR}/${userId}/whatsapp-qr.log`
          ).catch(() => {});
        }
      }
    } catch {}
  }

  await db.query(
    `UPDATE user_channels SET whatsapp_connected = false, updated_at = NOW() WHERE user_id = $1`,
    [userId]
  );
}

// ── Get all channel statuses ──

export async function getChannelStatuses(userId: string): Promise<{
  telegram: boolean;
  discord: boolean;
  slack: boolean;
  whatsapp: boolean;
  signal: boolean;
}> {
  const channels = await db.getOne<any>(
    'SELECT * FROM user_channels WHERE user_id = $1',
    [userId]
  );

  if (!channels) {
    return { telegram: false, discord: false, slack: false, whatsapp: false, signal: false };
  }

  return {
    telegram: channels.telegram_connected,
    discord: channels.discord_connected,
    slack: channels.slack_connected,
    whatsapp: channels.whatsapp_connected,
    signal: channels.signal_connected,
  };
}

export async function getMessageCounts(userId: string): Promise<Record<string, number>> {
  const result = await db.getMany<{ channel: string; count: string }>(
    `SELECT channel, COUNT(*) as count
     FROM conversations
     WHERE user_id = $1 AND created_at > DATE_TRUNC('month', NOW())
     GROUP BY channel`,
    [userId]
  );

  const counts: Record<string, number> = {};
  for (const r of result) {
    counts[r.channel] = parseInt(r.count);
  }
  return counts;
}
