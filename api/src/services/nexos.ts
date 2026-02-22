/**
 * OpenRouter Integration — manages per-user API keys, spending limits,
 * and cost/profit tracking via OpenRouter's Management API.
 *
 * OpenRouter provides an OpenAI-compatible gateway at https://openrouter.ai/api/v1
 * that routes to multiple providers (OpenAI, Anthropic, Google, xAI) with
 * no markup on provider pricing.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ PER-USER KEY MANAGEMENT                                               │
 * │                                                                       │
 * │ OpenRouter's Management API lets us create per-user API keys with     │
 * │ spending limits and monthly resets. Each user gets their own key so:  │
 * │   - Usage is isolated per user (no shared budget)                     │
 * │   - Spending limits enforce plan tiers automatically                  │
 * │   - Monthly resets align with billing cycles                          │
 * │   - Keys can be disabled/deleted on cancellation                      │
 * │                                                                       │
 * │ Setup: create a Management API key at                                 │
 * │   https://openrouter.ai/settings/management-keys                     │
 * │ and set OPENROUTER_MGMT_KEY in .env                                  │
 * │                                                                       │
 * │ COST MODEL — 50% profit margin target                                │
 * │                                                                       │
 * │ OpenRouter charges no markup on provider pricing. We charge users a   │
 * │ flat monthly subscription that must cover:                            │
 * │   1. OpenRouter API costs (varies by model usage)                     │
 * │   2. Server infrastructure (Hetzner VPS per user container)           │
 * │   3. ≥50% profit margin on top                                       │
 * │                                                                       │
 * │ Smart routing (cheaper default models for lower-tier plans) reduces   │
 * │ API costs by ~40-60%, widening actual margins.                       │
 * │                                                                       │
 * │ RETAIL_MARKUP = 1.5 → we charge 1.5× our API cost to the user.      │
 * └────────────────────────────────────────────────────────────────────────┘
 */
import db from '../lib/db';
import { PLAN_LIMITS, Plan } from '../types';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_MGMT_KEY = process.env.OPENROUTER_MGMT_KEY || '';
const OPENROUTER_FALLBACK_KEY = process.env.OPENROUTER_API_KEY || '';

/** Retail price multiplier over OpenRouter wholesale cost. 1.5 = 50% margin. */
export const RETAIL_MARKUP = 1.5;

/**
 * OpenRouter wholesale costs per 1M tokens (USD).
 * OpenRouter charges no markup on provider pricing — these are direct provider costs.
 * Retail = wholesale × RETAIL_MARKUP.
 */
export const OPENROUTER_MODEL_COSTS: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'google/gemini-2.0-flash-001':      { inputPer1M: 0.10,  outputPer1M: 0.40  },
  'openai/gpt-4o-mini':               { inputPer1M: 0.15,  outputPer1M: 0.60  },
  'openai/gpt-4.1-mini':              { inputPer1M: 0.40,  outputPer1M: 1.60  },
  'anthropic/claude-3.5-haiku':       { inputPer1M: 0.80,  outputPer1M: 4.00  },
  'openai/gpt-4o':                    { inputPer1M: 2.50,  outputPer1M: 10.00 },
  'openai/gpt-4.1':                   { inputPer1M: 2.00,  outputPer1M: 8.00  },
  'anthropic/claude-sonnet-4-20250514': { inputPer1M: 3.00,  outputPer1M: 15.00 },
  'openai/o3-mini':                   { inputPer1M: 1.10,  outputPer1M: 4.40  },
};

/**
 * Weighted average cost per 1M tokens (USD), assuming typical
 * usage mix (60% cheap models, 30% mid, 10% expensive).
 */
export const AVG_COST_PER_1M_USD = 1.80;

/** Convert USD to EUR cents (approximate, update periodically) */
export const USD_TO_EUR_CENTS = 92;

export interface OpenRouterUsage {
  creditsUsed: number;
  creditsRemaining: number;
  lastUpdated: string;
}

/**
 * Per-plan spending limits (USD) set on each user's OpenRouter key.
 * These are the max OpenRouter can charge per month for that key.
 * Must align with PLAN_LIMITS.nexosCreditBudgetEurCents (after EUR→USD conversion).
 */
const PLAN_SPEND_LIMITS_USD: Record<Plan, number> = {
  starter: 3,
  pro: 7,
  business: 15,
};

/**
 * Ensure a user has an OpenRouter API key. Creates one via the Management API
 * if available, otherwise falls back to a shared key.
 */
export async function ensureNexosKey(userId: string): Promise<string> {
  // Check for existing key
  const row = await db.getOne<{ nexos_api_key: string | null }>(
    'SELECT nexos_api_key FROM users WHERE id = $1',
    [userId]
  );
  if (row?.nexos_api_key) return row.nexos_api_key;

  // Try creating a per-user key via Management API
  let key = await createOpenRouterKey(userId).catch(() => null);

  // Fall back to the shared API key
  if (!key) {
    if (!OPENROUTER_FALLBACK_KEY) {
      throw new Error(
        'OPENROUTER_API_KEY or OPENROUTER_MGMT_KEY env var is required. ' +
        'Get an API key from https://openrouter.ai/keys'
      );
    }
    key = OPENROUTER_FALLBACK_KEY;
  }

  await db.query(
    'UPDATE users SET nexos_api_key = $1 WHERE id = $2',
    [key, userId]
  );

  console.log(`[openrouter] API key assigned for user ${userId}`);
  return key;
}

/**
 * Create a per-user OpenRouter API key via the Management API.
 * Sets a monthly spending limit based on the user's plan.
 *
 * Management API docs: https://openrouter.ai/docs/guides/overview/auth/management-api-keys
 * Endpoint: POST https://openrouter.ai/api/v1/keys
 */
async function createOpenRouterKey(userId: string): Promise<string | null> {
  if (!OPENROUTER_MGMT_KEY) return null;

  // Look up user's plan to set the right spending limit
  const user = await db.getOne<{ plan: string }>('SELECT plan FROM users WHERE id = $1', [userId]);
  const plan = (user?.plan || 'starter') as Plan;
  const spendLimit = PLAN_SPEND_LIMITS_USD[plan] || PLAN_SPEND_LIMITS_USD.starter;

  try {
    const res = await fetch(`${OPENROUTER_BASE}/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_MGMT_KEY}`,
      },
      body: JSON.stringify({
        name: `openclaw-${userId.slice(0, 8)}`,
        limit: spendLimit,
        limitReset: 'monthly',
      }),
    });

    if (!res.ok) {
      console.warn(`[openrouter] Key creation failed (${res.status}): ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    const key = data.data?.key || data.key || null;

    if (key) {
      // Store the key hash for future management operations
      const keyHash = data.data?.hash || data.hash || null;
      if (keyHash) {
        await db.query(
          `UPDATE users SET nexos_api_key = $1 WHERE id = $2`,
          [key, userId]
        );
      }
      console.log(`[openrouter] Per-user key created for ${userId} (limit=$${spendLimit}/mo)`);
    }

    return key;
  } catch (err) {
    console.warn('[openrouter] Key creation error:', err);
    return null;
  }
}

/**
 * Delete a user's OpenRouter API key (cleanup on deprovision).
 */
export async function deleteNexosKey(userId: string): Promise<void> {
  const row = await db.getOne<{ nexos_api_key: string | null }>(
    'SELECT nexos_api_key FROM users WHERE id = $1',
    [userId]
  );

  if (!row?.nexos_api_key || row.nexos_api_key === OPENROUTER_FALLBACK_KEY) {
    await db.query('UPDATE users SET nexos_api_key = NULL WHERE id = $1', [userId]);
    return;
  }

  if (OPENROUTER_MGMT_KEY) {
    try {
      const keyHash = await findUserKeyHash(userId);
      if (keyHash) {
        await fetch(`${OPENROUTER_BASE}/keys/${keyHash}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${OPENROUTER_MGMT_KEY}` },
        });
      }
    } catch {
      // Best-effort cleanup
    }
  }

  await db.query('UPDATE users SET nexos_api_key = NULL WHERE id = $1', [userId]);
}

/**
 * Query OpenRouter for a user's credit/usage info.
 * Uses the Management API to look up key usage stats.
 */
export async function getNexosUsage(userId: string): Promise<OpenRouterUsage | null> {
  const row = await db.getOne<{ nexos_api_key: string | null }>(
    'SELECT nexos_api_key FROM users WHERE id = $1',
    [userId]
  );
  if (!row?.nexos_api_key) return null;

  if (OPENROUTER_MGMT_KEY) {
    try {
      const listRes = await fetch(`${OPENROUTER_BASE}/keys`, {
        headers: { 'Authorization': `Bearer ${OPENROUTER_MGMT_KEY}` },
      });
      if (listRes.ok) {
        const listData = await listRes.json();
        const keys = listData.data || [];
        const userKey = keys.find((k: any) => k.name === `openclaw-${userId.slice(0, 8)}`);
        if (userKey) {
          const used = userKey.usage_monthly ?? userKey.usage ?? 0;
          const limit = userKey.limit ?? 0;
          return {
            creditsUsed: used,
            creditsRemaining: Math.max(0, limit - used),
            lastUpdated: new Date().toISOString(),
          };
        }
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: no detailed usage available
  return null;
}

/**
 * Get the user's OpenRouter API key from the database.
 * Column is still named nexos_api_key for backwards compatibility.
 */
export async function getUserNexosKey(userId: string): Promise<string | null> {
  const row = await db.getOne<{ nexos_api_key: string | null }>(
    'SELECT nexos_api_key FROM users WHERE id = $1',
    [userId]
  );
  return row?.nexos_api_key ?? null;
}

/**
 * Update the spending limit on a user's OpenRouter key.
 * Combines plan base limit + any purchased add-on credits.
 */
export async function updateKeyLimit(userId: string, plan: Plan, extraCreditsUsd?: number): Promise<void> {
  if (!OPENROUTER_MGMT_KEY) return;

  const base = PLAN_SPEND_LIMITS_USD[plan] || PLAN_SPEND_LIMITS_USD.starter;
  const addon = extraCreditsUsd ?? 0;
  const newLimit = Math.round((base + addon) * 100) / 100;

  try {
    const keyHash = await findUserKeyHash(userId);
    if (!keyHash) return;

    await fetch(`${OPENROUTER_BASE}/keys/${keyHash}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_MGMT_KEY}`,
      },
      body: JSON.stringify({ limit: newLimit }),
    });

    console.log(`[openrouter] Updated key limit for ${userId} to $${newLimit}/mo (base=$${base} + addon=$${addon})`);
  } catch (err) {
    console.warn(`[openrouter] Failed to update key limit for ${userId}:`, err);
  }
}

/**
 * Add purchased credits to a user's OpenRouter spending limit.
 * Reads current addon from DB and PATCHes the key with the new total.
 */
export async function addCreditsToKey(userId: string, creditsUsd: number): Promise<void> {
  await db.query(
    'UPDATE users SET api_budget_addon_usd = api_budget_addon_usd + $1 WHERE id = $2',
    [creditsUsd, userId]
  );

  const user = await db.getOne<{ plan: string; api_budget_addon_usd: number }>(
    'SELECT plan, api_budget_addon_usd FROM users WHERE id = $1',
    [userId]
  );
  if (!user) return;

  await updateKeyLimit(userId, (user.plan || 'starter') as Plan, user.api_budget_addon_usd);
}

/**
 * Reset all add-on credits back to 0 (called on monthly billing cycle).
 * Returns user IDs that were reset so their key limits can be updated.
 */
export async function resetMonthlyAddons(): Promise<string[]> {
  const rows = await db.getMany<{ id: string; plan: string }>(
    `UPDATE users SET api_budget_addon_usd = 0
     WHERE api_budget_addon_usd > 0
     RETURNING id, plan`
  );

  for (const row of rows) {
    await updateKeyLimit(row.id, (row.plan || 'starter') as Plan, 0).catch(err =>
      console.warn(`[openrouter] Failed to reset key limit for ${row.id}:`, err)
    );
  }

  if (rows.length > 0) {
    console.log(`[openrouter] Reset add-on credits for ${rows.length} users`);
  }
  return rows.map(r => r.id);
}

/** Look up a user's OpenRouter key hash for Management API operations. */
async function findUserKeyHash(userId: string): Promise<string | null> {
  try {
    const listRes = await fetch(`${OPENROUTER_BASE}/keys`, {
      headers: { 'Authorization': `Bearer ${OPENROUTER_MGMT_KEY}` },
    });
    if (!listRes.ok) return null;

    const listData = await listRes.json();
    const keys = listData.data || [];
    const userKey = keys.find((k: any) => k.name === `openclaw-${userId.slice(0, 8)}`);
    return userKey?.hash || null;
  } catch {
    return null;
  }
}

export { PLAN_SPEND_LIMITS_USD };

/**
 * Estimate API cost for a given number of tokens (EUR cents).
 * Uses weighted average cost across models.
 */
export function estimateCostEurCents(tokens: number): number {
  return Math.round((tokens / 1_000_000) * AVG_COST_PER_1M_USD * USD_TO_EUR_CENTS);
}

/**
 * Calculate the retail price (what we charge users) for API usage (EUR cents).
 * Applies the 1.5× markup for 50% profit margin.
 */
export function retailPriceEurCents(wholesaleCostEurCents: number): number {
  return Math.round(wholesaleCostEurCents * RETAIL_MARKUP);
}
