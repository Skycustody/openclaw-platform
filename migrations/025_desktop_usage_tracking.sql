-- Track desktop app usage sessions (heartbeats from the app)
CREATE TABLE IF NOT EXISTS desktop_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES desktop_users(id) ON DELETE CASCADE,
  session_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  app_version VARCHAR(20),
  os VARCHAR(50),
  arch VARCHAR(20)
);

CREATE INDEX IF NOT EXISTS idx_desktop_usage_user_id ON desktop_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_desktop_usage_last_heartbeat ON desktop_usage(last_heartbeat);
