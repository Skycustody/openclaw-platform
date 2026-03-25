-- OpenRouter Integration (column named nexos_api_key for backwards compatibility)
-- Adds API key column for per-user OpenRouter API keys.
-- Token tracking tables are preserved for historical data but no longer actively used.

-- Per-user OpenRouter API key (replaces api_proxy_key for new integrations)
-- Column is named nexos_api_key for backwards compatibility; it stores OpenRouter keys.
ALTER TABLE users ADD COLUMN IF NOT EXISTS nexos_api_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nexos_api_key ON users (nexos_api_key) WHERE nexos_api_key IS NOT NULL;

-- Mark own-key columns as deprecated (keep for rollback safety, don't drop yet)
COMMENT ON COLUMN user_settings.own_openai_key IS 'DEPRECATED: Replaced by OpenRouter integration';
COMMENT ON COLUMN user_settings.own_anthropic_key IS 'DEPRECATED: Replaced by OpenRouter integration';

-- Mark token tracking tables as deprecated
COMMENT ON TABLE token_balances IS 'DEPRECATED: OpenRouter handles billing via per-user key limits. Kept for historical data.';
COMMENT ON TABLE token_transactions IS 'DEPRECATED: OpenRouter handles billing via per-user key limits. Kept for historical data.';
