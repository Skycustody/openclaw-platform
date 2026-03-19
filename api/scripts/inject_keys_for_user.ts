#!/usr/bin/env node
/**
 * Re-inject openclaw.json config for a user (channels, bindings, agents, gateway).
 * Run from api/: npx tsx scripts/inject_keys_for_user.ts <userId>
 *
 * Use when:
 * - Bots not running (config out of sync)
 * - Identity confusion (WhatsApp/Telegram using wrong agent)
 * - After fixing agent_channels in DB
 */
import '../src/loadEnv';
import db from '../src/lib/db';
import { injectApiKeys } from '../src/services/apiKeys';
import { sshExec } from '../src/services/ssh';

const INSTANCE_DIR = '/opt/openclaw/instances';

async function main() {
  const userId = process.argv[2];
  if (!userId || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(userId)) {
    console.log('Usage: npx tsx scripts/inject_keys_for_user.ts <userId>');
    process.exit(1);
  }

  const user = await db.getOne<{
    id: string;
    email: string;
    server_id: string | null;
    container_name: string | null;
    plan: string | null;
  }>(
    `SELECT u.id, u.email, u.server_id, u.container_name, u.plan
     FROM users u WHERE u.id = $1`,
    [userId]
  );

  if (!user) {
    console.error('User not found:', userId);
    process.exit(1);
  }

  if (!user.server_id) {
    console.error('User has no server assigned');
    process.exit(1);
  }

  const server = await db.getOne<{ ip: string }>('SELECT ip FROM servers WHERE id = $1', [user.server_id]);
  if (!server) {
    console.error('Server not found');
    process.exit(1);
  }

  const containerName = user.container_name || `openclaw-${userId.slice(0, 12)}`;
  const plan = (user.plan || 'starter') as 'starter' | 'pro' | 'business';

  console.log(`[inject] User ${user.email} (${userId})`);
  console.log(`[inject] Server ${server.ip}, container ${containerName}`);

  await injectApiKeys(server.ip, userId, containerName, plan);

  console.log('[inject] Restarting container...');
  await sshExec(server.ip, `docker restart ${containerName} 2>/dev/null || true`);

  console.log('[inject] Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
