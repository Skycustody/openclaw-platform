-- OpenClaw Platform - Initial Schema
-- Run against PostgreSQL with pgvector extension

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Servers ──
CREATE TABLE servers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hostinger_id    VARCHAR(200),
  ip              VARCHAR(50) UNIQUE NOT NULL,
  hostname        VARCHAR(200),
  ram_total       INT NOT NULL,
  ram_used        INT DEFAULT 0,
  cpu_cores       INT DEFAULT 4,
  status          VARCHAR(50) DEFAULT 'active'
                  CHECK (status IN ('active', 'provisioning', 'draining', 'offline')),
  region          VARCHAR(100) DEFAULT 'us-east',
  registered_at   TIMESTAMP DEFAULT NOW()
);

-- ── Users ──
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255),
  stripe_customer_id VARCHAR(200),
  plan            VARCHAR(50) DEFAULT 'starter'
                  CHECK (plan IN ('starter', 'pro', 'business')),
  status          VARCHAR(50) DEFAULT 'provisioning'
                  CHECK (status IN ('provisioning', 'active', 'sleeping', 'paused', 'cancelled')),
  server_id       UUID REFERENCES servers(id),
  container_name  VARCHAR(200),
  subdomain       VARCHAR(100) UNIQUE,
  s3_bucket       VARCHAR(200),
  timezone        VARCHAR(100) DEFAULT 'UTC',
  referral_code   VARCHAR(20) UNIQUE,
  referred_by     UUID REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW(),
  last_active     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_server ON users(server_id);
CREATE INDEX idx_users_email ON users(email);

-- ── User Channels ──
CREATE TABLE user_channels (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  telegram_token       TEXT,
  telegram_connected   BOOLEAN DEFAULT false,
  telegram_chat_id     VARCHAR(100),
  discord_token        TEXT,
  discord_connected    BOOLEAN DEFAULT false,
  discord_guild_id     VARCHAR(100),
  slack_token          TEXT,
  slack_connected      BOOLEAN DEFAULT false,
  slack_team_id        VARCHAR(100),
  whatsapp_connected   BOOLEAN DEFAULT false,
  signal_connected     BOOLEAN DEFAULT false,
  updated_at           TIMESTAMP DEFAULT NOW()
);

-- ── User Settings ──
CREATE TABLE user_settings (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  agent_name           VARCHAR(100) DEFAULT 'Assistant',
  agent_tone           VARCHAR(50) DEFAULT 'balanced',
  response_length      VARCHAR(50) DEFAULT 'balanced',
  language             VARCHAR(20) DEFAULT 'en',
  custom_instructions  TEXT,
  brain_mode           VARCHAR(50) DEFAULT 'auto',
  manual_model         VARCHAR(100),
  quiet_hours_enabled  BOOLEAN DEFAULT true,
  quiet_start          INT DEFAULT 22,
  quiet_end            INT DEFAULT 7,
  max_task_duration    INT DEFAULT 300,
  loop_detection       BOOLEAN DEFAULT true,
  token_budget_simple  INT DEFAULT 2000,
  token_budget_medium  INT DEFAULT 8000,
  token_budget_complex INT DEFAULT 20000
);

-- ── Token Balances ──
CREATE TABLE token_balances (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance          BIGINT DEFAULT 0,
  total_purchased  BIGINT DEFAULT 0,
  total_used       BIGINT DEFAULT 0,
  auto_topup       BOOLEAN DEFAULT false,
  auto_topup_amount INT DEFAULT 1000,
  low_balance_alert BIGINT DEFAULT 50000,
  updated_at       TIMESTAMP DEFAULT NOW()
);

-- ── Token Transactions ──
CREATE TABLE token_transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      BIGINT NOT NULL,
  type        VARCHAR(50) NOT NULL
              CHECK (type IN ('purchase', 'usage', 'bonus', 'refund', 'subscription_grant')),
  model       VARCHAR(100),
  task_id     UUID,
  description TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_token_tx_user ON token_transactions(user_id);
CREATE INDEX idx_token_tx_created ON token_transactions(created_at);

-- ── Token Packages ──
CREATE TABLE token_packages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(100) NOT NULL,
  tokens          BIGINT NOT NULL,
  price_cents     INT NOT NULL,
  stripe_price_id VARCHAR(200),
  bonus_percent   INT DEFAULT 0,
  active          BOOLEAN DEFAULT true
);

INSERT INTO token_packages (name, tokens, price_cents, bonus_percent) VALUES
  ('Starter Pack',    500000,    499, 0),
  ('Value Pack',     2000000,   1499, 15),
  ('Power Pack',     5000000,   2999, 25),
  ('Enterprise Pack', 15000000, 6999, 40);

-- ── Memories (pgvector) ──
CREATE TABLE memories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  type        VARCHAR(50) DEFAULT 'fact'
              CHECK (type IN ('fact', 'preference', 'episode', 'skill', 'person', 'context')),
  importance  FLOAT DEFAULT 0.5,
  tags        TEXT[],
  embedding   vector(1536),
  created_at  TIMESTAMP DEFAULT NOW(),
  accessed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_memories_user ON memories(user_id);
CREATE INDEX idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ── Cron Jobs ──
CREATE TABLE cron_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  schedule        VARCHAR(100) NOT NULL,
  token_budget    INT DEFAULT 3000,
  timeout_secs    INT DEFAULT 120,
  enabled         BOOLEAN DEFAULT true,
  last_run        TIMESTAMP,
  last_result     TEXT,
  last_tokens     INT,
  next_run        TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cron_user ON cron_jobs(user_id);
CREATE INDEX idx_cron_next ON cron_jobs(next_run) WHERE enabled = true;

-- ── Referrals ──
CREATE TABLE referrals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id     UUID NOT NULL REFERENCES users(id),
  referred_id     UUID NOT NULL REFERENCES users(id),
  status          VARCHAR(50) DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive', 'paid_out')),
  monthly_earn    INT DEFAULT 500,
  total_earned    INT DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);

-- ── Activity Log ──
CREATE TABLE activity_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  channel     VARCHAR(50),
  summary     TEXT NOT NULL,
  details     JSONB,
  tokens_used INT DEFAULT 0,
  model_used  VARCHAR(100),
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activity_user ON activity_log(user_id);
CREATE INDEX idx_activity_created ON activity_log(created_at);

-- ── Conversation History ──
CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel     VARCHAR(50) NOT NULL,
  role        VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     TEXT NOT NULL,
  model_used  VARCHAR(100),
  tokens_used INT DEFAULT 0,
  metadata    JSONB,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conv_user ON conversations(user_id);
CREATE INDEX idx_conv_created ON conversations(created_at);
CREATE INDEX idx_conv_content ON conversations USING gin(to_tsvector('english', content));

-- ── Agent Templates ──
CREATE TABLE agent_templates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id      UUID REFERENCES users(id),
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  category        VARCHAR(100),
  config          JSONB NOT NULL,
  rating          FLOAT DEFAULT 0,
  rating_count    INT DEFAULT 0,
  install_count   INT DEFAULT 0,
  published       BOOLEAN DEFAULT false,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_templates_category ON agent_templates(category);
CREATE INDEX idx_templates_published ON agent_templates(published) WHERE published = true;

-- ── User Files ──
CREATE TABLE user_files (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename    VARCHAR(500) NOT NULL,
  s3_key      VARCHAR(1000) NOT NULL,
  size_bytes  BIGINT DEFAULT 0,
  mime_type   VARCHAR(200),
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_files_user ON user_files(user_id);

-- ── User Sessions (security) ──
CREATE TABLE user_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  ip_address  VARCHAR(50),
  user_agent  TEXT,
  expires_at  TIMESTAMP NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_token ON user_sessions(token_hash);

-- ── Routing Decisions Log ──
CREATE TABLE routing_decisions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_preview VARCHAR(200),
  classification  JSONB NOT NULL,
  model_selected  VARCHAR(100) NOT NULL,
  reason          TEXT,
  tokens_saved    INT DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_routing_user ON routing_decisions(user_id);
