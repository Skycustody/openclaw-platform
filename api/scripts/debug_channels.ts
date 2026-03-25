#!/usr/bin/env node
/**
 * Debug channels & agents for a user (e.g. "Fumf Coms").
 * Run from api/: npx tsx scripts/debug_channels.ts "Fumf Coms"
 * Or:  npx tsx scripts/debug_channels.ts <userId>
 *
 * Use this when:
 * - Bots not running on WhatsApp/Telegram
 * - WhatsApp bot shows Telegram bot's identity (or vice versa)
 * - Need to reset and separate channel identities
 */
import '../src/loadEnv';
import db from '../src/lib/db';

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.log('Usage: npx tsx api/scripts/debug_channels.ts "Fumf Coms"');
    console.log('   or: npx tsx api/scripts/debug_channels.ts <userId>');
    process.exit(1);
  }

  const isUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(query);

  let user: { id: string; email: string; display_name: string | null; subdomain: string | null; container_name: string | null; server_id: string | null } | null;

  if (isUuid) {
    user = await db.getOne(
      'SELECT id, email, display_name, subdomain, container_name, server_id FROM users WHERE id = $1',
      [query]
    );
  } else {
    user = await db.getOne(
      `SELECT id, email, display_name, subdomain, container_name, server_id FROM users
       WHERE display_name ILIKE $1 OR email ILIKE $1 OR subdomain ILIKE $1`,
      [`%${query}%`]
    );
  }

  if (!user) {
    console.log('User not found. Try display_name, email, subdomain, or full userId.');
    process.exit(1);
  }

  console.log('\n=== User ===');
  console.log('id:', user.id);
  console.log('email:', user.email);
  console.log('display_name:', user.display_name);
  console.log('subdomain:', user.subdomain);
  console.log('container_name:', user.container_name);
  console.log('server_id:', user.server_id);

  const agents = await db.getMany<{
    id: string;
    name: string;
    is_primary: boolean;
    openclaw_agent_id: string | null;
    purpose: string | null;
  }>(
    'SELECT id, name, is_primary, openclaw_agent_id, purpose FROM agents WHERE user_id = $1 ORDER BY is_primary DESC, created_at ASC',
    [user.id]
  );

  console.log('\n=== Agents ===');
  for (const a of agents) {
    const ocId = a.is_primary ? 'main' : (a.openclaw_agent_id || a.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20));
    console.log(`  ${a.id.slice(0, 8)}... | name="${a.name}" | is_primary=${a.is_primary} | openclaw_id=${ocId}`);
  }

  const channels = await db.getMany<{
    id: string;
    agent_id: string;
    channel_type: string;
    connected: boolean;
    label: string | null;
    created_at: string;
    agent_name: string;
  }>(
    `SELECT ac.id, ac.agent_id, ac.channel_type, ac.connected, ac.label, ac.created_at, a.name as agent_name
     FROM agent_channels ac
     JOIN agents a ON a.id = ac.agent_id
     WHERE ac.user_id = $1
     ORDER BY ac.channel_type, ac.created_at`,
    [user.id]
  );

  console.log('\n=== Agent Channels ===');
  for (const c of channels) {
    console.log(`  ${c.channel_type} | agent="${c.agent_name}" (${c.agent_id.slice(0, 8)}...) | connected=${c.connected} | label=${c.label || '—'}`);
  }

  const server = user.server_id
    ? await db.getOne<{ ip: string }>('SELECT ip FROM servers WHERE id = $1', [user.server_id])
    : null;

  console.log('\n=== Debug Commands (run on control plane) ===');
  console.log('# PM2 API logs (last 100 lines):');
  console.log('pm2 logs openclaw-api --lines 100 --nostream');
  console.log('');
  if (server && user.container_name) {
    const cn = user.container_name.replace(/[^a-zA-Z0-9_.-]/g, '');
    console.log('# Container logs (run from control plane, SSH to worker):');
    console.log(`ssh -i ~/.ssh/openclaw_worker root@${server.ip} "docker logs ${cn} --tail 50 2>&1"`);
    console.log('');
    console.log('# View openclaw.json channels & bindings:');
    console.log(`ssh -i ~/.ssh/openclaw_worker root@${server.ip} "cat /opt/openclaw/instances/${user.id}/openclaw.json | python3 -c \"import json,sys; d=json.load(sys.stdin); print(json.dumps({'channels': d.get('channels',{}), 'bindings': d.get('bindings',[])}, indent=2))\""`);
  }

  console.log('\n=== Fix: Separate WhatsApp & Telegram identities ===');
  console.log('If both channels are bound to the same agent (main), they share identity.');
  console.log('To fix: create a second agent for one channel, reassign, then re-sync.');
  console.log('');
  console.log('Option A — Use admin dashboard: POST /admin/inject-keys with body { "userId": "' + user.id + '" }');
  console.log('  This re-injects config and restarts the container.');
  console.log('');
  console.log('Option B — Create separate agents via SQL (run in psql):');
  console.log(`
-- 1. Create "WhatsApp Bot" agent (if you want WhatsApp separate)
INSERT INTO agents (id, user_id, name, purpose, status, ram_mb, is_primary, openclaw_agent_id)
SELECT gen_random_uuid(), '${user.id}', 'WhatsApp Bot', 'WhatsApp assistant', 'active', 512, false, 'whatsapp-bot'
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE user_id = '${user.id}' AND openclaw_agent_id = 'whatsapp-bot');

-- 2. Create "Telegram Bot" agent (if you want Telegram separate)
INSERT INTO agents (id, user_id, name, purpose, status, ram_mb, is_primary, openclaw_agent_id)
SELECT gen_random_uuid(), '${user.id}', 'Telegram Bot', 'Telegram assistant', 'active', 512, false, 'telegram-bot'
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE user_id = '${user.id}' AND openclaw_agent_id = 'telegram-bot');

-- 3. Reassign channels to correct agents (replace CHANNEL_ID and AGENT_ID with actual UUIDs)
--    First list channel IDs:
SELECT ac.id, ac.channel_type, a.name as agent_name FROM agent_channels ac JOIN agents a ON a.id = ac.agent_id WHERE ac.user_id = '${user.id}';

--    Then update (example: move WhatsApp channel to whatsapp-bot agent):
-- UPDATE agent_channels SET agent_id = (SELECT id FROM agents WHERE user_id = '${user.id}' AND openclaw_agent_id = 'whatsapp-bot') WHERE id = 'CHANNEL_ID';

-- 4. After DB changes, trigger re-sync via admin: POST /admin/inject-keys { "userId": "${user.id}" }
`);

  console.log('\n=== Reset channels (disconnect all, user re-pairs) ===');
  console.log('If you want to fully reset so the user can re-pair from the dashboard:');
  console.log(`
UPDATE agent_channels SET connected = false, token = NULL, config = '{}' WHERE user_id = '${user.id}';
-- Then POST /admin/inject-keys { "userId": "${user.id}" }
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
