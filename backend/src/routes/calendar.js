/**
 * Calendar events + reminders (§32).
 *
 * "Напомни завтра в 10 позвонить клиенту" → a calendar_event (kind=reminder)
 * plus a reminders row with remind_at. Both are real DB rows; the notification
 * scheduler turns pending reminders into notifications.
 */
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { auditRequest } from '../plugins/audit.js';
import { sendError, validateOrThrow } from '../lib/http.js';
import { crudPlugin } from '../lib/crud.js';

const eventBase = {
  task_id: z.string().nullable().optional(),
  project_id: z.string().nullable().optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(4000).nullable().optional(),
  starts_at: z.coerce.number().int(),
  ends_at: z.coerce.number().int().nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  kind: z.enum(['meeting', 'deadline', 'reminder', 'task', 'other']).optional(),
  rrule: z.string().max(200).nullable().optional(),
};

function parseNaturalTime(input) {
  // Accepts epoch seconds (from clients) — natural-language parsing happens in
  // Светлана's tool layer, which resolves to an epoch before calling the API.
  return typeof input === 'number' ? input : null;
}

export default async function calendarRoutes(fastify) {
  // The crudPlugin registers its own preValidation hook *inside its scope*, so
  // sibling routes below (contacts, tags, subtasks, …) must require auth
  // explicitly — otherwise request.user is null and they 500 (and would be
  // effectively unauthenticated, an IDOR hole).
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });
  await fastify.register(
    crudPlugin({
      table: 'calendar_events',
      columns: ['task_id', 'project_id', 'title', 'description', 'starts_at', 'ends_at', 'location', 'kind', 'rrule'],
      createSchema: z.object(eventBase),
      updateSchema: z.object(Object.fromEntries(Object.entries(eventBase).map(([k, v]) => [k, v.optional()]))),
      search: ['title', 'description', 'location'],
      order: 'starts_at ASC',
      afterCreate: async (_f, request, row) => {
        // A reminder-kind event also seeds the reminders queue.
        if (row.kind === 'reminder') {
          db()
            .prepare(`INSERT INTO reminders (id, owner_id, event_id, message, remind_at, channel)
                      VALUES (?, ?, ?, ?, ?, 'in_app')`)
            .run(nanoid(), request.user.id, row.id, row.title, row.starts_at);
        }
      },
    })
  );

  // Month/agenda window
  fastify.get('/range/:from/:to', async (request, reply) => {
    const from = parseNaturalTime(Number(request.params.from));
    const to = parseNaturalTime(Number(request.params.to));
    if (from === null || to === null) return sendError(reply, 400, 'validation_error', 'Ожидаются epoch-секунды');
    const rows = db()
      .prepare(`SELECT * FROM calendar_events WHERE owner_id = ? AND starts_at BETWEEN ? AND ? ORDER BY starts_at`)
      .all(request.user.id, from, to);
    reply.send({ data: rows });
  });

  // Reminders
  fastify.get('/reminders', async (request, reply) => {
    const rows = db()
      .prepare(`SELECT r.*, e.title AS event_title FROM reminders r
                LEFT JOIN calendar_events e ON e.id = r.event_id
                WHERE r.owner_id = ? ORDER BY r.remind_at ASC`)
      .all(request.user.id);
    reply.send({ data: rows });
  });

  fastify.post('/reminders', async (request, reply) => {
    const body = validateOrThrow(
      z.object({
        task_id: z.string().nullable().optional(),
        event_id: z.string().nullable().optional(),
        message: z.string().min(1).max(500),
        remind_at: z.coerce.number().int(),
        channel: z.enum(['in_app', 'email', 'push']).optional(),
      }),
      request.body,
      reply
    );
    if (!body) return;
    const id = nanoid();
    db()
      .prepare(`INSERT INTO reminders (id, owner_id, event_id, task_id, message, remind_at, channel)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, request.user.id, body.event_id ?? null, body.task_id ?? null, body.message, body.remind_at, body.channel ?? 'in_app');
    const row = db().prepare('SELECT * FROM reminders WHERE id = ?').get(id);
    auditRequest(request, 'create', 'reminder', id, body);
    reply.code(201).send(row);
  });

  fastify.patch('/reminders/:id', async (request, reply) => {
    const body = validateOrThrow(
      z.object({
        status: z.enum(['pending', 'sent', 'snoozed', 'cancelled']).optional(),
        remind_at: z.coerce.number().int().optional(),
      }),
      request.body,
      reply
    );
    if (!body) return;
    const row = db().prepare('SELECT owner_id FROM reminders WHERE id = ?').get(request.params.id);
    if (!row || row.owner_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Напоминание не найдено');
    const set = [];
    const vals = [];
    if (body.status) { set.push('status = ?'); vals.push(body.status); }
    if (body.remind_at) { set.push('remind_at = ?'); vals.push(body.remind_at); }
    if (!set.length) return sendError(reply, 400, 'validation_error', 'Нет полей');
    db().prepare(`UPDATE reminders SET ${set.join(', ')} WHERE id = ?`).run(...vals, request.params.id);
    reply.send(db().prepare('SELECT * FROM reminders WHERE id = ?').get(request.params.id));
  });

  fastify.delete('/reminders/:id', async (request, reply) => {
    const row = db().prepare('SELECT owner_id FROM reminders WHERE id = ?').get(request.params.id);
    if (!row || row.owner_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Напоминание не найдено');
    db().prepare('DELETE FROM reminders WHERE id = ?').run(request.params.id);
    reply.send({ ok: true });
  });
}
