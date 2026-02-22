-- Multi-agent: agents run inside the user's single OpenClaw container
-- using OpenClaw's native agents.list in openclaw.json.
-- No separate containers per agent.

-- gateway_token is no longer per-agent (shared container gateway)
-- but keep columns for backward compatibility if they were already added.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS gateway_token VARCHAR(200);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS api_proxy_key VARCHAR(200);
