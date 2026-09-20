/**
 * Audit log helper (§39). Every security-relevant mutation is recorded with
 * the actor, action, entity and a JSON summary of what changed.
 *
 * Writes are best-effort: an audit failure must never break the user's request,
 * but it is logged loudly.
 */
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';

const stmt = () =>
  db().prepare(`
    INSERT INTO audit_logs (id, actor_id, action, entity, entity_id, detail, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

export function audit({ actorId, action, entity, entityId, detail, ip }) {
  try {
    stmt().run(
      nanoid(),
      actorId ?? null,
      action,
      entity,
      entityId ?? null,
      detail ? JSON.stringify(detail) : null,
      ip ?? null
    );
  } catch (err) {
    console.error('[audit] failed to write audit log:', err.message);
  }
}

/** Attach actor + ip automatically from a Fastify request. */
export function auditRequest(request, action, entity, entityId, detail) {
  audit({
    actorId: request.user?.id,
    action,
    entity,
    entityId,
    detail,
    ip: request.ip,
  });
}

export function diffSummary(before = {}, after = {}) {
  const changed = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed[key] = { from: before[key] ?? null, to: after[key] ?? null };
    }
  }
  return changed;
}
