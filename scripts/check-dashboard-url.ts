#!/usr/bin/env npx tsx
/**
 * Check what URL format OpenClaw's `openclaw dashboard` command generates.
 */
import '../api/src/loadEnv';
import { sshExec } from '../api/src/services/ssh';
import db from '../api/src/lib/db';

const search = process.argv[2] || 'nanamacbride59';

(async () => {
  try {
    const user = await db.getOne<any>(
      `SELECT u.id, u.container_name, s.ip as server_ip
       FROM users u JOIN servers s ON s.id = u.server_id
       WHERE u.subdomain LIKE $1 LIMIT 1`,
      [`${search}%`]
    );
    if (!user) { console.error('No user'); process.exit(1); }

    const ip = user.server_ip;
    const cn = user.container_name;

    // 1. What URL does `openclaw dashboard --no-open` generate?
    console.log('=== openclaw dashboard --no-open ===');
    const dash = await sshExec(ip, `docker exec ${cn} openclaw dashboard --no-open 2>&1`);
    console.log(dash.stdout);
    console.log(dash.stderr);

    // 2. Get the Control UI's JS to see what params it reads
    console.log('\n=== Control UI JS params check ===');
    const jsCheck = await sshExec(ip, `docker exec ${cn} sh -c 'find /root -name "*.js" -path "*/controlUi/*" -o -name "*.js" -path "*/control-ui/*" -o -name "*.js" -path "*/dashboard/*" 2>/dev/null | head -5'`);
    console.log('JS files:', jsCheck.stdout || 'none found');

    // Try to find the main JS bundle
    const htmlCheck = await sshExec(ip, `docker exec ${cn} sh -c 'find / -name "index.html" -path "*/controlUi/*" -o -name "index.html" -path "*/control*" -o -name "index.html" -path "*/www/*" -o -name "index.html" -path "*/public/*" -o -name "index.html" -path "*/dist/*" 2>/dev/null | head -10'`);
    console.log('HTML files:', htmlCheck.stdout || 'none found');

    // 3. Check what query params the Control UI JS looks for
    const jsSearch = await sshExec(ip, `docker exec ${cn} sh -c 'find / -name "*.js" -size +10k 2>/dev/null | xargs grep -l "gatewayUrl\\|gatewayToken\\|OPENCLAW_GATEWAY_TOKEN\\|searchParams\\|URLSearchParams" 2>/dev/null | head -5'`);
    console.log('JS with URL params:', jsSearch.stdout || 'none found');

    if (jsSearch.stdout.trim()) {
      const firstJs = jsSearch.stdout.trim().split('\n')[0];
      const paramCheck = await sshExec(ip, `docker exec ${cn} grep -oP '(?:searchParams|URLSearchParams|getItem|get\\()[^)]*(?:token|gateway|auth|key)[^)]*\\)' ${firstJs} 2>/dev/null | head -20`);
      console.log('Token param usage:', paramCheck.stdout || 'none found');

      // Get broader context around searchParams
      const broader = await sshExec(ip, `docker exec ${cn} grep -oP '.{0,40}(searchParams|URLSearchParams).{0,60}' ${firstJs} 2>/dev/null | head -20`);
      console.log('SearchParams context:', broader.stdout || 'none');
    }

    process.exit(0);
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
