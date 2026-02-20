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

  // Write Telegram config using Node.js inside the container (CLI-version-safe)
  const script = `
    const fs = require("fs");
    const p = "/root/.openclaw/openclaw.json";
    let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(p,"utf8")); } catch {}
    if (!cfg.channels) cfg.channels = {};
    cfg.channels.telegram = { enabled: true, botToken: Buffer.from("${b64}","base64").toString() };
    fs.writeFileSync(p, JSON.stringify(cfg,null,2));
    console.log("OK");
  `.replace(/\n/g, ' ');

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

    // Remove telegram from config using Node.js (CLI-version-safe)
    const removeScript = `
      const fs = require("fs");
      const p = "/root/.openclaw/openclaw.json";
      try { const cfg = JSON.parse(fs.readFileSync(p,"utf8")); delete cfg.channels?.telegram; fs.writeFileSync(p, JSON.stringify(cfg,null,2)); } catch {}
      console.log("REMOVED");
    `.replace(/\n/g, ' ');
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

  const script = `
    const fs = require("fs");
    const p = "/root/.openclaw/openclaw.json";
    let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(p,"utf8")); } catch {}
    if (!cfg.channels) cfg.channels = {};
    cfg.channels.discord = { enabled: true, token: Buffer.from("${b64}","base64").toString() };
    fs.writeFileSync(p, JSON.stringify(cfg,null,2));
    console.log("OK");
  `.replace(/\n/g, ' ');

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

    const removeScript = `
      const fs = require("fs");
      const p = "/root/.openclaw/openclaw.json";
      try { const cfg = JSON.parse(fs.readFileSync(p,"utf8")); delete cfg.channels?.discord; fs.writeFileSync(p, JSON.stringify(cfg,null,2)); } catch {}
      console.log("REMOVED");
    `.replace(/\n/g, ' ');
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

  const script = `
    const fs = require("fs");
    const p = "/root/.openclaw/openclaw.json";
    let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(p,"utf8")); } catch {}
    if (!cfg.channels) cfg.channels = {};
    cfg.channels.slack = { enabled: true, token: Buffer.from("${b64}","base64").toString() };
    fs.writeFileSync(p, JSON.stringify(cfg,null,2));
    console.log("OK");
  `.replace(/\n/g, ' ');

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

    const removeScript = `
      const fs = require("fs");
      const p = "/root/.openclaw/openclaw.json";
      try { const cfg = JSON.parse(fs.readFileSync(p,"utf8")); delete cfg.channels?.slack; fs.writeFileSync(p, JSON.stringify(cfg,null,2)); } catch {}
      console.log("REMOVED");
    `.replace(/\n/g, ' ');
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

// ── WhatsApp (QR code pairing via gateway restart) ──

export async function initiateWhatsAppPairing(userId: string): Promise<{ qrData: string; agentUrl: string }> {
  const { serverIp, containerName, user } = await getUserContainer(userId);

  const domain = process.env.DOMAIN || 'yourdomain.com';
  const subdomain = user.subdomain || '';
  const agentBase = subdomain ? `https://${subdomain}.${domain}` : '';

  // Use Node.js inside the container to add WhatsApp to the config
  // This is reliable regardless of which openclaw CLI version is installed
  const addWhatsAppScript = `
    const fs = require("fs");
    const p = "/root/.openclaw/openclaw.json";
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
    if (!cfg.channels) cfg.channels = {};
    if (!cfg.channels.whatsapp) {
      cfg.channels.whatsapp = { dmPolicy: "open", allowFrom: ["*"] };
      fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
      console.log("ADDED");
    } else {
      console.log("EXISTS");
    }
  `.replace(/\n/g, ' ');

  const addResult = await sshExec(
    serverIp,
    `docker exec ${containerName} node -e '${addWhatsAppScript.replace(/'/g, "'\\''")}'`
  );

  console.log(`[whatsapp] Config update: ${addResult.stdout}`);

  // Restart the container so the gateway connects WhatsApp and generates a QR
  await sshExec(serverIp, `docker restart ${containerName}`);

  // Wait for gateway to boot and output the QR code to logs
  let qrOutput = '';
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise(r => setTimeout(r, 3000));

    const logsResult = await sshExec(
      serverIp,
      `docker logs --tail 80 ${containerName} 2>&1`
    ).catch(() => null);

    const raw = (logsResult?.stdout || '') + '\n' + (logsResult?.stderr || '');
    // Strip ANSI escape codes
    const cleaned = raw.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

    // Look for QR code block characters in the logs
    const lines = cleaned.split('\n');
    let firstQr = -1;
    let lastQr = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('\u2588') || lines[i].includes('\u2584') || lines[i].includes('\u2580')) {
        if (firstQr === -1) firstQr = i;
        lastQr = i;
      }
    }

    if (firstQr >= 0 && lastQr > firstQr) {
      qrOutput = lines.slice(firstQr, lastQr + 1).join('\n');
      break;
    }

    // Check if WhatsApp is already linked (no QR needed)
    if (cleaned.toLowerCase().includes('whatsapp') &&
        (cleaned.toLowerCase().includes('connected') || cleaned.toLowerCase().includes('linked'))) {
      await db.query(
        `UPDATE user_channels SET whatsapp_connected = true, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );
      return { qrData: '__ALREADY_LINKED__', agentUrl: agentBase };
    }
  }

  if (!qrOutput && agentBase) {
    // QR not found in logs — direct user to their agent's Control UI
    return { qrData: '', agentUrl: agentBase };
  }

  if (!qrOutput) {
    throw Object.assign(
      new Error('Could not generate WhatsApp QR code. Make sure your agent is online, then try again.'),
      { statusCode: 502 }
    );
  }

  return { qrData: qrOutput, agentUrl: agentBase };
}

export async function checkWhatsAppStatus(userId: string): Promise<{ paired: boolean; detail: string }> {
  try {
    const { serverIp, containerName } = await getUserContainer(userId);

    // Check container logs for WhatsApp connection status
    const logsResult = await sshExec(
      serverIp,
      `docker logs --tail 40 ${containerName} 2>&1`
    ).catch(() => null);

    const output = (logsResult?.stdout || '').toLowerCase() + (logsResult?.stderr || '').toLowerCase();
    const isPaired = output.includes('whatsapp') && (
      output.includes('connected') || output.includes('linked') ||
      output.includes('authenticated') || output.includes('active') ||
      output.includes('ready')
    );

    if (isPaired) {
      await db.query(
        `UPDATE user_channels SET whatsapp_connected = true, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );
    }

    return { paired: isPaired, detail: logsResult?.stdout || '' };
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

    // Remove WhatsApp from config and clear credentials using Node.js
    const removeScript = `
      const fs = require("fs"); const path = require("path");
      const p = "/root/.openclaw/openclaw.json";
      try { const cfg = JSON.parse(fs.readFileSync(p,"utf8")); delete cfg.channels?.whatsapp; fs.writeFileSync(p, JSON.stringify(cfg,null,2)); } catch {}
      try { fs.rmSync("/root/.openclaw/credentials/whatsapp", { recursive: true, force: true }); } catch {}
      console.log("REMOVED");
    `.replace(/\n/g, ' ');

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
