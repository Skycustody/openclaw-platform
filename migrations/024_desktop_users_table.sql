-- Separate table for desktop app users (independent from VPS/cloud users)
CREATE TABLE IF NOT EXISTS desktop_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(254) NOT NULL UNIQUE,
  google_id VARCHAR(200),
  avatar_url TEXT,
  display_name VARCHAR(200),
  stripe_customer_id VARCHAR(200),
  desktop_subscription_id TEXT,
  desktop_trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_desktop_users_email ON desktop_users(email);
CREATE INDEX IF NOT EXISTS idx_desktop_users_google_id ON desktop_users(google_id);
