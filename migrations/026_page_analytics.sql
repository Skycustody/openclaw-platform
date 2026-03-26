-- Self-hosted website analytics (anonymous visitor_id, no PII)
CREATE TABLE IF NOT EXISTS page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID NOT NULL,
  path TEXT NOT NULL,
  referrer TEXT,
  utm_source VARCHAR(200),
  utm_medium VARCHAR(200),
  utm_campaign VARCHAR(200),
  country VARCHAR(8),
  device VARCHAR(32),
  browser VARCHAR(64),
  os VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views(path);
CREATE INDEX IF NOT EXISTS idx_page_views_visitor_id ON page_views(visitor_id);

CREATE TABLE IF NOT EXISTS track_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID NOT NULL,
  event VARCHAR(128) NOT NULL,
  path TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_track_events_created_at ON track_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_track_events_event ON track_events(event);
CREATE INDEX IF NOT EXISTS idx_track_events_visitor_id ON track_events(visitor_id);
