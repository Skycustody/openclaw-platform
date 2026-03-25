#!/usr/bin/env node
/**
 * Remove manual credit purchase (stripe_session_id like 'manual-%') and fix limit.
 * Recalculates addon from remaining purchases, updates users + OpenRouter.
 *
 * Usage: npx tsx scripts/remove_manual_credit_and_fix.ts <userId-prefix>
 * Dry run: npx tsx scripts/remove_manual_credit_and_fix.ts <userId-prefix> --dry-run
 */
import '../src/loadEnv';
import db from '../src/lib/db';

const DRY_RUN = process.argv.includes('--dry-run');
const prefix = process.argv[2] || 'd6156270';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_MGMT_KEY = process.env.OPENROUTER_MGMT_KEY || '';
const PLAN_SPEND_LIMITS_USD: Record<string, number> = { starter: 1, pro: 2.5, business: 5 };

async function findUserKey(userId: string) {
  const res = await fetch(`${OPENROUTER_BASE}/keys`, {
    headers: { Authorization: `Bearer ${OPENROUTER_MGMT_KEY}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: Array<{ name?: string; hash?: string; limit?: number }> };
  return (data.data || []).find((k) => k.name === `openclaw-${userId.slice(0, 8)}`) || null;
}

async function patchKeyLimit(hash: string, newLimit: number): Promise<boolean> {
  const res = await fetch(`${OPENROUTER_BASE}/keys/${hash}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_MGMT_KEY}` },
    body: JSON.stringify({ limit: Math.round(newLimit * 100) / 100 }),
  });
  return res.ok;
}

async function main() {
  console.log(`\n=== Remove manual credit + fix limit (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===\n`);

  const user = await db.getOne<{ id: string; email: string; plan: string }>(
    'SELECT id, email, plan FROM users WHERE id::text LIKE $1',
    [`${prefix}%`]
  );
  if (!user) {
    console.log('User not found.');
    process.exit(1);
  }

  const manualRows = await db.getMany<{ id: string; stripe_session_id: string; amount_eur_cents: number; credits_usd: number }>(
    "SELECT id, stripe_session_id, amount_eur_cents, credits_usd FROM credit_purchases WHERE user_id = $1 AND stripe_session_id LIKE 'manual-%'",
    [user.id]
  );

  const realRows = await db.getMany<{ id: string; stripe_session_id: string; amount_eur_cents: number; credits_usd: number }>(
    "SELECT id, stripe_session_id, amount_eur_cents, credits_usd FROM credit_purchases WHERE user_id = $1 AND (stripe_session_id IS NULL OR stripe_session_id NOT LIKE 'manual-%')",
    [user.id]
  );

  const newAddon = realRows.reduce((s, r) => s + Number(r.credits_usd), 0);
  const planLimit = PLAN_SPEND_LIMITS_USD[user.plan] ?? 1;
  const correctLimit = planLimit + newAddon;

  console.log('User:', user.email, user.id.slice(0, 8) + '...');
  console.log('Manual rows to remove:', manualRows.length);
  for (const r of manualRows) {
    console.log(`  - ${r.id} | session=${r.stripe_session_id} | $${r.amount_eur_cents / 100} | credits_usd=${r.credits_usd}`);
  }
  console.log('Real rows (keep):', realRows.length);
  for (const r of realRows) {
    console.log(`  - ${r.id} | session=${r.stripe_session_id?.slice(0, 30)}... | $${r.amount_eur_cents / 100} | credits_usd=${r.credits_usd}`);
  }
  console.log('');
  console.log('New addon (from real rows):', newAddon);
  console.log('Plan limit:', planLimit);
  console.log('Correct OpenRouter limit:', correctLimit);
  console.log('');

  if (manualRows.length === 0) {
    console.log('No manual rows to remove. Run fix_user_limit.ts to set limit.');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('DRY RUN: would delete', manualRows.length, 'row(s) and set limit to $' + correctLimit);
    return;
  }

  await db.query('BEGIN');
  try {
    for (const r of manualRows) {
      await db.query('DELETE FROM credit_purchases WHERE id = $1', [r.id]);
      console.log('Deleted', r.id);
    }
    await db.query('UPDATE users SET api_budget_addon_usd = $1 WHERE id = $2', [newAddon, user.id]);
    console.log('Updated users.api_budget_addon_usd =', newAddon);

    const key = await findUserKey(user.id);
    if (key?.hash) {
      const ok = await patchKeyLimit(key.hash, correctLimit);
      console.log('OpenRouter limit:', key.limit, '->', correctLimit, ok ? 'OK' : 'FAIL');
    } else {
      console.log('No OpenRouter key found.');
    }
    await db.query('COMMIT');
    console.log('\nDone.');
  } catch (e) {
    await db.query('ROLLBACK');
    console.error(e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
