-- Error reports from Valnaa desktop app (setup failures, crashes, etc.)
CREATE TABLE IF NOT EXISTS error_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(320),
  app_version VARCHAR(32),
  platform VARCHAR(32),
  arch VARCHAR(16),
  os_version VARCHAR(128),
  runtime VARCHAR(32),
  step_id VARCHAR(64),
  error_message TEXT,
  logs TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_reports_created_at ON error_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_reports_email ON error_reports(email);
CREATE INDEX IF NOT EXISTS idx_error_reports_resolved ON error_reports(resolved);
