-- Performance indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users (referral_code) WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_user_created ON conversations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_transactions_user_created ON token_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_transactions_user_type ON token_transactions (user_id, type);

CREATE INDEX IF NOT EXISTS idx_token_balances_user ON token_balances (user_id);

CREATE INDEX IF NOT EXISTS idx_cron_jobs_user ON cron_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run ON cron_jobs (next_run) WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_memories_user ON memories (user_id);

CREATE INDEX IF NOT EXISTS idx_channels_user ON user_channels (user_id);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_created ON activity_log (user_id, created_at DESC);
