#!/usr/bin/env node
/**
 * Fix OpenRouter key limit by key name (e.g. openclaw-51db6cfe).
 * Use when user not found in DB (orphan key) or fix_user_limit fails.
 * Sets limit to plan default: starter=$1, pro=$2.5, business=$5
 *
 * Usage: npx tsx scripts/fix_key_by_name.ts 51db6cfe [plan]
 * Example: npx tsx scripts/fix_key_by_name.ts 51db6cfe business
 */
import '../src/loadEnv';

const prefix = process.argv[2];
const planArg = process.argv[3] || 'business';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_MGMT_KEY = process.env.OPENROUTER_MGMT_KEY || '';
const LIMITS: Record<string, number> = { starter: 1, pro: 2.5, business: 5 };

async function main() {
  if (!prefix) {
    console.log('Usage: npx tsx scripts/fix_key_by_name.ts <key-suffix> [plan]');
    console.log('Example: npx tsx scripts/fix_key_by_name.ts 51db6cfe business');
    process.exit(1);
  }

  const keyName = `openclaw-${prefix}`;
  const limit = LIMITS[planArg] ?? LIMITS.business;

  const res = await fetch(`${OPENROUTER_BASE}/keys`, {
    headers: { Authorization: `Bearer ${OPENROUTER_MGMT_KEY}` },
  });
  if (!res.ok) {
    console.error('OpenRouter fetch failed:', res.status);
    process.exit(1);
  }

  const data = (await res.json()) as { data?: Array<{ name?: string; hash?: string; limit?: number }> };
  const key = (data.data || []).find((k) => k.name === keyName);

  if (!key?.hash) {
    console.log('Key not found:', keyName);
    process.exit(1);
  }

  console.log(`Key ${keyName}: limit $${key.limit} -> $${limit} (plan=${planArg})`);

  const patch = await fetch(`${OPENROUTER_BASE}/keys/${key.hash}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_MGMT_KEY}` },
    body: JSON.stringify({ limit }),
  });

  console.log(patch.ok ? 'Done.' : 'Failed: ' + patch.status);
  process.exit(patch.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
