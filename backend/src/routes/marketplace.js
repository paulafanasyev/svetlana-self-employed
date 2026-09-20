/**
 * Marketplace (§21): customer posts a project, specialists apply.
 * Also: services/products catalog, orders, reviews, AI matching score.
 */
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { auditRequest } from '../plugins/audit.js';
import { sendError, validateOrThrow, readJson, writeJson } from '../lib/http.js';
import { paginationSchema } from '../lib/http.js';
import { getCommissionPercent } from '../payments/commission.js';

export default async function marketplaceRoutes(fastify) {
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });

  // ---------- Public project board ----------
  fastify.get('/projects', async (request, reply) => {
    const { limit, offset } = paginationSchema.parse(request.query ?? {});
    const status = String(request.query?.status ?? 'open');
    const category = String(request.query?.category ?? '');
    const q = String(request.query?.q ?? '').trim();
    let sql = `SELECT m.*, u.email AS customer_email,
               (SELECT COUNT(*) FROM applications a WHERE a.project_id = m.id) AS applications_count
               FROM marketplace_projects m JOIN users u ON u.id = m.customer_id
               WHERE m.status = ?`;
    const params = [status];
    if (category) { sql += ' AND m.category = ?'; params.push(category); }
    if (q) { sql += ' AND (m.title LIKE ? OR m.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    sql += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
    const rows = db().prepare(sql).all(...params, limit, offset);
    return { data: rows.map((r) => ({ ...r, skills: readJson(r.skills_json, []) })), limit, offset };
  });

  fastify.get('/projects/:id', async (request, reply) => {
    const row = db()
      .prepare(`SELECT m.*, u.email AS customer_email
                FROM marketplace_projects m JOIN users u ON u.id = m.customer_id
                WHERE m.id = ?`)
      .get(request.params.id);
    if (!row) return sendError(reply, 404, 'not_found', 'Проект не найден');
    const apps = db()
      .prepare(`SELECT a.*, u.email AS specialist_email FROM applications a
                JOIN users u ON u.id = a.specialist_id WHERE a.project_id = ? ORDER BY a.created_at`)
      .all(request.params.id);
    return { ...row, skills: readJson(row.skills_json, []), applications: apps };
  });

  fastify.post('/projects', async (request, reply) => {
    const body = validateOrThrow(
      z.object({
        title: z.string().min(5).max(300),
        description: z.string().min(20).max(8000),
        budget_min: z.coerce.number().int().min(0).nullable().optional(),
        budget_max: z.coerce.number().int().min(0).nullable().optional(),
        currency: z.string().length(3).default('RUB'),
        category: z.string().max(80).optional(),
        skills: z.array(z.string().max(80)).max(30).optional(),
        deadline: z.coerce.number().int().nullable().optional(),
      }),
      request.body,
      reply
    );
    if (!body) return;
    const id = nanoid();
    db()
      .prepare(`INSERT INTO marketplace_projects (id, customer_id, title, description, budget_min, budget_max,
                                                   currency, category, skills_json, deadline)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, request.user.id, body.title, body.description, body.budget_min ?? null, body.budget_max ?? null,
        body.currency, body.category ?? null, writeJson(body.skills ?? []), body.deadline ?? null);
    auditRequest(request, 'create', 'marketplace_project', id, { title: body.title });
    reply.code(201).send(db().prepare('SELECT * FROM marketplace_projects WHERE id = ?').get(id));
  });

  fastify.patch('/projects/:id', async (request, reply) => {
    const row = db().prepare('SELECT * FROM marketplace_projects WHERE id = ?').get(request.params.id);
    if (!row || row.customer_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Проект не найден');
    const body = validateOrThrow(
      z.object({
        title: z.string().min(5).max(300).optional(),
        description: z.string().min(20).max(8000).optional(),
        status: z.enum(['open', 'in_progress', 'closed', 'cancelled']).optional(),
        budget_min: z.coerce.number().int().min(0).nullable().optional(),
        budget_max: z.coerce.number().int().min(0).nullable().optional(),
      }),
      request.body ?? {},
      reply
    );
    if (!body) return;
    const set = [];
    const vals = [];
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) { set.push(`${k} = ?`); vals.push(v); }
    }
    if (set.length) {
      set.push('updated_at = unixepoch()');
      db().prepare(`UPDATE marketplace_projects SET ${set.join(', ')} WHERE id = ?`).run(...vals, request.params.id);
    }
    reply.send(db().prepare('SELECT * FROM marketplace_projects WHERE id = ?').get(request.params.id));
  });

  // ---------- Applications ----------
  fastify.post('/projects/:id/applications', async (request, reply) => {
    const project = db().prepare('SELECT * FROM marketplace_projects WHERE id = ?').get(request.params.id);
    if (!project || project.status !== 'open') {
      return sendError(reply, 404, 'not_found', 'Проект закрыт или не найден');
    }
    if (project.customer_id === request.user.id) {
      return sendError(reply, 400, 'validation_error', 'Нельзя откликнуться на свой проект');
    }
    const body = validateOrThrow(
      z.object({
        cover_letter: z.string().min(10).max(5000),
        proposed_price: z.coerce.number().int().min(0).optional(),
      }),
      request.body,
      reply
    );
    if (!body) return;
    const dup = db()
      .prepare('SELECT id FROM applications WHERE project_id = ? AND specialist_id = ?')
      .get(request.params.id, request.user.id);
    if (dup) return sendError(reply, 409, 'conflict', 'Вы уже откликнулись');
    const id = nanoid();
    db()
      .prepare(`INSERT INTO applications (id, project_id, specialist_id, cover_letter, proposed_price)
                VALUES (?, ?, ?, ?, ?)`)
      .run(id, request.params.id, request.user.id, body.cover_letter, body.proposed_price ?? null);
    auditRequest(request, 'create', 'application', id, { project_id: request.params.id });
    reply.code(201).send(db().prepare('SELECT * FROM applications WHERE id = ?').get(id));
  });

  fastify.get('/applications/mine', async (request, reply) => {
    const rows = db()
      .prepare(`SELECT a.*, m.title AS project_title, m.budget_max, m.customer_id
                FROM applications a JOIN marketplace_projects m ON m.id = a.project_id
                WHERE a.specialist_id = ? ORDER BY a.created_at DESC`)
      .all(request.user.id);
    return { data: rows };
  });

  fastify.patch('/projects/:id/applications/:appId', async (request, reply) => {
    const project = db().prepare('SELECT customer_id, status FROM marketplace_projects WHERE id = ?').get(request.params.id);
    if (!project || project.customer_id !== request.user.id) {
      return sendError(reply, 403, 'forbidden', 'Действие доступно заказчику проекта');
    }
    const body = validateOrThrow(
      z.object({ status: z.enum(['accepted', 'rejected', 'withdrawn']) }),
      request.body ?? {},
      reply
    );
    if (!body) return;
    db()
      .prepare('UPDATE applications SET status = ?, updated_at = unixepoch() WHERE id = ? AND project_id = ?')
      .run(body.status, request.params.appId, request.params.id);
    if (body.status === 'accepted') {
      db()
        .prepare("UPDATE marketplace_projects SET status = 'in_progress', updated_at = unixepoch() WHERE id = ?")
        .run(request.params.id);
    }
    auditRequest(request, 'application_decision', 'application', request.params.appId, body);
    reply.send(db().prepare('SELECT * FROM applications WHERE id = ?').get(request.params.appId));
  });

  // ---------- Services / products catalog ----------
  fastify.get('/services', async (request, reply) => {
    const { limit, offset } = paginationSchema.parse(request.query ?? {});
    const rows = db()
      .prepare(`SELECT s.*, u.email AS seller_email FROM services s JOIN users u ON u.id = s.seller_id
                WHERE s.is_published = 1 ORDER BY s.created_at DESC LIMIT ? OFFSET ?`)
      .all(limit, offset);
    return { data: rows, limit, offset };
  });

  fastify.get('/services/mine', async (request, reply) => {
    const rows = db().prepare('SELECT * FROM services WHERE seller_id = ? ORDER BY created_at DESC').all(request.user.id);
    return { data: rows };
  });

  fastify.post('/services', async (request, reply) => {
    const body = validateOrThrow(
      z.object({
        title: z.string().min(3).max(200),
        description: z.string().max(5000).optional(),
        category: z.string().max(80).optional(),
        price: z.coerce.number().int().min(0),
        currency: z.string().length(3).default('RUB'),
        unit: z.enum(['project', 'hour', 'month', 'piece']).default('project'),
        is_published: z.boolean().optional(),
      }),
      request.body,
      reply
    );
    if (!body) return;
    const id = nanoid();
    db()
      .prepare(`INSERT INTO services (id, seller_id, title, description, category, price, currency, unit, is_published)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, request.user.id, body.title, body.description ?? null, body.category ?? null, body.price,
        body.currency, body.unit, body.is_published ? 1 : 0);
    reply.code(201).send(db().prepare('SELECT * FROM services WHERE id = ?').get(id));
  });

  fastify.patch('/services/:id', async (request, reply) => {
    const row = db().prepare('SELECT * FROM services WHERE id = ?').get(request.params.id);
    if (!row || row.seller_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Услуга не найдена');
    const body = validateOrThrow(
      z.object({
        title: z.string().min(3).max(200).optional(),
        description: z.string().max(5000).optional(),
        category: z.string().max(80).optional(),
        price: z.coerce.number().int().min(0).optional(),
        is_published: z.boolean().optional(),
      }),
      request.body ?? {},
      reply
    );
    if (!body) return;
    const set = [];
    const vals = [];
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) {
        set.push(`${k} = ?`);
        vals.push(k === 'is_published' ? (v ? 1 : 0) : v);
      }
    }
    if (set.length) {
      set.push('updated_at = unixepoch()');
      db().prepare(`UPDATE services SET ${set.join(', ')} WHERE id = ?`).run(...vals, request.params.id);
    }
    reply.send(db().prepare('SELECT * FROM services WHERE id = ?').get(request.params.id));
  });

  fastify.delete('/services/:id', async (request, reply) => {
    const row = db().prepare('SELECT seller_id FROM services WHERE id = ?').get(request.params.id);
    if (!row || row.seller_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Услуга не найдена');
    db().prepare('DELETE FROM services WHERE id = ?').run(request.params.id);
    reply.send({ ok: true });
  });

  // ---------- Orders (purchase → commission → seller balance) ----------
  fastify.post('/orders', async (request, reply) => {
    const body = validateOrThrow(
      z.object({
        service_id: z.string().optional(),
        product_id: z.string().optional(),
        amount: z.coerce.number().int().min(1).optional(),
      }),
      request.body,
      reply
    );
    if (!body) return;
    let sellerId, amount, currency = 'RUB';
    if (body.service_id) {
      const s = db().prepare('SELECT * FROM services WHERE id = ? AND is_published = 1').get(body.service_id);
      if (!s) return sendError(reply, 404, 'not_found', 'Услуга не найдена');
      sellerId = s.seller_id; amount = body.amount ?? s.price; currency = s.currency;
    } else if (body.product_id) {
      const p = db().prepare('SELECT * FROM products WHERE id = ? AND is_published = 1').get(body.product_id);
      if (!p) return sendError(reply, 404, 'not_found', 'Товар не найден');
      sellerId = p.seller_id; amount = body.amount ?? p.price; currency = p.currency;
    } else {
      return sendError(reply, 400, 'validation_error', 'Укажите service_id или product_id');
    }
    if (sellerId === request.user.id) return sendError(reply, 400, 'validation_error', 'Нельзя купить у себя');
    const id = nanoid();
    const commissionRate = getCommissionPercent();
    db()
      .prepare(`INSERT INTO orders (id, buyer_id, seller_id, service_id, product_id, amount, currency, status, commission_rate)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'created', ?)`)
      .run(id, request.user.id, sellerId, body.service_id ?? null, body.product_id ?? null, amount, currency, commissionRate);
    auditRequest(request, 'create', 'order', id, { amount, commission_rate: commissionRate });
    reply.code(201).send(db().prepare('SELECT * FROM orders WHERE id = ?').get(id));
  });

  fastify.get('/orders', async (request, reply) => {
    const rows = db()
      .prepare(`SELECT * FROM orders WHERE buyer_id = ? OR seller_id = ? ORDER BY created_at DESC`)
      .all(request.user.id, request.user.id);
    return { data: rows };
  });

  fastify.patch('/orders/:id', async (request, reply) => {
    const row = db().prepare('SELECT * FROM orders WHERE id = ?').get(request.params.id);
    if (!row || (row.buyer_id !== request.user.id && row.seller_id !== request.user.id)) {
      return sendError(reply, 404, 'not_found', 'Заказ не найден');
    }
    const body = validateOrThrow(
      z.object({ status: z.enum(['created', 'paid', 'in_progress', 'delivered', 'completed', 'disputed', 'cancelled', 'refunded']) }),
      request.body ?? {},
      reply
    );
    if (!body) return;
    db().prepare('UPDATE orders SET status = ?, updated_at = unixepoch() WHERE id = ?').run(body.status, request.params.id);
    auditRequest(request, 'order_status', 'order', request.params.id, body);
    reply.send(db().prepare('SELECT * FROM orders WHERE id = ?').get(request.params.id));
  });

  // ---------- Reviews ----------
  fastify.post('/reviews', async (request, reply) => {
    const body = validateOrThrow(
      z.object({
        order_id: z.string().optional(),
        target_id: z.string().min(1),
        rating: z.coerce.number().int().min(1).max(5),
        body: z.string().max(3000).optional(),
      }),
      request.body,
      reply
    );
    if (!body) return;
    const order = body.order_id ? db().prepare('SELECT * FROM orders WHERE id = ?').get(body.order_id) : null;
    if (body.order_id && (!order || (order.buyer_id !== request.user.id && order.seller_id !== request.user.id))) {
      return sendError(reply, 403, 'forbidden', 'Отзыв возможен только по своему заказу');
    }
    const id = nanoid();
    db()
      .prepare('INSERT INTO reviews (id, author_id, order_id, target_id, rating, body) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, request.user.id, body.order_id ?? null, body.target_id, body.rating, body.body ?? null);
    reply.code(201).send(db().prepare('SELECT * FROM reviews WHERE id = ?').get(id));
  });

  fastify.get('/reviews/:userId', async (request, reply) => {
    const rows = db()
      .prepare(`SELECT r.*, u.email AS author_email FROM reviews r JOIN users u ON u.id = r.author_id
                WHERE r.target_id = ? ORDER BY r.created_at DESC`)
      .all(request.params.userId);
    const avg = rows.length ? rows.reduce((a, r) => a + r.rating, 0) / rows.length : 0;
    return { data: rows, average: Number(avg.toFixed(2)), count: rows.length };
  });

  // ---------- AI matching (§21/§23): score specialist profile vs project ----
  fastify.get('/projects/:id/matching', async (request, reply) => {
    const project = db().prepare('SELECT * FROM marketplace_projects WHERE id = ?').get(request.params.id);
    if (!project) return sendError(reply, 404, 'not_found', 'Проект не найден');
    const profile = db().prepare('SELECT * FROM profiles WHERE user_id = ?').get(request.user.id);
    const skills = profile
      ? db()
          .prepare(`SELECT s.name, ps.level FROM profile_skills ps JOIN skills s ON s.id = ps.skill_id WHERE ps.profile_id = ?`)
          .all(profile.id)
      : [];
    const wanted = readJson(project.skills_json, []);
    const score = matchScore(wanted, skills.map((s) => s.name), project, profile);
    return { score, matched_skills: wanted.filter((w) => skills.some((s) => s.name.toLowerCase() === w.toLowerCase())), wanted, have: skills };
  });
}

function matchScore(wanted, have, project, profile) {
  let score = 0;
  const w = (wanted || []).map((s) => String(s).toLowerCase());
  const h = (have || []).map((s) => String(s).toLowerCase());
  const hits = w.filter((x) => h.includes(x)).length;
  if (w.length) score += Math.round((hits / w.length) * 60);
  else score += 20;
  if (project.budget_max && profile?.min_hourly_rate && project.budget_max >= profile.min_hourly_rate * 8) score += 15;
  if (profile?.city && project.region) score += 5;
  if (profile?.experience_years) score += Math.min(20, profile.experience_years * 2);
  return Math.max(0, Math.min(100, score));
}
