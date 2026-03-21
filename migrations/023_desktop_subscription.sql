-- Desktop app subscription (separate from VPS cloud plans)
ALTER TABLE users ADD COLUMN IF NOT EXISTS desktop_subscription_id TEXT DEFAULT NULL;
