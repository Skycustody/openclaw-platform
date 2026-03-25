-- Extra API budget add-on (USD). Plans include a small API allowance; users can buy more for the current billing period.
-- Add-on is reset when their subscription renews (invoice.payment_succeeded for subscription).
ALTER TABLE users ADD COLUMN IF NOT EXISTS api_budget_addon_usd NUMERIC(10,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN users.api_budget_addon_usd IS 'One-time add-on API budget (USD) for current month; reset on subscription renewal';
