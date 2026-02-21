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
    cfg.channels.telegram = {
      enabled: true,
      botToken: Buffer.from("${b64}","base64").toString(),
      dmPolicy: "open",
      allowFrom: ["*"],
      groups: { "*": { requireMention: true } }
    };
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
    cfg.channels.discord = {
      enabled: true,
      token: Buffer.from("${b64}","base64").toString(),
      dmPolicy: "open",
      allowFrom: ["*"]
    };
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

// ── WhatsApp ──

/**
 * Extract QR data from container logs.
 * Tries (in order):
 *  1. Raw Baileys pairing string (2@…) — renderable client-side with qrcode.react
 *  2. Content between ---QR CODE--- markers
 *  3. Unicode block-art QR (≥15 contiguous lines, skipping short ASCII banners)
 */
function extractQrFromLogs(raw: string): string | null {
  const cleaned = raw.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  const lines = cleaned.split('\n');

  // 1. Raw pairing string (search newest → oldest)
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/(2@[A-Za-z0-9+/=,._-]{20,})/);
    if (m) return m[1];
  }

  // 2. Between ---QR CODE--- markers
  const mm = cleaned.match(/---\s*QR\s*CODE\s*---\r?\n([\s\S]*?)\r?\n[\s\S]*?---/i);
  if (mm) {
    const block = mm[1].trim();
    if (block.length > 10) return block;
  }

  // 3. Unicode block art — collect contiguous blocks, pick last one ≥ 15 lines
  //    (the OPENCLAW banner is shorter and narrower than an actual QR code)
  const qrRe = /[\u2580\u2584\u2588]/;
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
 * Start WhatsApp pairing: write config, restart container.
 * Returns immediately — the frontend polls GET /whatsapp/qr for the code.
 */
export async function initiateWhatsAppPairing(userId: string): Promise<{ agentUrl: string; alreadyLinked: boolean }> {
  const { serverIp, containerName, user } = await getUserContainer(userId);

  const domain = process.env.DOMAIN || 'yourdomain.com';
  const subdomain = user.subdomain || '';
  const agentUrl = subdomain ? `https://${subdomain}.${domain}` : '';

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

  // Check if already paired
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

  // Restart so the gateway picks up the WhatsApp config
  await sshExec(serverIp, `docker restart ${containerName}`);

  // Trigger QR generation in background after the container is back up.
  // The gateway alone may not generate a QR — `channels login` is required.
  // Fire-and-forget: runs on the server without blocking the API response.
  void sshExec(
    serverIp,
    `sh -c 'sleep 10 && docker exec -d ${containerName} sh -c "openclaw channels login --channel whatsapp > /tmp/whatsapp-qr.log 2>&1"' &`
  ).catch(() => {});

  return { agentUrl, alreadyLinked: false };
}

/**
 * Poll container logs for the WhatsApp QR code.
 * Called by GET /channels/whatsapp/qr from the frontend.
 */
export async function getWhatsAppQr(userId: string): Promise<{
  status: 'waiting' | 'qr' | 'paired';
  qrText?: string;
}> {
  let serverIp: string;
  let containerName: string;

  try {
    const result = await getUserContainer(userId);
    serverIp = result.serverIp;
    containerName = result.containerName;
  } catch {
    return { status: 'waiting' };
  }

  // Already paired?
  const credsCheck = await sshExec(
    serverIp,
    `docker exec ${containerName} sh -c 'ls /root/.openclaw/credentials/whatsapp/*/creds.json 2>/dev/null || ls /data/credentials/whatsapp/*/creds.json 2>/dev/null || echo NONE'`
  ).catch(() => null);

  if (credsCheck && !credsCheck.stdout.includes('NONE')) {
    await db.query(
      `UPDATE user_channels SET whatsapp_connected = true, updated_at = NOW() WHERE user_id = $1`,
      [userId]
    );
    return { status: 'paired' };
  }

  // Read QR from the explicit channels-login output file
  const qrFile = await sshExec(
    serverIp,
    `docker exec ${containerName} cat /tmp/whatsapp-qr.log 2>/dev/null`
  ).catch(() => null);

  // Also check docker logs as fallback
  const logs = await sshExec(
    serverIp,
    `docker logs --tail 500 ${containerName} 2>&1`
  ).catch(() => null);

  const combined = [qrFile?.stdout, logs?.stdout].filter(Boolean).join('\n');
  if (!combined) return { status: 'waiting' };

  const qrText = extractQrFromLogs(combined);
  return qrText ? { status: 'qr', qrText } : { status: 'waiting' };
}

export async function checkWhatsAppStatus(userId: string): Promise<{ paired: boolean }> {
  try {
    const { serverIp, containerName } = await getUserContainer(userId);

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
