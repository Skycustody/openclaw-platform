#!/usr/bin/env node
/**
 * Sync ALL users' OpenRouter limits to planSpendLimit + api_budget_addon_usd.
 * Fixes users who still have old 69% plan limits (e.g. $6.90 for business).
 *
 * Usage: npx tsx scripts/sync_all_plan_limits.ts [--dry-run]
 */
import '../src/loadEnv';
import db from '../src/lib/db';

const DRY_RUN = process.argv.includes('--dry-run');
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_MGMT_KEY = process.env.OPENROUTER_MGMT_KEY || '';
const PLAN_SPEND_LIMITS_USD: Record<string, number> = { starter: 1, pro: 2.5, business: 5 };

async function main() {
  if (!OPENROUTER_MGMT_KEY) {
    console.error('OPENROUTER_MGMT_KEY required');
    process.exit(1);
  }

  const listRes = await fetch(`${OPENROUTER_BASE}/keys`, {
    headers: { Authorization: `Bearer ${OPENROUTER_MGMT_KEY}` },
  });
  if (!listRes.ok) {
    console.error('OpenRouter keys fetch failed:', listRes.status);
    process.exit(1);
  }
  const keysData = (await listRes.json()) as { data?: Array<{ name?: string; hash?: string; limit?: number }> };
  const keys = keysData.data || [];

  const users = await db.getMany<{ id: string; email: string; plan: string; api_budget_addon_usd: unknown }>(
    "SELECT id, email, plan, COALESCE(api_budget_addon_usd, 0) as api_budget_addon_usd FROM users WHERE nexos_api_key IS NOT NULL AND status IN ('active', 'sleeping', 'grace_period')"
  );

  console.log(`\n=== Sync plan limits (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===\n`);
  console.log('Users:', users.length, '| OpenRouter keys:', keys.length);

  let updated = 0;
  for (const user of users) {
    const keyName = `openclaw-${user.id.slice(0, 8)}`;
    const key = keys.find((k) => k.name === keyName);
    if (!key?.hash) continue;

    const planLimit = PLAN_SPEND_LIMITS_USD[user.plan] ?? 1;
    const addon = Number(user.api_budget_addon_usd) || 0;
    const correctLimit = planLimit + addon;
    const currentLimit = key.limit ?? 0;

    if (Math.abs(currentLimit - correctLimit) < 0.01) continue;

    console.log(`${user.email} (${user.id.slice(0, 8)}...) plan=${user.plan} | $${currentLimit} -> $${correctLimit}`);

    if (!DRY_RUN) {
      const res = await fetch(`${OPENROUTER_BASE}/keys/${key.hash}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_MGMT_KEY}` },
        body: JSON.stringify({ limit: Math.round(correctLimit * 100) / 100 }),
      });
      if (res.ok) updated++;
    }
  }

  console.log(`\n${DRY_RUN ? 'Would update' : 'Updated'}: ${updated} key(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
