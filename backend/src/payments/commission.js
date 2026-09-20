/**
 * Commission (§25). The live rate lives in system_config (DB), not in the
 * frontend; the admin panel can change it without a deploy.
 */
import { db } from '../db/client.js';
import { config } from '../config.js';

const KEY = 'marketplace.commission_percent';

export function getCommissionPercent() {
  try {
    const row = db().prepare('SELECT value FROM system_config WHERE key = ?').get(KEY);
    if (row) {
      const v = JSON.parse(row.value);
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
    }
  } catch {
    /* fall through to default */
  }
  return config.DEFAULT_COMMISSION_PERCENT;
}

export function setCommissionPercent(percent, updatedBy) {
  const n = Number(percent);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Комиссия должна быть от 0 до 100');
  db()
    .prepare(`INSERT INTO system_config (key, value, description, updated_by, updated_at)
              VALUES (?, ?, ?, ?, unixepoch())
              ON CONFLICT(key) DO UPDATE SET value = ?, updated_by = ?, updated_at = unixepoch()`)
    .run(KEY, JSON.stringify(n), 'Маркетплейс-комиссия, %', updatedBy ?? null, JSON.stringify(n), updatedBy ?? null);
  return n;
}
