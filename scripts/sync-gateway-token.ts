#!/usr/bin/env npx tsx
/**
 * Sync gateway token: read the ACTUAL token from the running gateway process
 * and update the DB + config file to match.
 */
import '../api/src/loadEnv';
import { sshExec } from '../api/src/services/ssh';
import db from '../api/src/lib/db';

const search = process.argv[2] || 'nanamacbride59';

(async () => {
  try {
    const user = await db.getOne<any>(
      `SELECT u.id, u.subdomain, u.container_name, u.gateway_token, s.ip as server_ip
       FROM users u JOIN servers s ON s.id = u.server_id
       WHERE u.subdomain LIKE $1 LIMIT 1`,
      [`${search}%`]
    );
    if (!user) { console.error('No user'); process.exit(1); }

    const ip = user.server_ip;
    const cn = user.container_name;

    console.log(`DB token: ${user.gateway_token}`);

    // Get the ACTUAL token the gateway is using
    const dash = await sshExec(ip, `docker exec ${cn} openclaw dashboard --no-open 2>&1`);
    const match = dash.stdout.match(/#token=([a-f0-9]+)/);
    const liveToken = match?.[1];
    console.log(`Live gateway token: ${liveToken || 'NOT FOUND'}`);

    if (!liveToken) {
      console.error('Could not extract token from openclaw dashboard output');
      console.log('Full output:', dash.stdout);
      process.exit(1);
    }

    if (liveToken === user.gateway_token) {
      console.log('Tokens already match! The mismatch is elsewhere.');

      // Check the env var token
      const envToken = await sshExec(ip, `docker exec ${cn} printenv OPENCLAW_GATEWAY_TOKEN 2>&1`);
      console.log(`Env var OPENCLAW_GATEWAY_TOKEN: ${envToken.stdout.trim()}`);

      // Check what the gateway process actually has loaded
      const configToken = await sshExec(ip, `docker exec ${cn} openclaw config get gateway.auth.token 2>&1`);
      console.log(`Config file token (via CLI): ${configToken.stdout.trim()}`);

      // Try to see the actual auth state
      const fullConfig = await sshExec(ip, `cat /opt/openclaw/instances/${user.id}/openclaw.json 2>/dev/null`);
      const config = JSON.parse(fullConfig.stdout);
      console.log(`Config file auth.token: ${config?.gateway?.auth?.token}`);
      console.log(`Config file auth.mode: ${config?.gateway?.auth?.mode}`);

      // Check if there's a separate devices/sessions token
      const devices = await sshExec(ip, `docker exec ${cn} openclaw devices list 2>&1`);
      console.log(`\nDevices list:\n${devices.stdout}`);
    } else {
      console.log(`MISMATCH! Updating DB token from ${user.gateway_token.slice(0,8)}... to ${liveToken.slice(0,8)}...`);
      await db.query('UPDATE users SET gateway_token = $1 WHERE id = $2', [liveToken, user.id]);
      console.log('DB updated.');
    }

    process.exit(0);
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
