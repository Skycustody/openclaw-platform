-- Prevent duplicate credit processing from Stripe webhook retries.
-- Each checkout session should only add credits once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_purchases_session
  ON credit_purchases (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
