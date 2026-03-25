-- Per-task routing preferences: lets users override which model the AI router
-- picks for each task category (e.g. coding → codex-mini instead of claude-sonnet-4).
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS routing_preferences JSONB DEFAULT '{}';
