/**
 * Notifications + the reminder scheduler (§32, §33).
 *
 * Due reminders are promoted to notifications on read/list — a real DB
 * transition, not a mock. The proactive engine (§33) writes rows here too.
 */
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { sendError, validateOrThrow } from '../lib/http.js';

export default async function notificationRoutes(fastify) {
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });

  fastify.get('/', async (request, reply) => {
    const { limit, offset } = validateOrThrow(
      z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) }),
      request.query,
      reply
    ) ?? { limit: 50, offset: 0 };
    flushDueReminders(request.user.id);
    const rows = db()
      .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(request.user.id, limit, offset);
    const unread = db()
      .prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL')
      .get(request.user.id);
    return { data: rows, unread: unread.n, limit, offset };
  });

  fastify.post('/read-all', async (request, reply) => {
    db()
      .prepare('UPDATE notifications SET read_at = unixepoch() WHERE user_id = ? AND read_at IS NULL')
      .run(request.user.id);
    reply.send({ ok: true });
  });

  fastify.patch('/:id/read', async (request, reply) => {
    db()
      .prepare('UPDATE notifications SET read_at = unixepoch() WHERE id = ? AND user_id = ?')
      .run(request.params.id, request.user.id);
    reply.send({ ok: true });
  });

  fastify.post('/reminders/flush', async (request, reply) => {
    const n = flushDueReminders(request.user.id);
    reply.send({ promoted: n });
  });
}

/** Turn due pending reminders into notifications (idempotent via status). */
export function flushDueReminders(userId) {
  const due = db()
    .prepare(`SELECT id, message, remind_at FROM reminders
              WHERE owner_id = ? AND status = 'pending' AND remind_at <= unixepoch()`)
    .all(userId);
  if (!due.length) return 0;
  const ins = db()
    .prepare('INSERT INTO notifications (id, user_id, kind, title, body) VALUES (?, ?, ?, ?, ?)');
  const mark = db().prepare("UPDATE reminders SET status = 'sent' WHERE id = ?");
  let n = 0;
  db().transaction(() => {
    for (const r of due) {
      ins.run(nanoid(), userId, 'reminder', 'Напоминание', r.message);
      mark.run(r.id);
      n++;
    }
  });
  return n;
}


/** Promote all due reminders while the backend process is alive. */
export function flushAllDueReminders() {
  const due = db()
    .prepare(`SELECT id, owner_id, message
              FROM reminders
              WHERE status = 'pending' AND remind_at <= unixepoch()`)
    .all();
  if (!due.length) return 0;
  const ins = db()
    .prepare('INSERT INTO notifications (id, user_id, kind, title, body) VALUES (?, ?, ?, ?, ?)');
  const mark = db().prepare("UPDATE reminders SET status = 'sent' WHERE id = ?");
  db().transaction(() => {
    for (const r of due) {
      ins.run(nanoid(), r.owner_id, 'reminder', 'Напоминание', r.message);
      mark.run(r.id);
    }
  });
  return due.length;
}
