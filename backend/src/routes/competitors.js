/**
 * Competitor intelligence (§27). Only observed, sourced facts: every
 * observation requires a source_url, so invented data cannot be stored.
 */
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { auditRequest } from '../plugins/audit.js';
import { sendError, validateOrThrow } from '../lib/http.js';
import { crudPlugin } from '../lib/crud.js';

const competitorBase = {
  name: z.string().min(1).max(200),
  website: z.string().url().nullable().or(z.literal('')).optional(),
  position: z.string().max(300).optional(),
  notes: z.string().max(8000).optional(),
};

export default async function competitorRoutes(fastify) {
  // The crudPlugin registers its own preValidation hook *inside its scope*, so
  // sibling routes below (contacts, tags, subtasks, …) must require auth
  // explicitly — otherwise request.user is null and they 500 (and would be
  // effectively unauthenticated, an IDOR hole).
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });
  await fastify.register(
    crudPlugin({
      table: 'competitors',
      columns: ['name', 'website', 'position', 'notes'],
      createSchema: z.object(competitorBase),
      updateSchema: z.object(Object.fromEntries(Object.entries(competitorBase).map(([k, v]) => [k, v.optional()]))),
      search: ['name', 'position', 'notes'],
    })
  );

  fastify.get('/:id/observations', async (request, reply) => {
    const row = db().prepare('SELECT owner_id FROM competitors WHERE id = ?').get(request.params.id);
    if (!row || row.owner_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Конкурент не найден');
    const rows = db()
      .prepare('SELECT * FROM competitor_observations WHERE competitor_id = ? ORDER BY observed_at DESC')
      .all(request.params.id);
    return { data: rows };
  });

  // An observation without a source URL is refused (§27).
  fastify.post('/:id/observations', async (request, reply) => {
    const row = db().prepare('SELECT owner_id FROM competitors WHERE id = ?').get(request.params.id);
    if (!row || row.owner_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Конкурент не найден');
    const body = validateOrThrow(
      z.object({
        aspect: z.enum(['service', 'price', 'review', 'content', 'seo', 'positioning', 'activity', 'other']),
        value: z.string().min(1).max(2000),
        observed_at: z.coerce.number().int().optional(),
        source_url: z.string().url(),
      }),
      request.body,
      reply
    );
    if (!body) return;
    const id = nanoid();
    db()
      .prepare(`INSERT INTO competitor_observations (id, competitor_id, aspect, value, observed_at, source_url)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, request.params.id, body.aspect, body.value, body.observed_at ?? Math.floor(Date.now() / 1000), body.source_url);
    auditRequest(request, 'create', 'competitor_observation', id, { competitor_id: request.params.id, aspect: body.aspect });
    reply.code(201).send(db().prepare('SELECT * FROM competitor_observations WHERE id = ?').get(id));
  });

  fastify.delete('/:id/observations/:obsId', async (request, reply) => {
    const row = db().prepare('SELECT owner_id FROM competitors WHERE id = ?').get(request.params.id);
    if (!row || row.owner_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Конкурент не найден');
    db()
      .prepare('DELETE FROM competitor_observations WHERE id = ? AND competitor_id = ?')
      .run(request.params.obsId, request.params.id);
    reply.send({ ok: true });
  });
}
