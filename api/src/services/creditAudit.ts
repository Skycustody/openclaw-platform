/**
 * Credit Audit & Validation — security-proof credit operations.
 *
 * - Validates user IDs exist before any credit operation
 * - Validates amounts (no negative, no overflow)
 * - Verifies math: OPENROUTER_FEE + PLATFORM_FEE + TO_API = 1.0
 * - Logs all operations to credit_audit_log for audit trail
 * - Idempotency via stripe_session_id uniqueness
 */
import db from '../lib/db';
import { CREDIT_PACKS } from '../types';

const MAX_EUR_CENTS = 1_000_000; // €10,000 max per purchase
const MAX_CREDITS_USD = 100_000;
const MAX_ADDON_USD = 50_000;

/** Math verification: 6% + 25% + 69% = 100% */
const OPENROUTER_FEE = 0.06;
const PLATFORM_FEE = 0.25;
const TO_API_FRACTION = 1 - OPENROUTER_FEE - PLATFORM_FEE;

function assertMathCorrect(): void {
  const sum = OPENROUTER_FEE + PLATFORM_FEE + TO_API_FRACTION;
  if (Math.abs(sum - 1.0) > 0.0001) {
    throw new Error(`[credit] Math invariant violated: OR=${OPENROUTER_FEE} + platform=${PLATFORM_FEE} + api=${TO_API_FRACTION} = ${sum} (expected 1.0)`);
  }
}

/** Run at startup to verify credit math — throws if config is wrong */
export function verifyCreditMathAtStartup(): void {
  assertMathCorrect();
  for (const [packId, pack] of Object.entries(CREDIT_PACKS)) {
    const eur = pack.priceEurCents / 100;
    const expected = Math.round(eur * TO_API_FRACTION * 1.08 * 100) / 100;
    if (Math.abs(pack.orBudgetUsd - expected) > 0.02) {
      throw new Error(`[credit] Pack ${packId} orBudgetUsd=${pack.orBudgetUsd} != expected ${expected} for €${eur}`);
    }
  }
}

/** Validate userId exists and return user row */
export async function validateUserId(userId: string): Promise<{ id: string } | null> {
  if (!userId || typeof userId !== 'string' || userId.length < 30) {
    return null;
  }
  return db.getOne<{ id: string }>('SELECT id FROM users WHERE id = $1', [userId]);
}

/** Validate amount_eur_cents and credits_usd are in valid range */
export function validateAmounts(amountEurCents: number, creditsUsd: number): void {
  if (amountEurCents < 0 || creditsUsd < 0) {
    throw new Error(`[credit] Negative amounts rejected: eur=${amountEurCents} credits=${creditsUsd}`);
  }
  if (amountEurCents > MAX_EUR_CENTS || creditsUsd > MAX_CREDITS_USD) {
    throw new Error(`[credit] Amount overflow rejected: eur=${amountEurCents} credits=${creditsUsd}`);
  }
  if (!Number.isFinite(amountEurCents) || !Number.isFinite(creditsUsd)) {
    throw new Error(`[credit] Non-finite amounts rejected`);
  }
}

/** Verify pack orBudgetUsd matches expected formula for given priceEurCents */
export function verifyPackMath(packId: string, priceEurCents: number, expectedCreditsUsd: number): void {
  assertMathCorrect();
  const pack = CREDIT_PACKS[packId];
  if (!pack) return;

  const eur = priceEurCents / 100;
  const expected = Math.round(eur * TO_API_FRACTION * 1.08 * 100) / 100;
  const diff = Math.abs(expectedCreditsUsd - expected);

  if (diff > 0.02) {
    console.warn(`[credit] Pack math mismatch: ${packId} eur=${eur} expected=$${expected} got=$${expectedCreditsUsd}`);
  }
}

export type AuditOperation = 'purchase' | 'limit_update' | 'recalculation' | 'subscription_reset';

export interface AuditEntry {
  operation: AuditOperation;
  userId: string;
  amountEurCents?: number;
  creditsUsd?: number;
  stripeSessionId?: string;
  openrouterLimitBefore?: number;
  openrouterLimitAfter?: number;
  metadata?: Record<string, unknown>;
}

/** Log credit operation to audit table */
export async function logCreditAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.query(
      `INSERT INTO credit_audit_log (operation, user_id, amount_eur_cents, credits_usd, stripe_session_id, openrouter_limit_before, openrouter_limit_after, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.operation,
        entry.userId,
        entry.amountEurCents ?? null,
        entry.creditsUsd ?? null,
        entry.stripeSessionId ?? null,
        entry.openrouterLimitBefore ?? null,
        entry.openrouterLimitAfter ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ]
    );
  } catch (err) {
    console.error('[credit] Audit log failed:', err);
    // Don't throw — audit failure shouldn't block the operation
  }
}
