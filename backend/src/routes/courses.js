/**
 * Educational marketplace (§24): courses, consultations, webinars,
 * master-classes, materials. Enrollments track progress + certificates.
 *
 * Purchase flow: create order → pay (payments route applies commission) →
 * enrollment auto-created on payment success.
 */
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { auditRequest } from '../plugins/audit.js';
import { sendError, validateOrThrow } from '../lib/http.js';
import { paginationSchema } from '../lib/http.js';

const courseBase = {
  title: z.string().min(3).max(300),
  description: z.string().max(8000).optional(),
  price: z.coerce.number().int().min(0).default(0),
  currency: z.string().length(3).default('RUB'),
  format: z.enum(['course', 'consultation', 'webinar', 'masterclass', 'materials']).default('course'),
  duration_hours: z.coerce.number().int().min(0).nullable().optional(),
  is_published: z.boolean().optional(),
};

export default async function courseRoutes(fastify) {
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });

  fastify.get('/', async (request, reply) => {
    const { limit, offset } = paginationSchema.parse(request.query ?? {});
    const format = String(request.query?.format ?? '');
    const q = String(request.query?.q ?? '').trim();
    let sql = `SELECT c.*, u.email AS author_email FROM courses c JOIN users u ON u.id = c.author_id
               WHERE c.is_published = 1`;
    const params = [];
    if (format) { sql += ' AND c.format = ?'; params.push(format); }
    if (q) { sql += ' AND (c.title LIKE ? OR c.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    sql += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
    const rows = db().prepare(sql).all(...params, limit, offset);
    return { data: rows, limit, offset };
  });

  fastify.get('/mine', async (request, reply) => {
    const rows = db()
      .prepare('SELECT * FROM courses WHERE author_id = ? ORDER BY created_at DESC')
      .all(request.user.id);
    return { data: rows };
  });

  fastify.get('/:id', async (request, reply) => {
    const row = db()
      .prepare(`SELECT c.*, u.email AS author_email FROM courses c JOIN users u ON u.id = c.author_id
                WHERE c.id = ?`)
      .get(request.params.id);
    if (!row || (!row.is_published && row.author_id !== request.user.id)) {
      return sendError(reply, 404, 'not_found', 'Курс не найден');
    }
    const enrolled = db()
      .prepare('SELECT id, progress, status FROM enrollments WHERE user_id = ? AND course_id = ?')
      .get(request.user.id, request.params.id);
    return { ...row, enrollment: enrolled ?? null };
  });

  fastify.post('/', async (request, reply) => {
    const body = validateOrThrow(z.object(courseBase), request.body, reply);
    if (!body) return;
    const authorKind = request.user.role === 'training_center' ? 'training_center' : 'expert';
    const id = nanoid();
    db()
      .prepare(`INSERT INTO courses (id, author_id, author_kind, title, description, price, currency, format,
                                     duration_hours, is_published)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, request.user.id, authorKind, body.title, body.description ?? null, body.price, body.currency,
        body.format, body.duration_hours ?? null, body.is_published ? 1 : 0);
    auditRequest(request, 'create', 'course', id, { title: body.title });
    reply.code(201).send(db().prepare('SELECT * FROM courses WHERE id = ?').get(id));
  });

  fastify.patch('/:id', async (request, reply) => {
    const row = db().prepare('SELECT author_id FROM courses WHERE id = ?').get(request.params.id);
    if (!row || row.author_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Курс не найден');
    const body = validateOrThrow(z.object(Object.fromEntries(Object.entries(courseBase).map(([k, v]) => [k, v.optional()]))), request.body ?? {}, reply);
    if (!body) return;
    const set = ['updated_at = unixepoch()'];
    const vals = [];
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k === 'is_published') { set.push('is_published = ?'); vals.push(v ? 1 : 0); }
      else { set.push(`${k} = ?`); vals.push(v); }
    }
    db().prepare(`UPDATE courses SET ${set.join(', ')} WHERE id = ?`).run(...vals, request.params.id);
    reply.send(db().prepare('SELECT * FROM courses WHERE id = ?').get(request.params.id));
  });

  fastify.delete('/:id', async (request, reply) => {
    const row = db().prepare('SELECT author_id FROM courses WHERE id = ?').get(request.params.id);
    if (!row || row.author_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Курс не найден');
    db().prepare('DELETE FROM courses WHERE id = ?').run(request.params.id);
    reply.send({ ok: true });
  });

  // ---------- Enroll (free or via order) ----------
  fastify.post('/:id/enroll', async (request, reply) => {
    const course = db().prepare('SELECT * FROM courses WHERE id = ? AND is_published = 1').get(request.params.id);
    if (!course) return sendError(reply, 404, 'not_found', 'Курс не найден');
    const existing = db()
      .prepare('SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?')
      .get(request.user.id, request.params.id);
    if (existing) return sendError(reply, 409, 'conflict', 'Вы уже записаны');

    const id = nanoid();
    if (course.price > 0) {
      // Paid course: create an order; the enrollment opens when payment lands.
      const orderId = nanoid();
      const commissionRate = (await import('../payments/commission.js')).getCommissionPercent();
      db().transaction(() => {
        db()
          .prepare(`INSERT INTO orders (id, buyer_id, seller_id, amount, currency, status, commission_rate)
                    VALUES (?, ?, ?, ?, ?, 'created', ?)`)
          .run(orderId, request.user.id, course.author_id, course.price, course.currency, commissionRate);
        db()
          .prepare(`INSERT INTO enrollments (id, user_id, course_id, order_id, status) VALUES (?, ?, ?, ?, 'active')`)
          .run(id, request.user.id, course.id, orderId);
      });
      auditRequest(request, 'enroll_pending_payment', 'enrollment', id, { order_id: orderId });
      return reply.code(201).send({ enrollment_id: id, order_id: orderId, requires_payment: true });
    }
    db()
      .prepare('INSERT INTO enrollments (id, user_id, course_id, status) VALUES (?, ?, ?, ?)')
      .run(id, request.user.id, course.id, 'active');
    auditRequest(request, 'enroll', 'enrollment', id, { course_id: course.id });
    reply.code(201).send({ enrollment_id: id, requires_payment: false });
  });

  fastify.get('/enrollments/mine', async (request, reply) => {
    const rows = db()
      .prepare(`SELECT e.*, c.title AS course_title, c.format, c.author_id FROM enrollments e
                JOIN courses c ON c.id = e.course_id
                WHERE e.user_id = ? ORDER BY e.created_at DESC`)
      .all(request.user.id);
    return { data: rows };
  });

  fastify.patch('/enrollments/:id/progress', async (request, reply) => {
    const body = validateOrThrow(
      z.object({ progress: z.coerce.number().int().min(0).max(100) }),
      request.body ?? {},
      reply
    );
    if (!body) return;
    const row = db().prepare('SELECT user_id, progress FROM enrollments WHERE id = ?').get(request.params.id);
    if (!row || row.user_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Запись не найдена');
    const completed = body.progress >= 100 ? 1 : 0;
    db()
      .prepare('UPDATE enrollments SET progress = ?, certificate_issued = ?, status = ? WHERE id = ?')
      .run(body.progress, completed, completed ? 'completed' : 'active', request.params.id);
    reply.send(db().prepare('SELECT * FROM enrollments WHERE id = ?').get(request.params.id));
  });

  // ---------- Experts / training centers (public profiles) ----------
  fastify.get('/experts', async (request, reply) => {
    const rows = db()
      .prepare(`SELECT e.*, u.email FROM experts e JOIN users u ON u.id = e.user_id
                ORDER BY e.is_verified DESC, e.created_at DESC LIMIT 50`)
      .all();
    return { data: rows };
  });

  fastify.post('/experts', async (request, reply) => {
    const existing = db().prepare('SELECT id FROM experts WHERE user_id = ?').get(request.user.id);
    if (existing) return sendError(reply, 409, 'conflict', 'Профиль эксперта уже существует');
    const body = validateOrThrow(
      z.object({ display_name: z.string().min(2).max(120), bio: z.string().max(4000).optional() }),
      request.body ?? {},
      reply
    );
    if (!body) return;
    const id = nanoid();
    db()
      .prepare('INSERT INTO experts (id, user_id, display_name, bio) VALUES (?, ?, ?, ?)')
      .run(id, request.user.id, body.display_name, body.bio ?? null);
    reply.code(201).send(db().prepare('SELECT * FROM experts WHERE id = ?').get(id));
  });
}
