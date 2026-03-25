#!/usr/bin/env node
/**
 * Fix a user's OpenRouter limit to match their paid credits.
 * Sets limit = planSpendLimit + api_budget_addon_usd
 *
 * Usage: npx tsx scripts/fix_user_limit.ts <userId-prefix>
 */
import '../src/loadEnv';
import db from '../src/lib/db';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_MGMT_KEY = process.env.OPENROUTER_MGMT_KEY || '';
const PLAN_SPEND_LIMITS_USD: Record<string, number> = { starter: 1, pro: 2.5, business: 5 };

async function findUserKey(userId: string) {
  const res = await fetch(`${OPENROUTER_BASE}/keys`, {
    headers: { Authorization: `Bearer ${OPENROUTER_MGMT_KEY}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: Array<{ name?: string; hash?: string; limit?: number; usage?: number }> };
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
  const prefix = process.argv[2] || 'd6156270';
  const user = await db.getOne<{ id: string; email: string; plan: string; api_budget_addon_usd: number }>(
    'SELECT id, email, plan, COALESCE(api_budget_addon_usd, 0) as api_budget_addon_usd FROM users WHERE id::text LIKE $1',
    [`${prefix}%`]
  );
  if (!user) {
    console.log('User not found.');
    process.exit(1);
  }

  const planLimit = PLAN_SPEND_LIMITS_USD[user.plan] ?? 1;
  const addon = Number(user.api_budget_addon_usd) || 0;
  const correctLimit = planLimit + addon;

  const key = await findUserKey(user.id);
  if (!key?.hash) {
    console.log('No OpenRouter key found.');
    process.exit(1);
  }

  console.log(`User ${user.email} (${user.id.slice(0, 8)}...)`);
  console.log(`Plan: ${user.plan} (limit $${planLimit}) + addon $${addon} = $${correctLimit}`);
  console.log(`Current OpenRouter limit: $${key.limit} → setting to $${correctLimit}`);

  const ok = await patchKeyLimit(key.hash, correctLimit);
  console.log(ok ? 'Done.' : 'Failed.');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
