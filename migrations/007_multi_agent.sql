-- Multi-agent support
-- Pro users can run 2 agents (2GB each), Business can run 4

CREATE TABLE IF NOT EXISTS agents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL DEFAULT 'Agent',
  purpose         TEXT,
  instructions    TEXT,
  server_id       UUID REFERENCES servers(id),
  container_name  VARCHAR(200),
  subdomain       VARCHAR(100) UNIQUE,
  status          VARCHAR(50) DEFAULT 'pending'
                  CHECK (status IN ('pending', 'provisioning', 'active', 'sleeping', 'paused', 'stopped')),
  ram_mb          INT DEFAULT 2048,
  is_primary      BOOLEAN DEFAULT false,
  created_at      TIMESTAMP DEFAULT NOW(),
  last_active     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_agents_user ON agents(user_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_server ON agents(server_id);

-- Add onboarding_completed flag to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
