#!/usr/bin/env npx tsx
/**
 * Test: remove gateway.auth entirely, restart, check if Control UI connects.
 * This isolates whether the issue is token comparison or something else.
 */
import '../api/src/loadEnv';
import { sshExec } from '../api/src/services/ssh';
import { readContainerConfig, writeContainerConfig } from '../api/src/services/containerConfig';

const uid = 'f8ee5cb4-7d46-4de8-b90d-ba2468e5046c';
const ip = '167.235.31.202';
const cn = 'openclaw-f8ee5cb4-7d4';

(async () => {
  // Read config, remove auth section, keep controlUi
  const config = await readContainerConfig(ip, uid);
  console.log('Current auth:', JSON.stringify(config.gateway?.auth));

  // Remove token auth — gateway won't require any token
  delete config.gateway.auth;

  // Ensure controlUi is permissive
  config.gateway.controlUi = {
    enabled: true,
    allowInsecureAuth: true,
    dangerouslyDisableDeviceAuth: true,
    dangerouslyAllowHostHeaderOriginFallback: true,
    allowedOrigins: ['https://valnaa.com', 'https://www.valnaa.com'],
  };

  await writeContainerConfig(ip, uid, config);
  console.log('Config written (no auth section)');

  // Restart container so gateway reads new config
  console.log('Restarting container...');
  await sshExec(ip, `docker restart ${cn}`);

  // Wait for startup
  console.log('Waiting 20s for gateway init...');
  await new Promise(r => setTimeout(r, 20000));

  // Check logs
  const logs = await sshExec(ip, `docker logs --tail 10 ${cn} 2>&1`);
  console.log('\nLogs:\n', logs.stdout);

  console.log('\nDone! Try refreshing the dashboard now.');
  process.exit();
})();
