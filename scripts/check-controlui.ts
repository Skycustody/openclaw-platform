#!/usr/bin/env npx tsx
import '../api/src/loadEnv';
import { sshExec } from '../api/src/services/ssh';

(async () => {
  const ip = '167.235.31.202';
  const cn = 'openclaw-f8ee5cb4-7d4';

  // Find the Control UI JS bundle
  const find = await sshExec(ip, `docker exec ${cn} sh -c 'ls /usr/local/lib/node_modules/openclaw/dist/control-ui/assets/*.js 2>/dev/null'`);
  console.log('JS bundles:', find.stdout);

  const files = find.stdout.trim().split('\n').filter(Boolean);
  for (const f of files) {
    // Search for token-related code
    const grep = await sshExec(ip, `docker exec ${cn} grep -oP '.{0,80}(hashToken|token_hash|sha256|sha512|pbkdf|hmac|digest|crypto\\.subtle|hash\\(|#token|gatewayToken|authToken|connectToken).{0,80}' ${f} 2>/dev/null | head -30`);
    if (grep.stdout.trim()) {
      console.log(`\n=== ${f} ===`);
      console.log(grep.stdout);
    }
  }

  // Also check how the connect message is built
  for (const f of files) {
    const connect = await sshExec(ip, `docker exec ${cn} grep -oP '.{0,100}(connect|auth|token).{0,100}' ${f} 2>/dev/null | grep -i 'auth\\|connect.*token\\|token.*connect' | head -20`);
    if (connect.stdout.trim()) {
      console.log(`\n=== connect/auth in ${f} ===`);
      console.log(connect.stdout);
    }
  }

  // Check if there's a hash fragment reader
  for (const f of files) {
    const hash = await sshExec(ip, `docker exec ${cn} grep -oP '.{0,60}(location\\.hash|window\\.location|fragment|URLSearchParams|searchParams).{0,60}' ${f} 2>/dev/null | head -15`);
    if (hash.stdout.trim()) {
      console.log(`\n=== URL/hash reading in ${f} ===`);
      console.log(hash.stdout);
    }
  }

  process.exit();
})();
