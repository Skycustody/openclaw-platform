#!/usr/bin/env node
/**
 * Debug user credits — logs actual state from DB, audit log, and OpenRouter.
 * No guessing. Run: npx tsx scripts/debug_user_credits.ts <userId-prefix>
 */
import '../src/loadEnv';
import db from '../src/lib/db';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_MGMT_KEY = process.env.OPENROUTER_MGMT_KEY || '';

async function findUserKey(userId: string) {
  if (!OPENROUTER_MGMT_KEY) return null;
  const res = await fetch(`${OPENROUTER_BASE}/keys`, {
    headers: { Authorization: `Bearer ${OPENROUTER_MGMT_KEY}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: Array<{ name?: string; hash?: string; limit?: number; usage?: number }> };
  const keys = data.data || [];
  return keys.find((k) => k.name === `openclaw-${userId.slice(0, 8)}`) || null;
}

async function main() {
  const prefix = process.argv[2] || 'd6156270';
  console.log(`\n=== Debug credits for user prefix: ${prefix} ===\n`);

  const user = await db.getOne<{ id: string; email: string; plan: string; api_budget_addon_usd: unknown }>(
    'SELECT id, email, plan, COALESCE(api_budget_addon_usd, 0) as api_budget_addon_usd FROM users WHERE id::text LIKE $1',
    [`${prefix}%`]
  );
  if (!user) {
    console.log('User not found.');
    process.exit(1);
  }

  const addonUsd = Number(user.api_budget_addon_usd) || 0;

  const purchases = await db.getMany<{ id: string; amount_eur_cents: number; credits_usd: number; stripe_session_id: string | null; created_at: string }>(
    'SELECT id, amount_eur_cents, credits_usd, stripe_session_id, created_at FROM credit_purchases WHERE user_id = $1 ORDER BY created_at',
    [user.id]
  );

  const auditLog = await db.getMany<{ operation: string; amount_eur_cents: number | null; credits_usd: number | null; stripe_session_id: string | null; openrouter_limit_before: number | null; openrouter_limit_after: number | null; metadata: unknown; created_at: string }>(
    'SELECT operation, amount_eur_cents, credits_usd, stripe_session_id, openrouter_limit_before, openrouter_limit_after, metadata, created_at FROM credit_audit_log WHERE user_id = $1 ORDER BY created_at',
    [user.id]
  );

  const key = await findUserKey(user.id);

  console.log('--- DB user ---');
  console.log('user_id:', user.id);
  console.log('email:', user.email);
  console.log('plan:', user.plan);
  console.log('api_budget_addon_usd:', user.api_budget_addon_usd, '(parsed:', addonUsd, ')');
  console.log('');

  console.log('--- credit_purchases (raw) ---');
  let sumAmount = 0;
  let sumCredits = 0;
  const sessionIds = new Set<string>();
  for (const p of purchases) {
    const amt = p.amount_eur_cents / 100;
    sumAmount += amt;
    sumCredits += Number(p.credits_usd) || 0;
    if (p.stripe_session_id) sessionIds.add(p.stripe_session_id);
    console.log(`  id=${p.id}`);
    console.log(`    amount_eur_cents=${p.amount_eur_cents} ($${amt}) | credits_usd=${p.credits_usd}`);
    console.log(`    stripe_session_id=${p.stripe_session_id ?? 'NULL'}`);
    console.log(`    created_at=${p.created_at}`);
  }
  console.log(`  SUM amount: $${sumAmount} | SUM credits_usd: $${sumCredits}`);
  console.log(`  unique stripe_session_ids: ${sessionIds.size} (${sessionIds.size < purchases.length ? 'DUPLICATE SESSIONS?' : 'all unique'})`);
  console.log('');

  console.log('--- credit_audit_log (chronological) ---');
  for (const a of auditLog) {
    console.log(`  ${a.created_at} | ${a.operation}`);
    console.log(`    amount_eur_cents=${a.amount_eur_cents} credits_usd=${a.credits_usd} stripe_session_id=${a.stripe_session_id ?? 'NULL'}`);
    console.log(`    openrouter_limit_before=${a.openrouter_limit_before} -> openrouter_limit_after=${a.openrouter_limit_after}`);
    if (a.metadata) console.log(`    metadata=${JSON.stringify(a.metadata)}`);
  }
  console.log('');

  console.log('--- OpenRouter key ---');
  if (key) {
    const realRemaining = Math.max(0, (key.limit ?? 0) - (key.usage ?? 0));
    console.log('limit:', key.limit);
    console.log('usage:', key.usage);
    console.log('remaining:', realRemaining);
  } else {
    console.log('NOT FOUND');
  }
  console.log('');

  console.log('--- getNexosUsage (display math) ---');
  const planDisplayBase = { starter: 2, pro: 5, business: 10 }[user.plan] ?? 2;
  const planSpendLimit = { starter: 1, pro: 2.5, business: 5 }[user.plan] ?? 1;
  const cycleBudget = planSpendLimit + addonUsd;
  const realLimit = key?.limit ?? 0;
  const realUsage = key?.usage ?? 0;
  const realRemaining = Math.max(0, realLimit - realUsage);
  const ratioDenom = realLimit > 0 ? realLimit : cycleBudget;
  const ratio = ratioDenom > 0 ? Math.min(1, realRemaining / ratioDenom) : 1;
  const totalDisplay = planDisplayBase + sumAmount;
  const remainingUsd = totalDisplay * ratio;
  const usedUsd = totalDisplay - remainingUsd;

  console.log('planDisplayBase:', planDisplayBase, '| planSpendLimit:', planSpendLimit);
  console.log('creditDisplayTotal:', sumAmount, '| addonUsd:', addonUsd);
  console.log('cycleBudget (planSpendLimit+addon):', cycleBudget);
  console.log('totalDisplay:', totalDisplay);
  console.log('realLimit:', realLimit, '| realUsage:', realUsage, '| realRemaining:', realRemaining);
  console.log('ratioDenom:', ratioDenom, '| ratio:', ratio);
  console.log('remainingUsd (display):', remainingUsd.toFixed(2), '| usedUsd:', usedUsd.toFixed(2));
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
