-- Credit purchase history + own OpenRouter key for BYOK users.
-- api_budget_addon_usd (from 011) tracks the running total; this table is the audit log.

CREATE TABLE IF NOT EXISTS credit_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_eur_cents INT NOT NULL,
  credits_usd NUMERIC(10,2) NOT NULL,
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_user ON credit_purchases(user_id);

-- Own OpenRouter key: when set, container uses this instead of the platform-managed key
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS own_openrouter_key TEXT;
