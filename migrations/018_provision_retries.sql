-- Track provisioning retry count to prevent infinite server creation loops
ALTER TABLE users ADD COLUMN IF NOT EXISTS provision_retries INTEGER DEFAULT 0;
