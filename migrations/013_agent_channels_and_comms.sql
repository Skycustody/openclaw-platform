-- Per-agent channel connections and inter-agent communication permissions.
-- Replaces the single-row-per-user user_channels model with a many-to-many
-- relationship: each agent can have its own Telegram bot, WhatsApp number, etc.

-- Each row = one channel connection for one agent
CREATE TABLE IF NOT EXISTS agent_channels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_type    VARCHAR(50) NOT NULL
                  CHECK (channel_type IN ('telegram', 'discord', 'slack', 'whatsapp', 'signal')),
  token           TEXT,
  config          JSONB DEFAULT '{}',
  connected       BOOLEAN DEFAULT false,
  label           VARCHAR(100),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_channels_agent ON agent_channels(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_channels_user ON agent_channels(user_id);

-- Inter-agent communication permissions (directed graph).
-- source can spawn/message target only when enabled=true.
CREATE TABLE IF NOT EXISTS agent_communications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_agent_id   UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  target_agent_id   UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  enabled           BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_agent_id, target_agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_comms_source ON agent_communications(source_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_comms_target ON agent_communications(target_agent_id);

-- Store the stable openclaw agent ID so renaming an agent doesn't break config
ALTER TABLE agents ADD COLUMN IF NOT EXISTS openclaw_agent_id VARCHAR(100);
