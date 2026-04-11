-- Agent Marketplace — cloud-hosted agent catalog
CREATE TABLE IF NOT EXISTS marketplace_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  nickname TEXT,
  description TEXT,
  role TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  soul TEXT NOT NULL,
  heartbeat TEXT,
  skills JSONB DEFAULT '[]'::jsonb,
  cron JSONB DEFAULT '[]'::jsonb,
  required_keys JSONB DEFAULT '[]'::jsonb,
  version INTEGER DEFAULT 1,
  published BOOLEAN DEFAULT true,
  downloads INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_category ON marketplace_agents(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_published ON marketplace_agents(published);
