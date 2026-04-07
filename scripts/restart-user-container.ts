#!/usr/bin/env npx tsx
/**
 * Restart a user's container on the worker server.
 * Usage: npx tsx scripts/restart-user-container.ts <subdomain-prefix>
 * Example: npx tsx scripts/restart-user-container.ts nanamacbride59
 */
import '../api/src/loadEnv';
import { sshExec } from '../api/src/services/ssh';
import db from '../api/src/lib/db';

const search = process.argv[2];
if (!search) {
  console.error('Usage: npx tsx scripts/restart-user-container.ts <subdomain-prefix>');
  process.exit(1);
}

(async () => {
  try {
    const user = await db.getOne<any>(
      `SELECT u.id, u.subdomain, u.container_name, u.gateway_token, s.ip as server_ip
       FROM users u JOIN servers s ON s.id = u.server_id
       WHERE u.subdomain LIKE $1 LIMIT 1`,
      [`${search}%`]
    );

    if (!user) {
      console.error(`No user found with subdomain starting with "${search}"`);
      process.exit(1);
    }

    console.log(`Found: ${user.subdomain} on ${user.server_ip} (${user.container_name})`);
    console.log(`Gateway token: ${user.gateway_token ? user.gateway_token.slice(0, 8) + '...' : 'MISSING'}`);

    // Check current container state
    const inspect = await sshExec(user.server_ip, `docker inspect ${user.container_name} --format='{{.State.Running}}' 2>/dev/null`).catch(() => null);
    console.log(`Container running: ${inspect?.stdout?.trim() || 'unknown'}`);

    // Check current gateway config
    const configCheck = await sshExec(user.server_ip, `cat /opt/openclaw/instances/${user.id}/openclaw.json 2>/dev/null | grep -o '"auth"' | head -1`).catch(() => null);
    console.log(`Config has auth: ${configCheck?.stdout?.includes('auth') ? 'yes' : 'no'}`);

    // Restart the container
    console.log(`Restarting ${user.container_name}...`);
    const result = await sshExec(user.server_ip, `docker restart ${user.container_name}`);
    console.log(`Restart result: ${result.stdout || result.stderr || 'done'} (code ${result.code})`);

    // Wait for gateway to init, then re-apply config
    console.log('Waiting 15s for gateway init...');
    await new Promise(r => setTimeout(r, 15000));

    // Import and run reapplyGatewayConfig
    const { reapplyGatewayConfig } = await import('../api/src/services/containerConfig');
    console.log('Re-applying gateway config...');
    await reapplyGatewayConfig(user.server_ip, user.id, user.container_name);
    console.log('Done! Gateway config re-applied.');

    process.exit(0);
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
