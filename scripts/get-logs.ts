#!/usr/bin/env npx tsx
import '../api/src/loadEnv';
import { sshExec } from '../api/src/services/ssh';
(async () => {
  const r = await sshExec('167.235.31.202', 'docker logs --tail 40 openclaw-f8ee5cb4-7d4 2>&1');
  console.log(r.stdout);
  process.exit();
})();
