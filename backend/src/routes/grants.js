/**
 * Grants / subsidies / government programs (§18, §19).
 *
 * Every program carries full provenance: source, publication/effective/
 * retrieved dates, URL and version (§18 — mutable legal facts are never stored
 * as bare text). Personalization filters by region and user profile.
 */
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { auditRequest } from '../plugins/audit.js';
import { sendError, validateOrThrow } from '../lib/http.js';
import { paginationSchema } from '../lib/http.js';

const KINDS = ['grant', 'subsidy', 'social_contract', 'loan', 'training', 'compensation'];

const programBase = {
  kind: z.enum(KINDS),
  title: z.string().min(3).max(300),
  description: z.string().max(8000).optional(),
  funder: z.string().max(120).optional(),
  region: z.string().max(120).optional(),
  amount_min: z.coerce.number().int().min(0).nullable().optional(),
  amount_max: z.coerce.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).default('RUB'),
  url: z.string().url(),
  doc_url: z.string().url().nullable().optional(),
  source_name: z.string().min(2).max(200),
  published_at: z.coerce.number().int().nullable().optional(),
  effective_at: z.coerce.number().int().nullable().optional(),
  is_active: z.boolean().optional(),
};

export default async function grantRoutes(fastify) {
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });

  fastify.get('/', async (request, reply) => {
    const { limit, offset } = paginationSchema.parse(request.query ?? {});
    const kind = String(request.query?.kind ?? '');
    const region = String(request.query?.region ?? '');
    const q = String(request.query?.q ?? '').trim();
    let sql = 'SELECT * FROM government_programs WHERE is_active = 1';
    const params = [];
    if (kind && KINDS.includes(kind)) { sql += ' AND kind = ?'; params.push(kind); }
    if (region) { sql += ' AND (region = ? OR funder = ?)'; params.push(region, region); }
    if (q) { sql += ' AND (title LIKE ? OR description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    const rows = db().prepare(sql).all(...params, limit, offset);
    return { data: rows, limit, offset };
  });

  fastify.get('/personalized', async (request, reply) => {
    const profile = db().prepare('SELECT * FROM profiles WHERE user_id = ?').get(request.user.id);
    const region = profile?.city ? [profile.city] : [];
    const rows = db()
      .prepare(`SELECT * FROM government_programs WHERE is_active = 1
                ORDER BY (region = ?) DESC, (funder = 'Федеральный') DESC, updated_at DESC LIMIT 20`)
      .all(profile?.city ?? '');
    void region;
    return { data: rows, matched_region: profile?.city ?? null };
  });

  fastify.get('/:id', async (request, reply) => {
    const row = db().prepare('SELECT * FROM government_programs WHERE id = ?').get(request.params.id);
    if (!row) return sendError(reply, 404, 'not_found', 'Программа не найдена');
    return row;
  });

  // Adding a program REQUIRES a source URL + name (§18/§27: no invented facts).
  fastify.post('/', async (request, reply) => {
    if (request.user.role !== 'admin') {
      return sendError(reply, 403, 'forbidden', 'Только администратор может добавлять государственные программы');
    }
    const body = validateOrThrow(z.object(programBase), request.body, reply);
    if (!body) return;
    const id = nanoid();
    db()
      .prepare(`INSERT INTO government_programs (id, kind, title, description, funder, region, amount_min, amount_max,
                                                  currency, url, doc_url, source_name, published_at, effective_at,
                                                  retrieved_at, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), ?)`)
      .run(id, body.kind, body.title, body.description ?? null, body.funder ?? null, body.region ?? null,
        body.amount_min ?? null, body.amount_max ?? null, body.currency, body.url, body.doc_url ?? null,
        body.source_name, body.published_at ?? null, body.effective_at ?? null, body.is_active === false ? 0 : 1);
    auditRequest(request, 'create', 'government_program', id, { title: body.title, source: body.source_name });
    reply.code(201).send(db().prepare('SELECT * FROM government_programs WHERE id = ?').get(id));
  });

  fastify.patch('/:id', async (request, reply) => {
    if (request.user.role !== 'admin') {
      return sendError(reply, 403, 'forbidden', 'Только администратор может изменять государственные программы');
    }
    const row = db().prepare('SELECT * FROM government_programs WHERE id = ?').get(request.params.id);
    if (!row) return sendError(reply, 404, 'not_found', 'Программа не найдена');
    const body = validateOrThrow(z.object(Object.fromEntries(Object.entries(programBase).map(([k, v]) => [k, v.optional()]))), request.body ?? {}, reply);
    if (!body) return;
    const set = ['updated_at = unixepoch()'];
    const vals = [];
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k === 'is_active') { set.push('is_active = ?'); vals.push(v ? 1 : 0); }
      else { set.push(`${k} = ?`); vals.push(v); }
    }
    db().prepare(`UPDATE government_programs SET ${set.join(', ')} WHERE id = ?`).run(...vals, request.params.id);
    reply.send(db().prepare('SELECT * FROM government_programs WHERE id = ?').get(request.params.id));
  });

  fastify.delete('/:id', async (request, reply) => {
    if (request.user.role !== 'admin') {
      return sendError(reply, 403, 'forbidden', 'Только администратор может удалять программы');
    }
    db().prepare('UPDATE government_programs SET is_active = 0 WHERE id = ?').run(request.params.id);
    reply.send({ ok: true });
  });
}
