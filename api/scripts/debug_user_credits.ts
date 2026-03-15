#!/usr/bin/env node
/**
 * Debug user credits — logs actual state from DB and OpenRouter.
 * No guessing. Run: npx tsx scripts/debug_user_credits.ts <userId-prefix>
 * Example: npx tsx scripts/debug_user_credits.ts d6156270
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
  const data = (await res.json()) as { data?: Array<{ name?: string; hash?: string; limit?: number; usage?: number; limit_remaining?: number }> };
  const keys = data.data || [];
  return keys.find((k) => k.name === `openclaw-${userId.slice(0, 8)}`) || null;
}

async function main() {
  const prefix = process.argv[2] || 'd6156270';
  console.log(`\n=== Debug credits for user prefix: ${prefix} ===\n`);

  const user = await db.getOne<{ id: string; email: string; plan: string; api_budget_addon_usd: number }>(
    'SELECT id, email, plan, COALESCE(api_budget_addon_usd, 0) as api_budget_addon_usd FROM users WHERE id::text LIKE $1',
    [`${prefix}%`]
  );
  if (!user) {
    console.log('User not found.');
    process.exit(1);
  }

  const purchases = await db.getMany<{ id: string; amount_eur_cents: number; credits_usd: number; created_at: string }>(
    'SELECT id, amount_eur_cents, credits_usd, created_at FROM credit_purchases WHERE user_id = $1 ORDER BY created_at',
    [user.id]
  );

  const key = await findUserKey(user.id);

  console.log('--- DB ---');
  console.log('user_id:', user.id);
  console.log('email:', user.email);
  console.log('plan:', user.plan);
  console.log('api_budget_addon_usd:', user.api_budget_addon_usd);
  console.log('');
  console.log('credit_purchases:');
  let sumAmount = 0;
  let sumCredits = 0;
  for (const p of purchases) {
    const amt = p.amount_eur_cents / 100;
    sumAmount += amt;
    sumCredits += p.credits_usd;
    console.log(`  ${p.id} | amount_eur_cents=${p.amount_eur_cents} ($${amt}) | credits_usd=${p.credits_usd} | ${p.created_at}`);
  }
  console.log(`  SUM amount (display): $${sumAmount} | SUM credits_usd: $${sumCredits}`);
  console.log('');

  if (key) {
    console.log('--- OpenRouter key (openclaw-' + user.id.slice(0, 8) + ') ---');
    console.log('limit:', key.limit);
    console.log('usage:', key.usage);
    console.log('limit_remaining:', (key as any).limit_remaining ?? (key.limit != null && key.usage != null ? key.limit - key.usage : '?'));
    console.log('');
  } else {
    console.log('--- OpenRouter key: NOT FOUND ---\n');
  }

  console.log('--- getNexosUsage logic (what user sees) ---');
  const planDisplayBase = { starter: 2, pro: 5, business: 10 }[user.plan] ?? 2;
  const planSpendLimit = { starter: 1, pro: 2.5, business: 5 }[user.plan] ?? 1;
  const creditDisplayTotal = sumAmount;
  const totalDisplay = planDisplayBase + creditDisplayTotal;
  const cycleBudget = planSpendLimit + user.api_budget_addon_usd;
  const realLimit = key?.limit ?? 0;
  const realUsage = key?.usage ?? 0;
  const realRemaining = Math.max(0, realLimit - realUsage);
  const ratio = cycleBudget > 0 ? Math.min(1, realRemaining / cycleBudget) : 1;
  const remainingUsd = totalDisplay * ratio;
  const usedUsd = totalDisplay - remainingUsd;

  console.log('planDisplayBase:', planDisplayBase);
  console.log('creditDisplayTotal (sum amount_eur_cents/100):', creditDisplayTotal);
  console.log('totalDisplay (what user "bought"):', totalDisplay);
  console.log('planSpendLimit:', planSpendLimit);
  console.log('cycleBudget (planSpendLimit + api_budget_addon_usd):', cycleBudget);
  console.log('realLimit (OpenRouter):', realLimit);
  console.log('realUsage (OpenRouter):', realUsage);
  console.log('realRemaining:', realRemaining);
  console.log('ratio (realRemaining/cycleBudget):', ratio);
  console.log('remainingUsd (display):', remainingUsd.toFixed(2));
  console.log('usedUsd (display):', usedUsd.toFixed(2));
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
