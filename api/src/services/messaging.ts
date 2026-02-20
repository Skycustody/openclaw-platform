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

/**
 * Build a Node.js script that reads openclaw.json from whichever mount
 * exists (/root/.openclaw or /data), applies a transform, and writes back
 * to both locations for compat with old and new container mounts.
 */
function configScript(transformBody: string): string {
  return `
    const fs = require("fs"); const path = require("path");
    const paths = ["/root/.openclaw/openclaw.json", "/data/openclaw.json"];
    let cfg = {};
    for (const p of paths) { try { cfg = JSON.parse(fs.readFileSync(p,"utf8")); break; } catch {} }
    if (!cfg.channels) cfg.channels = {};
    ${transformBody}
    const out = JSON.stringify(cfg, null, 2);
    for (const p of paths) { try { fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p, out); } catch {} }
    console.log("OK");
  `.replace(/\n/g, ' ');
}

// ── Telegram ──

export async function connectTelegram(userId: string, botToken: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  if (!res.ok) throw new Error('Invalid Telegram bot token');
  const botInfo: any = await res.json();

  const { serverIp, containerName } = await getUserContainer(userId);
  const b64 = tokenToBase64(botToken);

  const script = configScript(
    `cfg.channels.telegram = { enabled: true, botToken: Buffer.from("${b64}","base64").toString() };`
  );

  const result = await sshExec(
    serverIp,
    `docker exec ${containerName} node -e '${script.replace(/'/g, "'\\''")}'`
  );

  if (result.code !== 0) {
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

    const removeScript = configScript(`delete cfg.channels.telegram;`);
    await sshExec(
      serverIp,
      `docker exec ${containerName} node -e '${removeScript.replace(/'/g, "'\\''")}'`
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

  const script = configScript(
    `cfg.channels.discord = { enabled: true, token: Buffer.from("${b64}","base64").toString() };`
  );

  const result = await sshExec(
    serverIp,
    `docker exec ${containerName} node -e '${script.replace(/'/g, "'\\''")}'`
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

    const removeScript = configScript(`delete cfg.channels.discord;`);
    await sshExec(
      serverIp,
      `docker exec ${containerName} node -e '${removeScript.replace(/'/g, "'\\''")}'`
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

  const script = configScript(
    `cfg.channels.slack = { enabled: true, token: Buffer.from("${b64}","base64").toString() };`
  );

  const result = await sshExec(
    serverIp,
    `docker exec ${containerName} node -e '${script.replace(/'/g, "'\\''")}'`
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

    const removeScript = configScript(`delete cfg.channels.slack;`);
    await sshExec(
      serverIp,
      `docker exec ${containerName} node -e '${removeScript.replace(/'/g, "'\\''")}'`
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

// ── WhatsApp ──
// The gateway sends QR codes via WebSocket to the Control UI only.
// We add the channel config, restart the gateway, then direct the user
// to their Agent Dashboard where the built-in Control UI shows the QR.

export async function initiateWhatsAppPairing(userId: string): Promise<{ agentUrl: string; alreadyLinked: boolean }> {
  const { serverIp, containerName, user } = await getUserContainer(userId);

  const domain = process.env.DOMAIN || 'yourdomain.com';
  const subdomain = user.subdomain || '';

  // Build agent URL with gateway token for auto-auth
  let agentUrl = subdomain ? `https://${subdomain}.${domain}` : '';
  const token = user.gateway_token || '';
  if (agentUrl && token) {
    const wsUrl = encodeURIComponent(`wss://${subdomain}.${domain}`);
    agentUrl = `${agentUrl}/?gatewayUrl=${wsUrl}&token=${token}`;
  }

  // Write WhatsApp config to openclaw.json via Node.js
  // Write to both /root/.openclaw/ (new mount) and /data/ (old mount) for compat
  const addScript = `
    const fs = require("fs");
    const paths = ["/root/.openclaw/openclaw.json", "/data/openclaw.json"];
    let cfg = {};
    for (const p of paths) { try { cfg = JSON.parse(fs.readFileSync(p,"utf8")); break; } catch {} }
    if (!cfg.channels) cfg.channels = {};
    const existed = !!cfg.channels.whatsapp;
    cfg.channels.whatsapp = Object.assign(cfg.channels.whatsapp || {}, { dmPolicy: "open", allowFrom: ["*"] });
    const out = JSON.stringify(cfg, null, 2);
    for (const p of paths) { try { fs.mkdirSync(require("path").dirname(p),{recursive:true}); fs.writeFileSync(p, out); } catch {} }
    console.log(existed ? "EXISTS" : "ADDED");
  `.replace(/\n/g, ' ');

  const addResult = await sshExec(
    serverIp,
    `docker exec ${containerName} node -e '${addScript.replace(/'/g, "'\\''")}'`
  );
  console.log(`[whatsapp] Config update: ${addResult.stdout}`);

  // Check if WhatsApp credentials already exist (already paired)
  const credsCheck = await sshExec(
    serverIp,
    `docker exec ${containerName} sh -c 'ls /root/.openclaw/credentials/whatsapp/*/creds.json 2>/dev/null || ls /data/credentials/whatsapp/*/creds.json 2>/dev/null || echo NONE'`
  ).catch(() => null);

  if (credsCheck && !credsCheck.stdout.includes('NONE')) {
    await db.query(
      `UPDATE user_channels SET whatsapp_connected = true, updated_at = NOW() WHERE user_id = $1`,
      [userId]
    );
    return { agentUrl, alreadyLinked: true };
  }

  // Restart container so the gateway starts WhatsApp and shows QR in Control UI
  await sshExec(serverIp, `docker restart ${containerName}`);

  return { agentUrl, alreadyLinked: false };
}

export async function checkWhatsAppStatus(userId: string): Promise<{ paired: boolean }> {
  try {
    const { serverIp, containerName } = await getUserContainer(userId);

    // Check if WhatsApp credentials exist (means pairing succeeded)
    const credsCheck = await sshExec(
      serverIp,
      `docker exec ${containerName} sh -c 'ls /root/.openclaw/credentials/whatsapp/*/creds.json 2>/dev/null || ls /data/credentials/whatsapp/*/creds.json 2>/dev/null || echo NONE'`
    ).catch(() => null);

    const isPaired = !!credsCheck && !credsCheck.stdout.includes('NONE');

    if (isPaired) {
      await db.query(
        `UPDATE user_channels SET whatsapp_connected = true, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );
    }

    return { paired: isPaired };
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

    const removeScript = configScript(`
      delete cfg.channels.whatsapp;
      try { require("fs").rmSync("/root/.openclaw/credentials/whatsapp", { recursive: true, force: true }); } catch {}
      try { require("fs").rmSync("/data/credentials/whatsapp", { recursive: true, force: true }); } catch {}
    `);
    await sshExec(
      serverIp,
      `docker exec ${containerName} node -e '${removeScript.replace(/'/g, "'\\''")}'`
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
