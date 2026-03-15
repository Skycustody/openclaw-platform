#!/usr/bin/env node
/**
 * Migration: Reduce past credit purchases from 69% to 50% API limit.
 *
 * Updates credit_purchases.credits_usd, users.api_budget_addon_usd, and
 * OpenRouter key limits. Users will lose the extra 19% (e.g. $1.90 per $10 pack).
 *
 * Usage:
 *   npx tsx scripts/migrate_credits_69_to_50.ts [--dry-run]
 *
 * Prerequisites:
 *   - OPENROUTER_MGMT_KEY must be set in .env
 *   - Run from api/ directory
 */
import path from 'path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env') });
config({ path: path.join(process.cwd(), '..', '.env') });

import db from '../src/lib/db';

const DRY_RUN = process.argv.includes('--dry-run');
const USER_CREDIT_RATE = 0.50;

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_MGMT_KEY = process.env.OPENROUTER_MGMT_KEY || '';

async function findUserKey(userId: string) {
  if (!OPENROUTER_MGMT_KEY) return null;
  try {
    const res = await fetch(`${OPENROUTER_BASE}/keys`, {
      headers: { Authorization: `Bearer ${OPENROUTER_MGMT_KEY}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ name?: string; hash?: string; limit?: number; usage?: number }> };
    const keys = data.data || [];
    return keys.find((k) => k.name === `openclaw-${userId.slice(0, 8)}`) || null;
  } catch {
    return null;
  }
}

async function patchKeyLimit(hash: string, newLimit: number): Promise<boolean> {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/keys/${hash}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_MGMT_KEY}`,
      },
      body: JSON.stringify({ limit: Math.round(newLimit * 100) / 100 }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log('=== Migrate Credits 69% → 50% ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log('');

  if (!DRY_RUN && !OPENROUTER_MGMT_KEY) {
    console.error('ERROR: OPENROUTER_MGMT_KEY must be set in .env');
    process.exit(1);
  }

  const purchases = await db.getMany<{ id: string; user_id: string; amount_eur_cents: number; credits_usd: number }>(
    'SELECT id, user_id, amount_eur_cents, credits_usd FROM credit_purchases ORDER BY created_at'
  );

  const toUpdate = purchases.filter((p) => {
    const packUsd = p.amount_eur_cents / 100;
    const newCredits = Math.round(packUsd * USER_CREDIT_RATE * 100) / 100;
    return Math.abs(p.credits_usd - newCredits) > 0.01;
  });

  console.log(`Total credit_purchases: ${purchases.length}`);
  console.log(`To update (69% → 50%): ${toUpdate.length}`);

  if (toUpdate.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  for (const p of toUpdate) {
    const packUsd = p.amount_eur_cents / 100;
    const newCredits = Math.round(packUsd * USER_CREDIT_RATE * 100) / 100;
    console.log(`  ${p.id.slice(0, 8)}... user=${p.user_id.slice(0, 8)}... $${packUsd} pack: $${p.credits_usd} → $${newCredits}`);
  }

  if (!DRY_RUN) {
    await db.query('BEGIN');
    try {
      for (const p of toUpdate) {
        const packUsd = p.amount_eur_cents / 100;
        const newCredits = Math.round(packUsd * USER_CREDIT_RATE * 100) / 100;
        await db.query('UPDATE credit_purchases SET credits_usd = $1 WHERE id = $2', [newCredits, p.id]);
      }

      const usersWithPurchases = [...new Set(toUpdate.map((p) => p.user_id))];
      for (const userId of usersWithPurchases) {
        const addonRow = await db.getOne<{ total: string }>(
          'SELECT COALESCE(SUM(credits_usd), 0)::text as total FROM credit_purchases WHERE user_id = $1',
          [userId]
        );
        const newAddon = parseFloat(addonRow?.total || '0');
        const userRow = await db.getOne<{ api_budget_addon_usd: number; plan: string }>(
          'SELECT COALESCE(api_budget_addon_usd, 0) as api_budget_addon_usd, plan FROM users WHERE id = $1',
          [userId]
        );
        const oldAddon = userRow?.api_budget_addon_usd ?? 0;

        await db.query('UPDATE users SET api_budget_addon_usd = $1 WHERE id = $2', [newAddon, userId]);

        const key = await findUserKey(userId);
        if (key?.hash) {
          const currentLimit = key.limit ?? 0;
          const newLimit = Math.round((currentLimit - oldAddon + newAddon) * 100) / 100;

          if (newLimit >= 0) {
            const ok = await patchKeyLimit(key.hash, newLimit);
            console.log(`  ${userId.slice(0, 8)}... addon $${oldAddon}→$${newAddon} limit $${currentLimit}→$${newLimit} ${ok ? 'OK' : 'FAIL'}`);
          } else {
            console.warn(`  ${userId.slice(0, 8)}... skip: newLimit would be negative ($${newLimit})`);
          }
        } else {
          console.log(`  ${userId.slice(0, 8)}... no OpenRouter key, DB updated only`);
        }
      }

      await db.query('COMMIT');
      console.log('\nDone.');
    } catch (err) {
      await db.query('ROLLBACK');
      console.error('Rolled back:', err);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
