import db from '../lib/db';
import { encrypt, decrypt } from '../lib/encryption';
import { sshExec } from './ssh';
import { restartContainer, updateContainerConfig } from './provisioning';
import { User } from '../types';

// ── Telegram ──

export async function connectTelegram(userId: string, botToken: string): Promise<void> {
  // Validate token
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  if (!res.ok) throw new Error('Invalid Telegram bot token');

  const botInfo: any = await res.json();

  await updateContainerConfig(userId, {
    'channels.telegram.token': botToken,
    'channels.telegram.enabled': true,
  });

  await restartContainer(userId);

  await db.query(
    `UPDATE user_channels
     SET telegram_token = $1, telegram_connected = true, telegram_chat_id = $2, updated_at = NOW()
     WHERE user_id = $3`,
    [encrypt(botToken), botInfo.result?.username || '', userId]
  );
}

export async function disconnectTelegram(userId: string): Promise<void> {
  await updateContainerConfig(userId, {
    'channels.telegram.enabled': false,
  });

  await restartContainer(userId);

  await db.query(
    `UPDATE user_channels
     SET telegram_token = NULL, telegram_connected = false, telegram_chat_id = NULL, updated_at = NOW()
     WHERE user_id = $1`,
    [userId]
  );
}

// ── Discord ──

export async function connectDiscord(userId: string, botToken: string, guildId?: string): Promise<void> {
  // Validate token
  const res = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bot ${botToken}` },
  });
  if (!res.ok) throw new Error('Invalid Discord bot token');

  await updateContainerConfig(userId, {
    'channels.discord.token': botToken,
    'channels.discord.enabled': true,
  });

  await restartContainer(userId);

  await db.query(
    `UPDATE user_channels
     SET discord_token = $1, discord_connected = true, discord_guild_id = $2, updated_at = NOW()
     WHERE user_id = $3`,
    [encrypt(botToken), guildId || null, userId]
  );
}

export async function disconnectDiscord(userId: string): Promise<void> {
  await updateContainerConfig(userId, { 'channels.discord.enabled': false });
  await restartContainer(userId);

  await db.query(
    `UPDATE user_channels
     SET discord_token = NULL, discord_connected = false, discord_guild_id = NULL, updated_at = NOW()
     WHERE user_id = $1`,
    [userId]
  );
}

// ── Slack ──

export async function connectSlack(userId: string, accessToken: string, teamId: string): Promise<void> {
  await updateContainerConfig(userId, {
    'channels.slack.token': accessToken,
    'channels.slack.enabled': true,
  });

  await restartContainer(userId);

  await db.query(
    `UPDATE user_channels
     SET slack_token = $1, slack_connected = true, slack_team_id = $2, updated_at = NOW()
     WHERE user_id = $3`,
    [encrypt(accessToken), teamId, userId]
  );
}

export async function disconnectSlack(userId: string): Promise<void> {
  await updateContainerConfig(userId, { 'channels.slack.enabled': false });
  await restartContainer(userId);

  await db.query(
    `UPDATE user_channels
     SET slack_token = NULL, slack_connected = false, slack_team_id = NULL, updated_at = NOW()
     WHERE user_id = $1`,
    [userId]
  );
}

// ── WhatsApp (QR code pairing) ──

export async function initiateWhatsAppPairing(userId: string): Promise<string> {
  const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user?.server_id) throw new Error('User has no server assigned');

  const server = await db.getOne<any>('SELECT ip FROM servers WHERE id = $1', [user.server_id]);
  if (!server) throw new Error('Server not found');

  const containerName = user.container_name || `openclaw-${userId}`;
  const result = await sshExec(
    server.ip,
    `docker exec ${containerName} openclaw channels add whatsapp 2>&1`
  );

  // Extract QR data from command output
  const qrMatch = result.stdout.match(/QR_DATA:(.+)/);
  if (qrMatch) return qrMatch[1];

  return result.stdout;
}

export async function confirmWhatsAppConnected(userId: string): Promise<void> {
  await db.query(
    `UPDATE user_channels SET whatsapp_connected = true, updated_at = NOW() WHERE user_id = $1`,
    [userId]
  );
}

export async function disconnectWhatsApp(userId: string): Promise<void> {
  await updateContainerConfig(userId, { 'channels.whatsapp.enabled': false });
  await restartContainer(userId);

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
