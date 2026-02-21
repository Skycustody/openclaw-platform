-- Per-user proxy key for AI API access.
-- Containers use this key (not real provider keys) to call AI via the platform proxy.
ALTER TABLE users ADD COLUMN IF NOT EXISTS api_proxy_key TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_api_proxy_key ON users(api_proxy_key);
