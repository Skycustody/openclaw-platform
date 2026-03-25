-- Add 'pending' and 'starting' to user status constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('pending', 'provisioning', 'starting', 'active', 'sleeping', 'paused', 'cancelled', 'grace_period'));
