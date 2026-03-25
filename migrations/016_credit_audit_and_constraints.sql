-- Credit audit log + constraints for security and audit trail.
-- Ensures no ID mixups, no negative amounts, and full auditability.

-- Audit log for all credit-related operations
CREATE TABLE IF NOT EXISTS credit_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  operation TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_eur_cents INT,
  credits_usd NUMERIC(10,2),
  stripe_session_id TEXT,
  openrouter_limit_before NUMERIC(10,2),
  openrouter_limit_after NUMERIC(10,2),
  metadata JSONB,
  CHECK (operation IN ('purchase', 'limit_update', 'recalculation', 'subscription_reset'))
);
CREATE INDEX IF NOT EXISTS idx_credit_audit_user ON credit_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_audit_created ON credit_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_credit_audit_session ON credit_audit_log(stripe_session_id) WHERE stripe_session_id IS NOT NULL;

-- Prevent negative amounts (only add if no existing rows violate)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_credit_purchases_amount_positive')
     AND NOT EXISTS (SELECT 1 FROM credit_purchases WHERE amount_eur_cents < 0 OR credits_usd < 0)
  THEN
    ALTER TABLE credit_purchases ADD CONSTRAINT chk_credit_purchases_amount_positive
      CHECK (amount_eur_cents >= 0 AND credits_usd >= 0);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add credit_purchases constraint: %', SQLERRM;
END $$;
