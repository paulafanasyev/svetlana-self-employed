/**
 * Vacancies + candidates (§22). Public board, employer-scoped management,
 * candidate pipeline, and AI matching against the applicant's profile.
 */
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { auditRequest } from '../plugins/audit.js';
import { sendError, validateOrThrow, readJson, writeJson } from '../lib/http.js';
import { paginationSchema } from '../lib/http.js';

const vacancyBase = {
  title: z.string().min(3).max(300),
  description: z.string().max(8000).optional(),
  salary_from: z.coerce.number().int().min(0).nullable().optional(),
  salary_to: z.coerce.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).default('RUB'),
  city: z.string().max(120).optional(),
  remote: z.boolean().optional(),
  skills: z.array(z.string().max(80)).max(30).optional(),
  status: z.enum(['active', 'closed', 'draft']).optional(),
};

export default async function vacancyRoutes(fastify) {
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });

  fastify.get('/', async (request, reply) => {
    const { limit, offset } = paginationSchema.parse(request.query ?? {});
    const q = String(request.query?.q ?? '').trim();
    let sql = `SELECT v.* FROM vacancies v
               WHERE v.status = 'active'`;
    const params = [];
    if (q) { sql += ' AND (v.title LIKE ? OR v.description LIKE ? OR v.city LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    sql += ' ORDER BY v.created_at DESC LIMIT ? OFFSET ?';
    const rows = db().prepare(sql).all(...params, limit, offset);
    return { data: rows.map((r) => ({ ...r, skills: readJson(r.skills_json, []) })), limit, offset };
  });

  fastify.get('/mine', async (request, reply) => {
    const rows = db()
      .prepare('SELECT * FROM vacancies WHERE employer_id = ? ORDER BY created_at DESC')
      .all(request.user.id);
    return { data: rows.map((r) => ({ ...r, skills: readJson(r.skills_json, []) })) };
  });

  fastify.get('/:id', async (request, reply) => {
    const row = db()
      .prepare('SELECT * FROM vacancies WHERE id = ?')
      .get(request.params.id);
    if (!row) return sendError(reply, 404, 'not_found', 'Вакансия не найдена');
    return { ...row, skills: readJson(row.skills_json, []) };
  });

  fastify.post('/', async (request, reply) => {
    const body = validateOrThrow(z.object(vacancyBase), request.body, reply);
    if (!body) return;
    const id = nanoid();
    db()
      .prepare(`INSERT INTO vacancies (id, employer_id, title, description, salary_from, salary_to, currency,
                                       city, remote, skills_json, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, request.user.id, body.title, body.description ?? null, body.salary_from ?? null, body.salary_to ?? null,
        body.currency, body.city ?? null, body.remote ? 1 : 0, writeJson(body.skills ?? []), body.status ?? 'active');
    auditRequest(request, 'create', 'vacancy', id, { title: body.title });
    reply.code(201).send(db().prepare('SELECT * FROM vacancies WHERE id = ?').get(id));
  });

  fastify.patch('/:id', async (request, reply) => {
    const row = db().prepare('SELECT employer_id FROM vacancies WHERE id = ?').get(request.params.id);
    if (!row || row.employer_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Вакансия не найдена');
    const body = validateOrThrow(z.object(Object.fromEntries(Object.entries(vacancyBase).map(([k, v]) => [k, v.optional()]))), request.body ?? {}, reply);
    if (!body) return;
    const set = ['updated_at = unixepoch()'];
    const vals = [];
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k === 'skills') { set.push('skills_json = ?'); vals.push(writeJson(v)); }
      else if (k === 'remote') { set.push('remote = ?'); vals.push(v ? 1 : 0); }
      else { set.push(`${k} = ?`); vals.push(v); }
    }
    db().prepare(`UPDATE vacancies SET ${set.join(', ')} WHERE id = ?`).run(...vals, request.params.id);
    reply.send(db().prepare('SELECT * FROM vacancies WHERE id = ?').get(request.params.id));
  });

  fastify.delete('/:id', async (request, reply) => {
    const row = db().prepare('SELECT employer_id FROM vacancies WHERE id = ?').get(request.params.id);
    if (!row || row.employer_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Вакансия не найдена');
    db().prepare('DELETE FROM vacancies WHERE id = ?').run(request.params.id);
    reply.send({ ok: true });
  });

  // ---------- Candidates ----------
  fastify.post('/:id/apply', async (request, reply) => {
    const vacancy = db().prepare('SELECT * FROM vacancies WHERE id = ?').get(request.params.id);
    if (!vacancy || vacancy.status !== 'active') return sendError(reply, 404, 'not_found', 'Вакансия не найдена');
    if (vacancy.employer_id === request.user.id) return sendError(reply, 400, 'validation_error', 'Нельзя откликнуться на свою вакансию');
    const dup = db()
      .prepare('SELECT id FROM candidates WHERE vacancy_id = ? AND user_id = ?')
      .get(request.params.id, request.user.id);
    if (dup) return sendError(reply, 409, 'conflict', 'Вы уже откликнулись');
    const body = validateOrThrow(z.object({ resume: z.string().max(10000).optional() }), request.body ?? {}, reply);
    if (!body) return;
    const id = nanoid();
    db()
      .prepare('INSERT INTO candidates (id, user_id, vacancy_id, resume) VALUES (?, ?, ?, ?)')
      .run(id, request.user.id, request.params.id, body.resume ?? null);
    auditRequest(request, 'apply', 'candidate', id, { vacancy_id: request.params.id });
    reply.code(201).send(db().prepare('SELECT * FROM candidates WHERE id = ?').get(id));
  });

  fastify.get('/:id/candidates', async (request, reply) => {
    const vacancy = db().prepare('SELECT employer_id, skills_json FROM vacancies WHERE id = ?').get(request.params.id);
    if (!vacancy || vacancy.employer_id !== request.user.id) {
      return sendError(reply, 403, 'forbidden', 'Доступно работодателю');
    }
    const wanted = readJson(vacancy.skills_json, []);
    const rows = db()
      .prepare(`SELECT c.*, u.email AS candidate_email,
                (SELECT group_concat(s.name) FROM profile_skills ps
                 JOIN skills s ON s.id = ps.skill_id
                 JOIN profiles p ON p.id = ps.profile_id
                 WHERE p.user_id = c.user_id) AS skills
                FROM candidates c JOIN users u ON u.id = c.user_id
                WHERE c.vacancy_id = ? ORDER BY c.created_at DESC`)
      .all(request.params.id);
    const scored = rows.map((r) => {
      const have = String(r.skills ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const hits = wanted.filter((w) => have.includes(String(w).toLowerCase())).length;
      return { ...r, match_score: wanted.length ? Math.round((hits / wanted.length) * 100) : 0 };
    });
    return { data: scored.sort((a, b) => b.match_score - a.match_score) };
  });

  fastify.patch('/:id/candidates/:candId', async (request, reply) => {
    const vacancy = db().prepare('SELECT employer_id FROM vacancies WHERE id = ?').get(request.params.id);
    if (!vacancy || vacancy.employer_id !== request.user.id) {
      return sendError(reply, 403, 'forbidden', 'Доступно работодателю');
    }
    const body = validateOrThrow(
      z.object({ status: z.enum(['applied', 'screening', 'interview', 'offered', 'hired', 'rejected']) }),
      request.body ?? {},
      reply
    );
    if (!body) return;
    db().prepare('UPDATE candidates SET status = ? WHERE id = ? AND vacancy_id = ?').run(body.status, request.params.candId, request.params.id);
    auditRequest(request, 'candidate_status', 'candidate', request.params.candId, body);
    reply.send(db().prepare('SELECT * FROM candidates WHERE id = ?').get(request.params.candId));
  });
}
