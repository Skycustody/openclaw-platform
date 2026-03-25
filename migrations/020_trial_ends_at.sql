-- 3-day free trial with no credits.
-- trial_ends_at: when set and in the future, user is in trial (can access dashboard, no AI credits).
-- When trial ends (trial_ends_at < NOW()) and no stripe_customer_id, user must upgrade.
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;
COMMENT ON COLUMN users.trial_ends_at IS 'When trial ends. If in future, user is in free trial (0 AI credits). After this, payment required.';
