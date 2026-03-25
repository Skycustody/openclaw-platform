-- Trial expiry: remove container on day 4, keep data for 30 days.
-- trial_data_retention_until: when to delete data if user never pays.
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_data_retention_until TIMESTAMP;
COMMENT ON COLUMN users.trial_data_retention_until IS 'When to delete trial user data if unpaid. trial_ends_at + 30 days.';

-- Track which trial reminder emails have been sent (1 = day-before, 2 = last-day)
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_reminder_sent SMALLINT DEFAULT 0;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('pending', 'provisioning', 'starting', 'active', 'sleeping', 'paused', 'cancelled', 'grace_period', 'trial_expired'));
