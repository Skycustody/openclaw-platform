# Credit System Security Audit

**Date:** 2025-03-04  
**Scope:** Credit purchases, free-credit exploits, production stability

## Summary

The credit system is **secure** against unauthorized free credits. Credits can only be granted via verified Stripe webhooks. No API endpoint or script exposes credit-granting to unauthenticated or non-admin users.

## Credit Flow (Single Source of Truth)

```
User pays via Stripe Checkout → Stripe sends webhook (signature verified)
→ handleCreditPurchase → INSERT credit_purchases (ON CONFLICT DO NOTHING)
→ addCreditsToKey → PATCH OpenRouter key limit
```

**Key:** Credits are ONLY added when:
1. Stripe sends `checkout.session.completed` with valid HMAC signature
2. `constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` succeeds
3. Session `payment_status === 'paid'`
4. `userId` is valid UUID, user exists, pack is valid
5. `credits_usd` comes from `CREDIT_PACKS[pack].orBudgetUsd` (server config), never from request body

## Protections Verified

| Vector | Protection |
|--------|------------|
| Fake webhook | `constructEvent` verifies Stripe signature; invalid = 400 |
| Replay attack | Stripe signature includes timestamp; replay fails |
| Duplicate processing | `ON CONFLICT (stripe_session_id) DO NOTHING` + unique index |
| Metadata tampering | `userId`/`pack` set server-side at checkout; amounts from `CREDIT_PACKS` |
| User ID spoofing | `req.userId` from JWT at checkout; webhook validates UUID + user exists |
| Admin abuse | `requireAdmin` checks `email === ADMIN_EMAIL`; no endpoint to set `api_budget_addon_usd` |
| token_balance | Admin can set it, but table is DEPRECATED; OpenRouter limit controls real usage |

## What Does NOT Grant Credits

- **Admin PUT /users/:userId** — Only sets `token_balance` (display), `plan`, `status`, `is_admin`. Does NOT touch `api_budget_addon_usd` or `credit_purchases`.
- **Scripts** — `migrate_credits_69_to_50`, `fix_user_limit`, etc. run via CLI only; not exposed as HTTP.
- **Billing API** — `POST /billing/buy-credits` creates Stripe checkout; credits only added when Stripe webhook fires after payment.

## Hardening Added (2025-03-04)

1. **UUID validation** — `handleCreditPurchase` rejects non-UUID `userId` from metadata
2. **payment_status check** — Reject sessions with `payment_status !== 'paid'`

## Production Checklist

- [ ] Migration `014_credit_purchase_dedup.sql` applied (unique index on `stripe_session_id`)
- [ ] `STRIPE_WEBHOOK_SECRET` set; `rawBody` captured for `/webhooks/stripe`
- [ ] HTTPS redirect skips `/webhooks/*` (index.ts)
- [ ] `verifyCreditMathAtStartup()` runs at API startup (creditAudit)
