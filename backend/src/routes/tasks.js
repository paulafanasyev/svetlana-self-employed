/**
 * Tasks + subtasks (§15, §32). Includes the "overdue" view used by Светлана's
 * proactive engine (§33) and an aggregate board.
 */
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { auditRequest } from '../plugins/audit.js';
import { sendError, validateOrThrow } from '../lib/http.js';
import { crudPlugin } from '../lib/crud.js';

const taskBase = {
  project_id: z.string().nullable().optional(),
  assignee_id: z.string().nullable().optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(8000).nullable().optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  due_at: z.coerce.number().int().nullable().optional(),
  position: z.coerce.number().int().optional(),
};

export default async function taskRoutes(fastify) {
  // The crudPlugin registers its own preValidation hook *inside its scope*, so
  // sibling routes below (subtasks, /overdue/all) must require auth explicitly
  // — otherwise request.user is null and they 500 instead of 401.
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });

  await fastify.register(
    crudPlugin({
      table: 'tasks',
      columns: ['project_id', 'assignee_id', 'title', 'description', 'status', 'priority', 'due_at', 'position'],
      createSchema: z.object(taskBase),
      updateSchema: z.object(Object.fromEntries(Object.entries(taskBase).map(([k, v]) => [k, v.optional()]))),
      search: ['title', 'description'],
      order: 'position ASC, created_at DESC',
      afterUpdate: async (_f, request, row) => {
        if (row.status === 'done' && !row.completed_at) {
          db().prepare('UPDATE tasks SET completed_at = unixepoch() WHERE id = ?').run(row.id);
        }
        if (row.status !== 'done') {
          db().prepare('UPDATE tasks SET completed_at = NULL WHERE id = ?').run(row.id);
        }
      },
    })
  );

  // Subtasks
  fastify.get('/:id/subtasks', async (request, reply) => {
    const task = db().prepare('SELECT owner_id FROM tasks WHERE id = ?').get(request.params.id);
    if (!task || task.owner_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Задача не найдена');
    const rows = db()
      .prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY position ASC, created_at')
      .all(request.params.id);
    reply.send({ data: rows });
  });

  fastify.post('/:id/subtasks', async (request, reply) => {
    const task = db().prepare('SELECT owner_id FROM tasks WHERE id = ?').get(request.params.id);
    if (!task || task.owner_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Задача не найдена');
    const body = validateOrThrow(
      z.object({ title: z.string().min(1).max(300), position: z.coerce.number().int().optional() }),
      request.body,
      reply
    );
    if (!body) return;
    const id = nanoid();
    db()
      .prepare('INSERT INTO subtasks (id, task_id, title, position) VALUES (?, ?, ?, ?)')
      .run(id, request.params.id, body.title, body.position ?? 0);
    const row = db().prepare('SELECT * FROM subtasks WHERE id = ?').get(id);
    auditRequest(request, 'create', 'subtask', id, { task_id: request.params.id });
    reply.code(201).send(row);
  });

  fastify.patch('/:id/subtasks/:subId', async (request, reply) => {
    const task = db().prepare('SELECT owner_id FROM tasks WHERE id = ?').get(request.params.id);
    if (!task || task.owner_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Задача не найдена');
    const body = validateOrThrow(
      z.object({ title: z.string().min(1).max(300).optional(), done: z.boolean().optional(), position: z.coerce.number().int().optional() }),
      request.body,
      reply
    );
    if (!body) return;
    const set = [];
    const vals = [];
    if (body.title !== undefined) { set.push('title = ?'); vals.push(body.title); }
    if (body.done !== undefined) { set.push('done = ?'); vals.push(body.done ? 1 : 0); }
    if (body.position !== undefined) { set.push('position = ?'); vals.push(body.position); }
    if (!set.length) return sendError(reply, 400, 'validation_error', 'Нет полей для обновления');
    db().prepare(`UPDATE subtasks SET ${set.join(', ')} WHERE id = ? AND task_id = ?`).run(...vals, request.params.subId, request.params.id);
    const row = db().prepare('SELECT * FROM subtasks WHERE id = ?').get(request.params.subId);
    reply.send(row);
  });

  fastify.delete('/:id/subtasks/:subId', async (request, reply) => {
    const task = db().prepare('SELECT owner_id FROM tasks WHERE id = ?').get(request.params.id);
    if (!task || task.owner_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Задача не найдена');
    db().prepare('DELETE FROM subtasks WHERE id = ? AND task_id = ?').run(request.params.subId, request.params.id);
    reply.send({ ok: true });
  });

  // Overdue tasks — used by Светлана's proactive engine (§33) and the dashboard.
  fastify.get('/overdue/all', async (request, reply) => {
    const rows = db()
      .prepare(`SELECT * FROM tasks
                WHERE owner_id = ? AND status NOT IN ('done','cancelled')
                  AND due_at IS NOT NULL AND due_at < unixepoch()
                ORDER BY due_at ASC`)
      .all(request.user.id);
    reply.send({ data: rows, count: rows.length });
  });
}
