#!/usr/bin/env npx ts-node
/**
 * Migration Script: Proxy-based API Keys → OpenRouter Integration
 *
 * This script migrates all existing users to OpenRouter:
 *
 * 1. Assigns an OpenRouter API key to each user (via Management API or fallback key)
 * 2. Rewrites each container's openclaw.json to use OpenRouter as the provider
 * 3. Removes legacy auth-profiles.json from containers
 * 4. Restarts containers to pick up the new config
 *
 * Usage:
 *   npx ts-node scripts/migrate_to_nexos.ts [--dry-run]
 *
 * Prerequisites:
 *   - OPENROUTER_API_KEY or OPENROUTER_MGMT_KEY must be set in .env
 *   - Database migration 010_nexos_integration.sql must be applied first
 */
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '..', '.env') });
config({ path: path.join(__dirname, '..', 'api', '.env') });

import db from '../api/src/lib/db';
import { sshExec } from '../api/src/services/ssh';
import { ensureNexosKey } from '../api/src/services/nexos';
import { injectApiKeys } from '../api/src/services/apiKeys';

const DRY_RUN = process.argv.includes('--dry-run');

interface UserRow {
  id: string;
  email: string;
  plan: string;
  server_ip: string;
  container_name: string;
  status: string;
}

async function main() {
  console.log('=== OpenRouter Migration Script ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log('');

  if (!process.env.OPENROUTER_API_KEY && !process.env.OPENROUTER_MGMT_KEY) {
    console.error('ERROR: OPENROUTER_API_KEY or OPENROUTER_MGMT_KEY is not set in .env');
    console.error('Get an API key from https://openrouter.ai/keys');
    process.exit(1);
  }

  const users = await db.getMany<UserRow>(
    `SELECT u.id, u.email, u.plan, s.ip as server_ip, u.container_name, u.status
     FROM users u
     JOIN servers s ON s.id = u.server_id
     WHERE u.server_id IS NOT NULL
       AND u.container_name IS NOT NULL
       AND u.status IN ('active', 'sleeping', 'grace_period')
     ORDER BY u.email`
  );

  console.log(`Found ${users.length} users with active containers\n`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const user of users) {
    const cn = user.container_name;
    console.log(`[${user.email}] (${user.id.slice(0, 8)}...) plan=${user.plan} status=${user.status}`);

    if (DRY_RUN) {
      console.log(`  → Would assign OpenRouter key and update container ${cn}`);
      skipped++;
      continue;
    }

    try {
      const apiKey = await ensureNexosKey(user.id);
      console.log(`  → OpenRouter key assigned (${apiKey.slice(0, 12)}...)`);

      await injectApiKeys(user.server_ip, user.id, cn, user.plan as any);
      console.log(`  → openclaw.json updated with OpenRouter provider`);

      await sshExec(user.server_ip, `docker restart ${cn} 2>/dev/null || true`);
      console.log(`  → Container restarted`);

      success++;
    } catch (err: any) {
      console.error(`  ✗ FAILED: ${err.message}`);
      failed++;
    }

    console.log('');
  }

  console.log('=== Migration Summary ===');
  console.log(`  Success: ${success}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Skipped: ${skipped}`);

  if (failed > 0) {
    console.log('\nSome users failed. Re-run the script to retry them.');
  }

  if (DRY_RUN) {
    console.log('\nThis was a dry run. Run without --dry-run to apply changes.');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Migration script crashed:', err);
  process.exit(1);
});
