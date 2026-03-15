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
 * │ spending limits. Each user gets their own key so:                     │
 * │   - Usage is isolated per user (no shared budget)                     │
 * │   - Spending limits enforce plan tiers automatically                  │
 * │   - Credits only refresh when Stripe payment is confirmed             │
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
import { validateUserId, logCreditAudit } from './creditAudit';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_MGMT_KEY = process.env.OPENROUTER_MGMT_KEY || '';
const OPENROUTER_FALLBACK_KEY = process.env.OPENROUTER_API_KEY || '';

/** OpenRouter Management API: create-key response shape */
interface CreateKeyResponse {
  data?: { key?: string; hash?: string };
  key?: string;
  hash?: string;
}

/** OpenRouter Management API: list-keys response shape */
interface ListKeysResponse {
  data?: Array<{
    name?: string;
    hash?: string;
    usage?: number;
    usage_monthly?: number;
    limit?: number;
    limit_remaining?: number;
    limit_reset?: string | null;
  }>;
}

/** Retail price multiplier over OpenRouter wholesale cost. 1.5 = 50% margin. */
export const RETAIL_MARKUP = 1.5;

/**
 * Display factor: 1.0 = show real OpenRouter dollar amounts.
 * Previously 1.59 which inflated displayed values and confused users.
 * Now we show the actual API budget so users see real numbers.
 */
export const DISPLAY_FACTOR = 1.0;

/** Revenue split for top-up purchases: 6% OpenRouter fee + 44% platform margin = 50% taken, 50% → API. */
export const PURCHASE_SPLIT = { openrouter: 0.06, platform: 0.44, userCredit: 0.50 } as const;

/**
 * OpenRouter wholesale costs per 1M tokens (USD).
 * OpenRouter charges no markup on provider pricing — these are direct provider costs.
 * Retail = wholesale × RETAIL_MARKUP.
 */
export const OPENROUTER_MODEL_COSTS: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'google/gemini-2.0-flash-001':          { inputPer1M: 0.10,  outputPer1M: 0.40  },
  'openai/gpt-4o-mini':                   { inputPer1M: 0.15,  outputPer1M: 0.60  },
  'openai/gpt-4.1-nano':                  { inputPer1M: 0.10,  outputPer1M: 0.40  },
  'openai/gpt-4.1-mini':                  { inputPer1M: 0.40,  outputPer1M: 1.60  },
  'qwen/qwen-2.5-coder-32b-instruct':    { inputPer1M: 0.06,  outputPer1M: 0.16  },
  'meta-llama/llama-4-scout':             { inputPer1M: 0.08,  outputPer1M: 0.30  },
  'meta-llama/llama-4-maverick':          { inputPer1M: 0.15,  outputPer1M: 0.60  },
  'deepseek/deepseek-chat-v3-0324':       { inputPer1M: 0.19,  outputPer1M: 0.87  },
  'google/gemini-2.5-flash':              { inputPer1M: 0.30,  outputPer1M: 2.50  },
  'x-ai/grok-3-mini-beta':               { inputPer1M: 0.30,  outputPer1M: 0.50  },
  'deepseek/deepseek-r1':                 { inputPer1M: 0.70,  outputPer1M: 2.50  },
  'anthropic/claude-3.5-haiku':           { inputPer1M: 1.00,  outputPer1M: 5.00  },
  'openai/o3-mini':                       { inputPer1M: 1.10,  outputPer1M: 4.40  },
  'google/gemini-2.5-pro':                { inputPer1M: 1.25,  outputPer1M: 10.00 },
  'openai/gpt-4.1':                       { inputPer1M: 2.00,  outputPer1M: 8.00  },
  'openai/gpt-4o':                        { inputPer1M: 2.50,  outputPer1M: 10.00 },
  'anthropic/claude-sonnet-4':            { inputPer1M: 3.00,  outputPer1M: 15.00 },
  'x-ai/grok-3-beta':                     { inputPer1M: 3.00,  outputPer1M: 15.00 },
  'mistralai/mistral-large-2':            { inputPer1M: 3.00,  outputPer1M: 9.00  },
  'anthropic/claude-opus-4':              { inputPer1M: 15.00, outputPer1M: 75.00 },
};

/**
 * Weighted average cost per 1M tokens (USD), assuming typical
 * usage mix (60% cheap models, 30% mid, 10% expensive).
 */
export const AVG_COST_PER_1M_USD = 1.80;

/** @deprecated EUR conversion removed — all pricing is now USD */
export const USD_TO_EUR_CENTS = 100;

export interface OpenRouterUsage {
  /** Display: amount used (reduces proportionally with real usage) */
  usedUsd: number;
  /** Display: amount remaining (what user "bought" minus proportional consumption) */
  remainingUsd: number;
  /** Display: total amount bought (plan base + credit purchases, shown as paid) */
  limitUsd: number;
  /** Total display amount from credit purchases only (for UI) */
  displayAmountBought: number;
  lastUpdated: string;
}

/**
 * Per-plan spending limits (USD) set on each user's OpenRouter key.
 * These are the max OpenRouter can charge per month for that key.
 * Must align with PLAN_LIMITS.nexosCreditBudgetUsdCents.
 */
/**
 * Actual OpenRouter API budget per plan (after 6% OR fee + 44% platform margin).
 * User sees the full display amount ($2/$5/$10) in the dashboard, but the
 * OpenRouter key limit is displayAmount × 0.50.
 */
const PLAN_SPEND_LIMITS_USD: Record<Plan, number> = {
  starter: 1,      // $2 × 0.50
  pro: 2.5,        // $5 × 0.50
  business: 5,     // $10 × 0.50
};

/** What the user paid — shown in the dashboard. API limit stays at PLAN_SPEND_LIMITS_USD. */
const PLAN_DISPLAY_USD: Record<Plan, number> = {
  starter: 2,
  pro: 5,
  business: 10,
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
        'OPENROUTER_MGMT_KEY env var is required for per-user API key creation. ' +
        'Get a Management API key from https://openrouter.ai/settings/management-keys'
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
        limitReset: 'none',
      }),
    });

    if (!res.ok) {
      console.warn(`[openrouter] Key creation failed (${res.status}): ${await res.text()}`);
      return null;
    }

    const data = (await res.json()) as CreateKeyResponse;
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
 * Returns display-scaled values: user sees amount paid ($5 → $5 bought), consumption reduces proportionally.
 */
export async function getNexosUsage(userId: string): Promise<OpenRouterUsage | null> {
  const row = await db.getOne<{ nexos_api_key: string | null; plan: string }>(
    'SELECT nexos_api_key, plan FROM users WHERE id = $1',
    [userId]
  );
  if (!row?.nexos_api_key) return null;

  const plan = (row.plan || 'starter') as Plan;
  const planDisplayBase = PLAN_DISPLAY_USD[plan] || PLAN_DISPLAY_USD.starter;

  const creditSum = await db.getOne<{ total: string }>(
    'SELECT COALESCE(SUM(amount_eur_cents / 100.0), 0) as total FROM credit_purchases WHERE user_id = $1', // column stores USD cents despite name
    [userId]
  );
  let creditDisplayTotal = parseFloat(creditSum?.total || '0');
  if (!Number.isFinite(creditDisplayTotal) || creditDisplayTotal < 0) creditDisplayTotal = 0;
  if (creditDisplayTotal > MAX_ADDON_USD) creditDisplayTotal = MAX_ADDON_USD;

  // User sees what they paid (plan price + credit purchases)
  let totalDisplay = planDisplayBase + creditDisplayTotal;
  if (!Number.isFinite(totalDisplay) || totalDisplay < 0) totalDisplay = planDisplayBase;

  const planSpendLimit = PLAN_SPEND_LIMITS_USD[plan] || PLAN_SPEND_LIMITS_USD.starter;

  if (OPENROUTER_MGMT_KEY) {
    try {
      const userKey = await findUserKey(userId);
      if (userKey) {
        // With limitReset:'none', use total usage against the cumulative limit
        const realUsage = userKey.usage ?? 0;
        const realLimit = userKey.limit ?? 0;
        const realRemaining = Math.max(0, realLimit - realUsage);

        // The cycle budget is the actual API spend limit for the current billing cycle
        const addonOrBudget = await db.getOne<{ total: string }>(
          'SELECT COALESCE(api_budget_addon_usd, 0)::text as total FROM users WHERE id = $1',
          [userId]
        );
        const addonBudget = parseFloat(addonOrBudget?.total || '0');
        const cycleBudget = planSpendLimit + addonBudget;

        let usedUsd: number;
        let remainingUsd: number;
        let limitUsd: number;

        if (cycleBudget > 0) {
          // Scale real API remaining to display amount
          const ratio = Math.min(1, realRemaining / cycleBudget);
          remainingUsd = Math.round(totalDisplay * ratio * 100) / 100;
          usedUsd = Math.round((totalDisplay - remainingUsd) * 100) / 100;
          limitUsd = Math.round(totalDisplay * 100) / 100;
        } else {
          usedUsd = 0;
          remainingUsd = totalDisplay;
          limitUsd = totalDisplay;
        }

        return {
          usedUsd,
          remainingUsd,
          limitUsd,
          displayAmountBought: Math.round(creditDisplayTotal * 100) / 100,
          lastUpdated: new Date().toISOString(),
        };
      }
    } catch {
      // Fall through to fallback
    }
  }

  return {
    usedUsd: 0,
    remainingUsd: totalDisplay,
    limitUsd: totalDisplay,
    displayAmountBought: creditDisplayTotal,
    lastUpdated: new Date().toISOString(),
  };
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
 * @deprecated Use resetKeyForBillingCycle (for monthly resets) or addCreditsToKey (for addons).
 * Kept for backwards compatibility. Sets an absolute limit — does NOT work correctly with
 * the cumulative limitReset:'none' model.
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

const MAX_ADDON_USD = 50_000;

/**
 * Add purchased credits to a user's OpenRouter spending limit.
 * Bumps the current key limit by the new addon amount (cumulative model).
 */
export async function addCreditsToKey(userId: string, creditsUsd: number): Promise<void> {
  const user = await validateUserId(userId);
  if (!user) {
    console.error(`[nexos] addCreditsToKey: user ${userId} not found — aborting`);
    return;
  }

  if (creditsUsd <= 0 || creditsUsd > MAX_ADDON_USD) {
    console.error(`[nexos] addCreditsToKey: invalid amount $${creditsUsd} for user ${userId}`);
    return;
  }

  // Track total addon spend in DB for display purposes
  const sum = await db.getOne<{ total: string }>(
    'SELECT COALESCE(SUM(credits_usd), 0) as total FROM credit_purchases WHERE user_id = $1',
    [userId]
  );
  const totalAddon = Math.round(parseFloat(sum?.total || '0') * 100) / 100;

  await db.query(
    'UPDATE users SET api_budget_addon_usd = $1 WHERE id = $2',
    [totalAddon, userId]
  );

  // Bump the OpenRouter key limit by the new addon amount
  const userKey = await findUserKey(userId);
  if (!userKey?.hash) {
    console.warn(`[nexos] addCreditsToKey: no OpenRouter key for user ${userId}`);
    return;
  }

  const currentLimit = userKey.limit ?? 0;
  const newLimit = Math.round((currentLimit + creditsUsd) * 100) / 100;

  try {
    await fetch(`${OPENROUTER_BASE}/keys/${userKey.hash}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_MGMT_KEY}`,
      },
      body: JSON.stringify({ limit: newLimit }),
    });

    console.log(`[openrouter] Addon credits for ${userId}: limit $${currentLimit} → $${newLimit} (+$${creditsUsd})`);
  } catch (err) {
    console.error(`[openrouter] Failed to add credits for ${userId}:`, err);
    throw err;
  }

  await logCreditAudit({
    operation: 'recalculation',
    userId,
    creditsUsd,
    openrouterLimitAfter: newLimit,
    metadata: { totalAddon },
  });
}

/**
 * @deprecated Purchased credits are permanent — they never reset.
 * Kept as a no-op so existing imports don't break.
 */
export async function resetMonthlyAddons(): Promise<string[]> {
  return [];
}

/** Look up a user's OpenRouter key hash for Management API operations. */
async function findUserKeyHash(userId: string): Promise<string | null> {
  const key = await findUserKey(userId);
  return key?.hash || null;
}

/** Look up a user's full OpenRouter key data for Management API operations. */
async function findUserKey(userId: string) {
  if (!OPENROUTER_MGMT_KEY) return null;
  try {
    const listRes = await fetch(`${OPENROUTER_BASE}/keys`, {
      headers: { 'Authorization': `Bearer ${OPENROUTER_MGMT_KEY}` },
    });
    if (!listRes.ok) return null;

    const listData = (await listRes.json()) as ListKeysResponse;
    const keys = listData.data || [];
    return keys.find((k) => k.name === `openclaw-${userId.slice(0, 8)}`) || null;
  } catch {
    return null;
  }
}

/**
 * Fetch total API usage across all OpenRouter keys (USD).
 * Used for admin financials to show real AI cost from OpenRouter.
 */
export async function fetchOpenRouterTotalUsage(): Promise<number> {
  if (!OPENROUTER_MGMT_KEY) return 0;
  try {
    const listRes = await fetch(`${OPENROUTER_BASE}/keys`, {
      headers: { 'Authorization': `Bearer ${OPENROUTER_MGMT_KEY}` },
    });
    if (!listRes.ok) return 0;

    const listData = (await listRes.json()) as ListKeysResponse;
    const keys = listData.data || [];
    const total = keys.reduce((sum, k) => sum + (k.usage_monthly ?? k.usage ?? 0), 0);
    return Math.round(total * 100) / 100; // USD, 2 decimals
  } catch (err) {
    console.error('[openrouter] fetchOpenRouterTotalUsage failed:', err);
    return 0;
  }
}

/**
 * Grant one billing cycle's worth of credits by bumping the OpenRouter key limit.
 * Called on each successful Stripe subscription invoice payment.
 *
 * With limitReset: 'none', usage accumulates against the limit. To give fresh
 * credits we add planBudget to the current limit. Unused credits carry over.
 */
export async function resetKeyForBillingCycle(userId: string): Promise<void> {
  if (!OPENROUTER_MGMT_KEY) return;

  const userRow = await db.getOne<{ plan: string; api_budget_addon_usd: number }>(
    'SELECT plan, COALESCE(api_budget_addon_usd, 0) as api_budget_addon_usd FROM users WHERE id = $1',
    [userId]
  );
  if (!userRow) return;

  const plan = (userRow.plan || 'starter') as Plan;
  const planBudget = PLAN_SPEND_LIMITS_USD[plan] || PLAN_SPEND_LIMITS_USD.starter;

  const userKey = await findUserKey(userId);
  if (!userKey?.hash) {
    console.warn(`[openrouter] resetKeyForBillingCycle: no key found for ${userId}`);
    return;
  }

  const currentLimit = userKey.limit ?? 0;
  const newLimit = Math.round((currentLimit + planBudget) * 100) / 100;

  try {
    const patchBody: Record<string, any> = { limit: newLimit };

    // Ensure key doesn't auto-reset (fix for existing keys created with 'monthly')
    if (userKey.limit_reset && userKey.limit_reset !== 'none') {
      patchBody.limit_reset = null;
    }

    await fetch(`${OPENROUTER_BASE}/keys/${userKey.hash}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_MGMT_KEY}`,
      },
      body: JSON.stringify(patchBody),
    });

    console.log(`[openrouter] Billing cycle reset for ${userId}: limit $${currentLimit} → $${newLimit} (plan=${plan}, +$${planBudget})`);
  } catch (err) {
    console.error(`[openrouter] Failed billing cycle reset for ${userId}:`, err);
  }
}

/**
 * Migrate an existing key: turn off auto-reset. Limit stays the same.
 */
export async function migrateKeyToNoReset(userId: string): Promise<boolean> {
  if (!OPENROUTER_MGMT_KEY) return false;

  const userKey = await findUserKey(userId);
  if (!userKey?.hash) return false;
  if (!userKey.limit_reset || userKey.limit_reset === 'none') return true;

  try {
    await fetch(`${OPENROUTER_BASE}/keys/${userKey.hash}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_MGMT_KEY}`,
      },
      body: JSON.stringify({ limit_reset: null }),
    });
    console.log(`[openrouter] Disabled auto-reset for ${userId}`);
    return true;
  } catch {
    return false;
  }
}

export { PLAN_SPEND_LIMITS_USD };

/**
 * Estimate API cost for a given number of tokens (USD cents).
 * Uses weighted average cost across models.
 */
export function estimateCostUsdCents(tokens: number): number {
  return Math.round((tokens / 1_000_000) * AVG_COST_PER_1M_USD * 100);
}

/** @deprecated Use estimateCostUsdCents — kept for backwards compat */
export const estimateCostEurCents = estimateCostUsdCents;

/**
 * Calculate the retail price (what we charge users) for API usage (USD cents).
 * Applies the 1.5× markup for 50% profit margin.
 */
export function retailPriceUsdCents(wholesaleCostUsdCents: number): number {
  return Math.round(wholesaleCostUsdCents * RETAIL_MARKUP);
}

/** @deprecated Use retailPriceUsdCents — kept for backwards compat */
export const retailPriceEurCents = retailPriceUsdCents;
