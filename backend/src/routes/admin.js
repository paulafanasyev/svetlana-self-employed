/**
 * Admin panel API (§38): users, experts, courses, orders, payments,
 * commissions, moderation, disputes, support, integrations, AI, RAG,
 * system health, audit logs. Every action is itself audited.
 */
import { z } from 'zod';
import { db } from '../db/client.js';
import { config } from '../config.js';
import { auditRequest } from '../plugins/audit.js';
import { sendError, validateOrThrow, paginationSchema } from '../lib/http.js';
import { setCommissionPercent, getCommissionPercent } from '../payments/commission.js';
import { migrationStatus } from '../db/migrate.js';

function requireAdmin(request, reply) {
  if (request.user?.role !== 'admin') {
    sendError(reply, 403, 'forbidden', 'Требуются права администратора');
    return false;
  }
  return true;
}

export default async function adminRoutes(fastify) {
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });

  // ---------- Users ----------
  fastify.get('/users', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { limit, offset } = paginationSchema.parse(request.query ?? {});
    const rows = db()
      .prepare('SELECT id, email, role, status, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(limit, offset);
    return { data: rows, limit, offset };
  });

  fastify.patch('/users/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = validateOrThrow(
      z.object({ role: z.enum(['user', 'expert', 'training_center', 'admin']).optional(), status: z.enum(['active', 'suspended', 'deleted']).optional() }),
      request.body ?? {},
      reply
    );
    if (!body) return;
    const set = [];
    const vals = [];
    if (body.role) { set.push('role = ?'); vals.push(body.role); }
    if (body.status) { set.push('status = ?'); vals.push(body.status); }
    set.push('updated_at = unixepoch()');
    db().prepare(`UPDATE users SET ${set.join(', ')} WHERE id = ?`).run(...vals, request.params.id);
    auditRequest(request, 'admin_update_user', 'user', request.params.id, body);
    reply.send({ ok: true });
  });

  // ---------- Moderation: courses & services awaiting/removed ----------
  fastify.get('/moderation/courses', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const rows = db()
      .prepare(`SELECT c.id, c.title, c.price, c.is_published, u.email AS author_email FROM courses c
                JOIN users u ON u.id = c.author_id ORDER BY c.created_at DESC LIMIT 100`)
      .all();
    return { data: rows };
  });

  fastify.patch('/moderation/courses/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = validateOrThrow(z.object({ is_published: z.boolean() }), request.body ?? {}, reply);
    if (!body) return;
    db().prepare('UPDATE courses SET is_published = ?, updated_at = unixepoch() WHERE id = ?').run(body.is_published ? 1 : 0, request.params.id);
    auditRequest(request, 'moderate_course', 'course', request.params.id, body);
    reply.send({ ok: true });
  });

  fastify.get('/moderation/services', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const rows = db()
      .prepare(`SELECT s.id, s.title, s.price, s.is_published, u.email AS seller_email FROM services s
                JOIN users u ON u.id = s.seller_id ORDER BY s.created_at DESC LIMIT 100`)
      .all();
    return { data: rows };
  });

  fastify.patch('/moderation/services/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = validateOrThrow(z.object({ is_published: z.boolean() }), request.body ?? {}, reply);
    if (!body) return;
    db().prepare('UPDATE services SET is_published = ?, updated_at = unixepoch() WHERE id = ?').run(body.is_published ? 1 : 0, request.params.id);
    auditRequest(request, 'moderate_service', 'service', request.params.id, body);
    reply.send({ ok: true });
  });

  // ---------- Disputes (orders flagged disputed) ----------
  fastify.get('/disputes', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const rows = db()
      .prepare(`SELECT o.*, b.email AS buyer_email, s.email AS seller_email FROM orders o
                JOIN users b ON b.id = o.buyer_id JOIN users s ON s.id = o.seller_id
                WHERE o.status = 'disputed' ORDER BY o.updated_at DESC`)
      .all();
    return { data: rows };
  });

  fastify.patch('/disputes/:orderId', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = validateOrThrow(
      z.object({ resolution: z.enum(['completed', 'refunded', 'cancelled']) }),
      request.body ?? {},
      reply
    );
    if (!body) return;
    db()
      .prepare('UPDATE orders SET status = ?, updated_at = unixepoch() WHERE id = ?')
      .run(body.resolution, request.params.orderId);
    auditRequest(request, 'resolve_dispute', 'order', request.params.orderId, body);
    reply.send({ ok: true });
  });

  // ---------- Payments & commission (§25 configurable, never hardcoded) ----
  fastify.get('/payments', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const rows = db()
      .prepare('SELECT * FROM payments ORDER BY created_at DESC LIMIT 100')
      .all();
    const totals = db()
      .prepare(`SELECT status, SUM(amount) AS amount, SUM(platform_fee) AS fee, COUNT(*) AS n FROM payments GROUP BY status`)
      .all();
    return { data: rows, totals };
  });

  fastify.get('/commission', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    return { commission_percent: getCommissionPercent() };
  });

  fastify.patch('/commission', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = validateOrThrow(z.object({ percent: z.coerce.number().min(0).max(100) }), request.body ?? {}, reply);
    if (!body) return;
    const value = setCommissionPercent(body.percent, request.user.id);
    auditRequest(request, 'set_commission', 'system_config', 'marketplace.commission_percent', { percent: value });
    reply.send({ commission_percent: value });
  });

  fastify.get('/payouts', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const rows = db().prepare('SELECT * FROM payouts ORDER BY created_at DESC LIMIT 100').all();
    return { data: rows };
  });

  // ---------- Private site usage report ----------
  fastify.get('/site-analytics', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const rawDays = Number(request.query?.days ?? 30);
    const days = Math.min(180, Math.max(1, Number.isFinite(rawDays) ? Math.floor(rawDays) : 30));
    const since = Math.floor(Date.now() / 1000) - days * 86400;

    const summary = db().prepare(
      "SELECT COUNT(*) AS page_views, " +
      "COUNT(DISTINCT session_hash) AS unique_sessions, " +
      "COUNT(DISTINCT path) AS unique_paths, " +
      "COUNT(DISTINCT referrer_origin) AS referrer_origins " +
      "FROM site_analytics_events WHERE created_at >= ? AND event_type = 'page_view'"
    ).get(since);

    const byDay = db().prepare(
      "SELECT day, COUNT(*) AS page_views, COUNT(DISTINCT session_hash) AS unique_sessions " +
      "FROM site_analytics_events WHERE created_at >= ? AND event_type = 'page_view' " +
      "GROUP BY day ORDER BY day DESC"
    ).all(since);

    const byPath = db().prepare(
      "SELECT path, COUNT(*) AS page_views, COUNT(DISTINCT session_hash) AS unique_sessions " +
      "FROM site_analytics_events WHERE created_at >= ? AND event_type = 'page_view' " +
      "GROUP BY path ORDER BY page_views DESC, path ASC LIMIT 50"
    ).all(since);

    const byReferrer = db().prepare(
      "SELECT COALESCE(referrer_origin, '(прямой вход)') AS referrer_origin, COUNT(*) AS page_views " +
      "FROM site_analytics_events WHERE created_at >= ? AND event_type = 'page_view' " +
      "GROUP BY referrer_origin ORDER BY page_views DESC LIMIT 50"
    ).all(since);

    const byHour = db().prepare(
      "SELECT hour, COUNT(*) AS page_views " +
      "FROM site_analytics_events WHERE created_at >= ? AND event_type = 'page_view' " +
      "GROUP BY hour ORDER BY hour ASC"
    ).all(since);

    return {
      period_days: days,
      timezone: 'Europe/Moscow',
      generated_at: new Date().toISOString(),
      privacy: {
        ip_stored: false,
        user_agent_stored: false,
        account_id_stored: false,
        query_string_stored: false,
        raw_session_cookie_stored: false,
        public_endpoint: false,
      },
      summary: summary ?? { page_views: 0, unique_sessions: 0, unique_paths: 0, referrer_origins: 0 },
      by_day: byDay,
      by_path: byPath,
      by_referrer: byReferrer,
      by_hour: byHour,
    };
  });

  fastify.get('/site-analytics.csv', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const rawDays = Number(request.query?.days ?? 30);
    const days = Math.min(180, Math.max(1, Number.isFinite(rawDays) ? Math.floor(rawDays) : 30));
    const since = Math.floor(Date.now() / 1000) - days * 86400;
    const rows = db().prepare(
      "SELECT day, path, COUNT(*) AS page_views, COUNT(DISTINCT session_hash) AS unique_sessions " +
      "FROM site_analytics_events WHERE created_at >= ? AND event_type = 'page_view' " +
      "GROUP BY day, path ORDER BY day DESC, page_views DESC"
    ).all(since);

    const escapeCsv = (value) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
    const csv = [
      ['Дата (Москва)', 'Страница', 'Просмотры', 'Уникальные сессии'].map(escapeCsv).join(','),
      ...rows.map((row) => [row.day, row.path, row.page_views, row.unique_sessions].map(escapeCsv).join(',')),
    ].join('\\n');

    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="site-analytics.csv"')
      .send('\\ufeff' + csv);
  });

  // ---------- System health, AI, RAG, integrations ----------
  fastify.get('/system', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const counts = {};
    for (const t of ['users', 'orders', 'payments', 'courses', 'documents', 'knowledge_documents', 'ai_actions']) {
      counts[t] = db().prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    }
    return {
      counts,
      migrations: migrationStatus(),
      ai_providers: (await import('../ai/providers.js')).availableProviders().map((p) => ({ name: p.name, model: p.model })),
      payment_provider: config.PAYMENT_PROVIDER,
      commission_percent: getCommissionPercent(),
      smtp_configured: Boolean(config.SMTP_URL),
    };
  });

  fastify.get('/audit', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { limit, offset } = paginationSchema.parse(request.query ?? {});
    const rows = db()
      .prepare(`SELECT a.*, u.email AS actor_email FROM audit_logs a
                LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT ? OFFSET ?`)
      .all(limit, offset);
    return { data: rows, limit, offset };
  });

  fastify.get('/rag/stats', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const bySource = db()
      .prepare("SELECT source, COUNT(*) AS n FROM knowledge_documents WHERE status = 'active' GROUP BY source")
      .all();
    const chunks = db().prepare('SELECT COUNT(*) AS n FROM knowledge_chunks').get().n;
    return { by_source: bySource, chunks, citations: db().prepare('SELECT COUNT(*) AS n FROM rag_citations').get().n };
  });
}
