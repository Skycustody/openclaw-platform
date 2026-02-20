import db from '../lib/db';
import { encrypt } from '../lib/encryption';
import { sshExec } from './ssh';
import { User } from '../types';

// ── Helpers ──

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

function tokenToBase64(token: string): string {
  return Buffer.from(token).toString('base64');
}

// ── Telegram ──

export async function connectTelegram(userId: string, botToken: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  if (!res.ok) throw new Error('Invalid Telegram bot token');
  const botInfo: any = await res.json();

  const { serverIp, containerName } = await getUserContainer(userId);
  const b64 = tokenToBase64(botToken);

  const result = await sshExec(
    serverIp,
    `docker exec ${containerName} sh -c 'openclaw channels add --channel telegram --token "$(echo ${b64} | base64 -d)" 2>&1'`
  );

  if (result.code !== 0 && !result.stdout.includes('already')) {
    throw new Error(`Failed to configure Telegram: ${result.stdout || result.stderr}`);
  }

  await sshExec(serverIp, `docker restart ${containerName}`);

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
    await sshExec(
      serverIp,
      `docker exec ${containerName} openclaw channels remove --channel telegram 2>&1`
    ).catch(() => {});
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
  const b64 = tokenToBase64(botToken);

  // Discord uses config set (per official OpenClaw docs)
  const result = await sshExec(
    serverIp,
    [
      `docker exec ${containerName} sh -c '`,
      `TOKEN="$(echo ${b64} | base64 -d)" && `,
      `openclaw config set channels.discord.token "\\"$TOKEN\\"" --json && `,
      `openclaw config set channels.discord.enabled true --json`,
      `' 2>&1`,
    ].join('')
  );

  if (result.code !== 0) {
    throw new Error(`Failed to configure Discord: ${result.stdout || result.stderr}`);
  }

  await sshExec(serverIp, `docker restart ${containerName}`);

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
    await sshExec(
      serverIp,
      `docker exec ${containerName} openclaw channels remove --channel discord 2>&1`
    ).catch(() => {});
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
  const b64 = tokenToBase64(accessToken);

  const result = await sshExec(
    serverIp,
    `docker exec ${containerName} sh -c 'openclaw channels add --channel slack --token "$(echo ${b64} | base64 -d)" 2>&1'`
  );

  if (result.code !== 0 && !result.stdout.includes('already')) {
    throw new Error(`Failed to configure Slack: ${result.stdout || result.stderr}`);
  }

  await sshExec(serverIp, `docker restart ${containerName}`);

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
    await sshExec(
      serverIp,
      `docker exec ${containerName} openclaw channels remove --channel slack 2>&1`
    ).catch(() => {});
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

// ── WhatsApp (QR code pairing via OpenClaw CLI) ──

export async function initiateWhatsAppPairing(userId: string): Promise<string> {
  const { serverIp, containerName } = await getUserContainer(userId);

  // Kill any previous login process and clear old QR output
  await sshExec(
    serverIp,
    `docker exec ${containerName} sh -c 'pkill -f "channels login" 2>/dev/null; rm -f /tmp/wa-qr.txt' || true`
  ).catch(() => {});

  // Ensure WhatsApp channel exists in config
  await sshExec(
    serverIp,
    `docker exec ${containerName} openclaw channels add --channel whatsapp 2>/dev/null || true`
  );

  // Start WhatsApp login in the background — this generates the QR code
  await sshExec(
    serverIp,
    `docker exec ${containerName} sh -c 'nohup openclaw channels login --channel whatsapp > /tmp/wa-qr.txt 2>&1 & echo started'`
  );

  // Poll for QR code output (typically appears within 3-10 seconds)
  let output = '';
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise(r => setTimeout(r, 2000));
    const result = await sshExec(
      serverIp,
      `docker exec ${containerName} cat /tmp/wa-qr.txt 2>/dev/null`
    ).catch(() => null);

    output = (result?.stdout || '').trim();

    // QR codes rendered by qrcode-terminal contain Unicode block characters
    const hasQr = output.includes('\u2588') || output.includes('\u2584') ||
                  output.includes('\u2580') || output.length > 200;

    if (output && hasQr) break;

    // Also check if the login returned an error or already-linked message
    if (output && (output.includes('already') || output.includes('linked') || output.includes('error'))) break;
  }

  if (!output) {
    throw Object.assign(
      new Error('Could not generate WhatsApp QR code. Make sure your agent is online, then try again.'),
      { statusCode: 502 }
    );
  }

  // Strip ANSI escape codes for clean display
  output = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

  return output;
}

export async function checkWhatsAppStatus(userId: string): Promise<{ paired: boolean; detail: string }> {
  try {
    const { serverIp, containerName } = await getUserContainer(userId);

    // Check channel list for WhatsApp status
    const result = await sshExec(
      serverIp,
      `docker exec ${containerName} openclaw channels list 2>&1`
    ).catch(() => null);

    const output = (result?.stdout || '').toLowerCase();
    const isPaired = output.includes('whatsapp') && (
      output.includes('linked') || output.includes('connected') ||
      output.includes('authenticated') || output.includes('active')
    );

    if (isPaired) {
      await db.query(
        `UPDATE user_channels SET whatsapp_connected = true, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );
    }

    // Also check if the login process output indicates success
    const loginResult = await sshExec(
      serverIp,
      `docker exec ${containerName} cat /tmp/wa-qr.txt 2>/dev/null`
    ).catch(() => null);

    const loginOutput = (loginResult?.stdout || '').toLowerCase();
    const loginSuccess = loginOutput.includes('success') || loginOutput.includes('linked') ||
                         loginOutput.includes('authenticated') || loginOutput.includes('connected');

    if (loginSuccess && !isPaired) {
      await db.query(
        `UPDATE user_channels SET whatsapp_connected = true, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );
    }

    return {
      paired: isPaired || loginSuccess,
      detail: result?.stdout || loginResult?.stdout || '',
    };
  } catch (err: any) {
    return { paired: false, detail: err?.message || 'Could not check status' };
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
    // Logout clears WhatsApp auth credentials
    await sshExec(
      serverIp,
      `docker exec ${containerName} openclaw channels logout --channel whatsapp 2>&1`
    ).catch(() => {});
    // Remove channel from config
    await sshExec(
      serverIp,
      `docker exec ${containerName} openclaw channels remove --channel whatsapp 2>&1`
    ).catch(() => {});
    await sshExec(serverIp, `docker restart ${containerName}`);
  } catch {
    // agent might not be running
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
