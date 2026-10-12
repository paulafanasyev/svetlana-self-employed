/**
 * Синхронизация CRM Светланы между сайтом и устройствами (Windows, Android).
 *
 *   GET  /api/v1/crm/sync?since=<cursor>        → изменения после курсора
 *   POST /api/v1/crm/sync { since, changes[] }  → отправить свои и получить чужие
 *   GET  /api/v1/crm/snapshot                   → полный снимок (CRMStore v1)
 *
 * Модель данных — Svetlana 2.0 (CRMStore v1): contacts, deals, activities.
 * Конфликты: побеждает более поздняя правка (updatedAt, мс, время устройства;
 * время из будущего ограничивается). Удаление — tombstone, чтобы оно дошло
 * до всех устройств. Данные всегда изолированы по владельцу (owner_id).
 */
import { z } from 'zod';
import { db } from '../db/client.js';
import { sendError, validateOrThrow } from '../lib/http.js';

export const CRM_KINDS = ['contacts', 'deals', 'activities'];
export const CRM_LIMITS = { changes: 500, dataBytes: 64 * 1024, page: 1000, futureSkewMs: 5 * 60 * 1000 };
const ID_RE = /^[a-z]_[a-z0-9]{4,40}$/;

const changeSchema = z.object({
  kind: z.enum(CRM_KINDS),
  id: z.string().regex(ID_RE),
  updatedAt: z.number().int().nonnegative(),
  deleted: z.boolean().optional().default(false),
  data: z.record(z.any()).nullable().optional(),
});

const pushSchema = z.object({
  since: z.number().int().nonnegative().default(0),
  changes: z.array(changeSchema).max(CRM_LIMITS.changes).default([]),
});

/** Применить изменения владельца (LWW). Возвращает { applied, skipped }. */
export function applyCrmChanges(ownerId, changes, now = Date.now()) {
  const database = db();
  const read = database.prepare('SELECT updated_at FROM crm_records WHERE owner_id = ? AND kind = ? AND id = ?');
  const bump = database.prepare(
    'INSERT INTO crm_sync_seq (owner_id, seq) VALUES (?, 1) ON CONFLICT(owner_id) DO UPDATE SET seq = seq + 1 RETURNING seq'
  );
  const upsert = database.prepare(`
    INSERT INTO crm_records (owner_id, kind, id, data_json, updated_at, deleted, seq)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, kind, id) DO UPDATE SET
      data_json = excluded.data_json, updated_at = excluded.updated_at,
      deleted = excluded.deleted, seq = excluded.seq`);

  let applied = 0;
  let skipped = 0;
  database.transaction(() => {
    for (const c of changes) {
      const updatedAt = Math.min(c.updatedAt, now + CRM_LIMITS.futureSkewMs);
      const existing = read.get(ownerId, c.kind, c.id);
      if (existing && existing.updated_at > updatedAt) { skipped += 1; continue; }
      const deleted = c.deleted || !c.data;
      const json = deleted ? null : JSON.stringify({ ...c.data, id: c.id });
      const { seq } = bump.get(ownerId);
      upsert.run(ownerId, c.kind, c.id, json, updatedAt, deleted ? 1 : 0, seq);
      applied += 1;
    }
  });
  return { applied, skipped };
}

/** Изменения владельца после курсора. */
export function pullCrmChanges(ownerId, since = 0, limit = CRM_LIMITS.page) {
  const rows = db()
    .prepare('SELECT kind, id, data_json, updated_at, deleted, seq FROM crm_records WHERE owner_id = ? AND seq > ? ORDER BY seq LIMIT ?')
    .all(ownerId, since, limit);
  const current = db().prepare('SELECT seq FROM crm_sync_seq WHERE owner_id = ?').get(ownerId)?.seq ?? 0;
  const hasMore = rows.length === limit;
  const cursor = hasMore ? rows[rows.length - 1].seq : Math.max(current, since);
  return {
    cursor,
    hasMore,
    records: rows.map((r) => ({
      kind: r.kind,
      id: r.id,
      updatedAt: r.updated_at,
      deleted: Boolean(r.deleted),
      data: r.deleted ? null : safeJson(r.data_json),
    })),
  };
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

export default async function crmSyncRoutes(fastify) {
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });

  fastify.get('/sync', async (request, reply) => {
    const since = Number(request.query?.since ?? 0);
    if (!Number.isInteger(since) || since < 0) return sendError(reply, 400, 'validation_error', 'Некорректный курсор синхронизации');
    reply.header('cache-control', 'no-store');
    return pullCrmChanges(request.user.id, since);
  });

  fastify.post('/sync', { bodyLimit: CRM_LIMITS.changes * CRM_LIMITS.dataBytes }, async (request, reply) => {
    const body = validateOrThrow(pushSchema, request.body ?? {}, reply);
    if (!body) return;
    for (const c of body.changes) {
      if (c.data && JSON.stringify(c.data).length > CRM_LIMITS.dataBytes) {
        return sendError(reply, 413, 'record_too_large', `Запись ${c.kind}/${c.id} больше 64 КБ`);
      }
    }
    const result = applyCrmChanges(request.user.id, body.changes);
    reply.header('cache-control', 'no-store');
    return { ...pullCrmChanges(request.user.id, body.since), ...result };
  });

  /** Полный снимок CRM аккаунта (для первого входа на новом устройстве и экспорта). */
  fastify.get('/snapshot', async (request, reply) => {
    const rows = db()
      .prepare('SELECT kind, data_json FROM crm_records WHERE owner_id = ? AND deleted = 0 ORDER BY seq')
      .all(request.user.id);
    const out = { version: 1, contacts: [], deals: [], activities: [] };
    for (const r of rows) { const d = safeJson(r.data_json); if (d) out[r.kind].push(d); }
    const cursor = db().prepare('SELECT seq FROM crm_sync_seq WHERE owner_id = ?').get(request.user.id)?.seq ?? 0;
    reply.header('cache-control', 'no-store');
    return { ...out, cursor };
  });
}
