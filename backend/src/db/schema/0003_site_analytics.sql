-- Site analytics and cookie-consent telemetry.
-- No IP address, user-agent, account id, raw cookie or query string is stored.
CREATE TABLE site_analytics_events (
  id             TEXT PRIMARY KEY,
  event_type     TEXT NOT NULL CHECK (event_type IN ('page_view', 'consent_analytics_granted')),
  path           TEXT NOT NULL,
  day            TEXT NOT NULL,
  hour           INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
  session_hash   TEXT,
  referrer_origin TEXT,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_site_analytics_day ON site_analytics_events(day);
CREATE INDEX idx_site_analytics_path ON site_analytics_events(path, day);
CREATE INDEX idx_site_analytics_session ON site_analytics_events(session_hash, day);
CREATE INDEX idx_site_analytics_type ON site_analytics_events(event_type, day);
