-- Linked devices (Windows app «Светлана 2.0», Android app «Svetlana-Home»).
-- Only health/security metadata is stored: platform, version, security flags, installed local models.
-- No CRM, business, voice or chat data ever leaves the device through this channel.
CREATE TABLE devices (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform       TEXT NOT NULL CHECK (platform IN ('windows', 'android')),
  name           TEXT NOT NULL,
  app_version    TEXT,
  token_hash     TEXT NOT NULL UNIQUE,
  status_json    TEXT NOT NULL DEFAULT '{}',
  models_json    TEXT NOT NULL DEFAULT '[]',
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at   INTEGER,
  revoked_at     INTEGER
);
CREATE INDEX idx_devices_user ON devices(user_id, revoked_at);

-- One-time link codes shown in the cabinet (10 minutes, single use, stored hashed).
CREATE TABLE device_link_codes (
  code_hash      TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at     INTEGER NOT NULL,
  used_at        INTEGER,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_device_link_codes_user ON device_link_codes(user_id, expires_at);
