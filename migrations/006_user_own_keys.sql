-- Users can bring their own API keys. Stored encrypted at rest.
-- When set, the proxy uses their key instead of the platform key,
-- and no token balance is deducted.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS own_openai_key TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS own_anthropic_key TEXT;
