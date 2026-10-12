-- CRM Светланы: единые данные аккаунта для сайта, Windows и Android.
-- Каждая запись (контакт, сделка, событие/задача) хранится как JSON в формате
-- Svetlana 2.0 (CRMStore v1). Синхронизация: «последняя правка побеждает» по
-- времени изменения на устройстве (updated_at, мс), удаления — как tombstone
-- (deleted = 1), курсор синхронизации — монотонный seq на владельца.
CREATE TABLE IF NOT EXISTS crm_records (
  owner_id   TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('contacts', 'deals', 'activities')),
  id         TEXT    NOT NULL,
  data_json  TEXT,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  seq        INTEGER NOT NULL,
  PRIMARY KEY (owner_id, kind, id)
);

CREATE INDEX IF NOT EXISTS idx_crm_records_owner_seq ON crm_records (owner_id, seq);

CREATE TABLE IF NOT EXISTS crm_sync_seq (
  owner_id TEXT    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  seq      INTEGER NOT NULL DEFAULT 0
);
