-- BYOK: allow users to bring their own OpenAI, Anthropic, and Gemini keys directly.
-- own_openai_key and own_anthropic_key already exist from migration 006 but were deprecated.
-- Un-deprecate them and add own_gemini_key.

COMMENT ON COLUMN user_settings.own_openai_key IS 'User own OpenAI API key for direct access (BYOK)';
COMMENT ON COLUMN user_settings.own_anthropic_key IS 'User own Anthropic API key for direct access (BYOK)';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS own_gemini_key TEXT;
COMMENT ON COLUMN user_settings.own_gemini_key IS 'User own Google Gemini API key for direct access (BYOK)';
