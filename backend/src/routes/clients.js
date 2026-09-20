/**
 * Clients (§15). Person or company, with contacts, tags, notes.
 */
import { z } from 'zod';
import { crudPlugin } from '../lib/crud.js';
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { sendError } from '../lib/http.js';

const base = {
  type: z.enum(['person', 'company']).default('person'),
  name: z.string().min(1).max(200),
  company_id: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  position: z.string().max(120).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  source: z.string().max(60).nullable().optional(),
  status: z.enum(['lead', 'active', 'paused', 'archived', 'lost']).optional(),
  tags: z.array(z.string().max(60)).max(30).optional(),
  notes: z.string().max(8000).nullable().optional(),
};

const createSchema = z.object(base);
const updateSchema = z.object(
  Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v.optional()]))
);

async function saveTags(request, clientId, tags) {
  const existing = db().prepare('SELECT tags FROM clients WHERE id = ?').get(clientId);
  const merged = Array.from(new Set([...(existing?.tags ? JSON.parse(existing.tags) : []), ...(tags ?? [])]));
  db().prepare('UPDATE clients SET tags = ? WHERE id = ?').run(JSON.stringify(merged), clientId);
}

export default async function clientRoutes(fastify) {
  // The crudPlugin registers its own preValidation hook *inside its scope*, so
  // sibling routes below (contacts, tags, subtasks, …) must require auth
  // explicitly — otherwise request.user is null and they 500 (and would be
  // effectively unauthenticated, an IDOR hole).
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });
  await fastify.register(
    crudPlugin({
      table: 'clients',
      columns: ['type', 'name', 'company_id', 'email', 'phone', 'position', 'city', 'source', 'status', 'tags', 'notes'],
      createSchema,
      updateSchema,
      search: ['name', 'email', 'phone', 'city', 'notes'],
      afterCreate: async (_f, request, row) => {
        if (request.body.tags) await saveTags(request, row.id, request.body.tags);
      },
    })
  );

  // Contacts for a client (§15)
  fastify.get('/:id/contacts', async (request, reply) => {
    const client = db().prepare('SELECT owner_id FROM clients WHERE id = ?').get(request.params.id);
    if (!client || client.owner_id !== request.user.id) {
      return sendError(reply, 404, 'not_found', 'Клиент не найден');
    }
    const rows = db()
      .prepare('SELECT * FROM contacts WHERE client_id = ? ORDER BY is_primary DESC, created_at')
      .all(request.params.id);
    reply.send({ data: rows });
  });

  fastify.post('/:id/contacts', async (request, reply) => {
    const client = db().prepare('SELECT owner_id FROM clients WHERE id = ?').get(request.params.id);
    if (!client || client.owner_id !== request.user.id) {
      return sendError(reply, 404, 'not_found', 'Клиент не найден');
    }
    const body = z
      .object({
        name: z.string().min(1).max(200),
        role: z.string().max(120).nullable().optional(),
        email: z.string().email().nullable().optional(),
        phone: z.string().max(40).nullable().optional(),
        is_primary: z.boolean().optional(),
      })
      .safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'validation_error', 'Некорректные данные', body.error.flatten());
    const id = nanoid();
    db()
      .prepare('INSERT INTO contacts (id, client_id, name, role, email, phone, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, request.params.id, body.data.name, body.data.role ?? null, body.data.email ?? null, body.data.phone ?? null, body.data.is_primary ? 1 : 0);
    const row = db().prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    reply.code(201).send(row);
  });

  fastify.delete('/:id/contacts/:contactId', async (request, reply) => {
    const client = db().prepare('SELECT owner_id FROM clients WHERE id = ?').get(request.params.id);
    if (!client || client.owner_id !== request.user.id) {
      return sendError(reply, 404, 'not_found', 'Клиент не найден');
    }
    db().prepare('DELETE FROM contacts WHERE id = ? AND client_id = ?').run(request.params.contactId, request.params.id);
    reply.send({ ok: true });
  });

  // Tags managed as a set (add/remove)
  fastify.post('/:id/tags', async (request, reply) => {
    const body = z.object({ tags: z.array(z.string().min(1).max(60)).max(30) }).safeParse(request.body);
    if (!body.success) return sendError(reply, 400, 'validation_error', 'tags required');
    const client = db().prepare('SELECT owner_id, tags FROM clients WHERE id = ?').get(request.params.id);
    if (!client || client.owner_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Клиент не найден');
    await saveTags(request, request.params.id, body.data.tags);
    const row = db().prepare('SELECT id, tags FROM clients WHERE id = ?').get(request.params.id);
    reply.send(row);
  });

  fastify.delete('/:id/tags/:tag', async (request, reply) => {
    const client = db().prepare('SELECT owner_id, tags FROM clients WHERE id = ?').get(request.params.id);
    if (!client || client.owner_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Клиент не найден');
    const tags = readClientTags(client.tags).filter((t) => t !== request.params.tag);
    db().prepare('UPDATE clients SET tags = ? WHERE id = ?').run(JSON.stringify(tags), request.params.id);
    reply.send({ id: request.params.id, tags });
  });
}

function readClientTags(raw) {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
