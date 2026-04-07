#!/usr/bin/env npx tsx
/**
 * Diagnose gateway token auth issues for a user's container.
 * Usage: npx tsx scripts/diagnose-gateway.ts <subdomain-prefix>
 */
import '../api/src/loadEnv';
import { sshExec } from '../api/src/services/ssh';
import db from '../api/src/lib/db';

const search = process.argv[2];
if (!search) {
  console.error('Usage: npx tsx scripts/diagnose-gateway.ts <subdomain-prefix>');
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
      console.error(`No user found`);
      process.exit(1);
    }

    const ip = user.server_ip;
    const cn = user.container_name;
    const uid = user.id;

    console.log(`=== User: ${user.subdomain} ===`);
    console.log(`Container: ${cn} on ${ip}`);
    console.log(`DB token: ${user.gateway_token?.slice(0, 16)}...`);

    // 1. Container state
    const state = await sshExec(ip, `docker inspect ${cn} --format='Running={{.State.Running}} StartedAt={{.State.StartedAt}}' 2>/dev/null`).catch(() => null);
    console.log(`\n=== Container State ===`);
    console.log(state?.stdout || 'unknown');

    // 2. Host-side config file — gateway section
    console.log(`\n=== Host Config (openclaw.json gateway section) ===`);
    const hostConfig = await sshExec(ip, `cat /opt/openclaw/instances/${uid}/openclaw.json 2>/dev/null | python3 -c "import sys,json; c=json.load(sys.stdin); print(json.dumps(c.get('gateway',{}), indent=2))" 2>/dev/null`).catch(() => null);
    console.log(hostConfig?.stdout || 'failed to read');

    // 3. In-container config
    console.log(`\n=== In-Container Config (openclaw config get) ===`);
    const inToken = await sshExec(ip, `docker exec ${cn} openclaw config get gateway.auth.token 2>&1`).catch(() => null);
    console.log(`gateway.auth.token: ${inToken?.stdout?.trim() || 'empty/error'}`);
    const inMode = await sshExec(ip, `docker exec ${cn} openclaw config get gateway.auth.mode 2>&1`).catch(() => null);
    console.log(`gateway.auth.mode: ${inMode?.stdout?.trim() || 'empty/error'}`);
    const inDisable = await sshExec(ip, `docker exec ${cn} openclaw config get gateway.controlUi.dangerouslyDisableDeviceAuth 2>&1`).catch(() => null);
    console.log(`dangerouslyDisableDeviceAuth: ${inDisable?.stdout?.trim() || 'empty/error'}`);

    // 4. OpenClaw version
    console.log(`\n=== OpenClaw Version ===`);
    const ver = await sshExec(ip, `docker exec ${cn} openclaw --version 2>&1`).catch(() => null);
    console.log(ver?.stdout?.trim() || 'unknown');

    // 5. Gateway process
    console.log(`\n=== Gateway Process ===`);
    const ps = await sshExec(ip, `docker exec ${cn} ps aux 2>/dev/null | grep -i gateway || docker exec ${cn} ps aux 2>/dev/null`).catch(() => null);
    console.log(ps?.stdout || 'unknown');

    // 6. Container logs (last 30 lines)
    console.log(`\n=== Container Logs (last 30 lines) ===`);
    const logs = await sshExec(ip, `docker logs --tail 30 ${cn} 2>&1`).catch(() => null);
    console.log(logs?.stdout || 'no logs');

    // 7. Test WebSocket from worker
    console.log(`\n=== WebSocket Probe (from worker) ===`);
    const domain = process.env.DOMAIN || 'valnaa.com';
    const probe = await sshExec(ip, `curl -s -o /dev/null -w '%{http_code}' -H 'Host: ${user.subdomain}.${domain}' --max-time 5 http://127.0.0.1/ 2>/dev/null`).catch(() => null);
    console.log(`HTTP probe: ${probe?.stdout?.trim() || 'failed'}`);

    // 8. Test with token in header
    const tokenProbe = await sshExec(ip, `curl -s -H 'Host: ${user.subdomain}.${domain}' --max-time 5 'http://127.0.0.1/?token=${user.gateway_token}' 2>/dev/null | head -c 500`).catch(() => null);
    console.log(`\nWith token response (first 500 chars):\n${tokenProbe?.stdout?.slice(0, 500) || 'failed'}`);

    process.exit(0);
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
