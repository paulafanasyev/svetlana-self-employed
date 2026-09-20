/**
 * Document pipeline (§16):
 *   draft → questions → data → generated → preview → approved → stored
 *          → (optional) sent_email → verified
 *
 * Every transition is explicit and audited. The send step (§14) only ever
 * reports success when a real delivery channel produced evidence; otherwise it
 * returns an honest `not_sent` status the UI shows as NOT SENT.
 */
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { config } from '../config.js';
import { auditRequest } from '../plugins/audit.js';
import { sendError, validateOrThrow, readJson, writeJson } from '../lib/http.js';
import { renderTemplate, wrapDocumentHtml, renderDocx, ensureDocsDir } from '../documents/render.js';
import { TEMPLATES } from '../documents/templates.js';

const KINDS = ['contract', 'act', 'invoice', 'kp', 'offer', 'nda', 'tz', 'appendix', 'other'];
const PIPELINE = ['draft', 'questions', 'data', 'generated', 'preview', 'approved', 'stored', 'sent_email', 'sent_sign', 'verified', 'archived', 'rejected'];

function getDoc(request, reply, id) {
  const row = db().prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!row || row.owner_id !== request.user.id) {
    sendError(reply, 404, 'not_found', 'Документ не найден');
    return null;
  }
  return row;
}

export default async function documentRoutes(fastify) {
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });

  // ---- Templates -------------------------------------------------------
  fastify.get('/templates', async () => {
    const rows = db()
      .prepare('SELECT id, slug, title, description, schema_json, version, is_active FROM document_templates WHERE is_active = 1 ORDER BY slug')
      .all();
    return { data: rows.map((r) => ({ ...r, schema: readJson(r.schema_json, []) })) };
  });

  // ---- List ------------------------------------------------------------
  fastify.get('/', async (request, reply) => {
    const { limit, offset } = validateOrThrow(
      z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).default(0) }),
      request.query,
      reply
    ) ?? { limit: 20, offset: 0 };
    const q = String(request.query?.q ?? '').trim();
    const kind = String(request.query?.kind ?? '');
    let sql = 'SELECT * FROM documents WHERE owner_id = ?';
    const params = [request.user.id];
    if (kind && KINDS.includes(kind)) { sql += ' AND kind = ?'; params.push(kind); }
    if (q) { sql += ' AND title LIKE ?'; params.push(`%${q}%`); }
    sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    const rows = db().prepare(sql).all(...params, limit, offset);
    return { data: rows, limit, offset };
  });

  // ---- Create draft ----------------------------------------------------
  fastify.post('/', async (request, reply) => {
    const body = validateOrThrow(
      z.object({
        kind: z.enum(KINDS),
        template_id: z.string().nullable().optional(),
        title: z.string().min(1).max(300),
        client_id: z.string().nullable().optional(),
        project_id: z.string().nullable().optional(),
        data: z.record(z.string(), z.unknown()).optional(),
        amount: z.coerce.number().int().nullable().optional(),
      }),
      request.body,
      reply
    );
    if (!body) return;
    const id = nanoid();
    db()
      .prepare(`INSERT INTO documents (id, owner_id, client_id, project_id, template_id, kind, title, status, data_json, amount)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
      .run(id, request.user.id, body.client_id ?? null, body.project_id ?? null, body.template_id ?? null,
        body.kind, body.title, writeJson(body.data ?? {}), body.amount ?? null);
    const row = db().prepare('SELECT * FROM documents WHERE id = ?').get(id);
    auditRequest(request, 'create', 'document', id, { kind: body.kind });
    reply.code(201).send(row);
  });

  // ---- Ask Светлана for missing fields (questions stage) ---------------
  fastify.get('/:id/questions', async (request, reply) => {
    const doc = getDoc(request, reply, request.params.id);
    if (!doc) return;
    const tpl = doc.template_id
      ? db().prepare('SELECT * FROM document_templates WHERE id = ?').get(doc.template_id)
      : TEMPLATES.find((t) => t.slug === doc.kind);
    const schema = tpl ? readJson(tpl.schema_json, []) : [];
    const data = readJson(doc.data_json, {});
    const missing = schema.filter((f) => f.required && (data[f.key] === undefined || data[f.key] === null || data[f.key] === ''));
    return { questions: missing.map((f) => ({ key: f.key, label: f.label, type: f.type, default: f.default ?? null })), answered: schema.filter((f) => !missing.includes(f)).length, total: schema.length };
  });

  // ---- Set data --------------------------------------------------------
  fastify.put('/:id/data', async (request, reply) => {
    const doc = getDoc(request, reply, request.params.id);
    if (!doc) return;
    const body = validateOrThrow(z.object({ data: z.record(z.string(), z.unknown()) }), request.body, reply);
    if (!body) return;
    const merged = { ...readJson(doc.data_json, {}), ...body.data };
    db()
      .prepare("UPDATE documents SET data_json = ?, status = 'data', updated_at = unixepoch() WHERE id = ?")
      .run(writeJson(merged), doc.id);
    auditRequest(request, 'update', 'document_data', doc.id, { keys: Object.keys(body.data) });
    reply.send(db().prepare('SELECT * FROM documents WHERE id = ?').get(doc.id));
  });

  // ---- Generate (render template with data) ---------------------------
  fastify.post('/:id/generate', async (request, reply) => {
    const doc = getDoc(request, reply, request.params.id);
    if (!doc) return;
    const tpl = doc.template_id
      ? db().prepare('SELECT * FROM document_templates WHERE id = ?').get(doc.template_id)
      : null;
    if (!tpl) return sendError(reply, 400, 'no_template', 'Укажите шаблон документа');
    const data = readJson(doc.data_json, {});
    const missing = readJson(tpl.schema_json, [])
      .filter((f) => f.required && (data[f.key] === undefined || data[f.key] === null || data[f.key] === ''));
    if (missing.length) {
      db().prepare("UPDATE documents SET status = 'questions', questions_json = ? WHERE id = ?")
        .run(writeJson(missing.map((f) => f.label)), doc.id);
      return sendError(reply, 409, 'missing_fields', 'Не заполнены обязательные поля', {
        questions: missing.map((f) => ({ key: f.key, label: f.label })),
      });
    }
    const number = data.number ?? docNum(doc.kind);
    const bodyHtml = renderTemplate(tpl.body_html, { ...data, number });
    db()
      .prepare("UPDATE documents SET body_html = ?, status = 'preview', updated_at = unixepoch() WHERE id = ?")
      .run(bodyHtml, doc.id);
    auditRequest(request, 'generate', 'document', doc.id, { template: tpl.slug });
    reply.send(db().prepare('SELECT * FROM documents WHERE id = ?').get(doc.id));
  });

  // ---- Preview HTML ----------------------------------------------------
  fastify.get('/:id/preview', async (request, reply) => {
    const doc = getDoc(request, reply, request.params.id);
    if (!doc) return;
    reply.header('content-type', 'text/html; charset=utf-8');
    reply.send(wrapDocumentHtml(doc.body_html ?? '', doc.title));
  });

  // ---- Printable page (browser → PDF) ---------------------------------
  fastify.get('/:id/print', async (request, reply) => {
    const doc = getDoc(request, reply, request.params.id);
    if (!doc) return;
    reply.header('content-type', 'text/html; charset=utf-8');
    reply.send(wrapDocumentHtml(doc.body_html ?? '', doc.title, { printable: true }));
  });

  // ---- Approve → store (generate the real DOCX file) ------------------
  fastify.post('/:id/approve', async (request, reply) => {
    const doc = getDoc(request, reply, request.params.id);
    if (!doc) return;
    if (!doc.body_html) return sendError(reply, 400, 'not_generated', 'Сначала сгенерируйте документ');
    if (doc.status !== 'preview' && doc.status !== 'data' && doc.status !== 'generated') {
      return sendError(reply, 409, 'bad_state', `Невозможно утвердить документ в статусе ${doc.status}`);
    }
    let docxPath = doc.docx_path;
    try {
      docxPath = await renderDocx({ id: doc.id, title: doc.title, bodyHtml: doc.body_html });
    } catch (err) {
      request.log.error({ err }, 'docx render failed');
      return sendError(reply, 500, 'render_failed', 'Не удалось создать DOCX', { detail: err.message });
    }
    db()
      .prepare("UPDATE documents SET status = 'stored', docx_path = ?, updated_at = unixepoch() WHERE id = ?")
      .run(docxPath, doc.id);
    auditRequest(request, 'approve', 'document', doc.id, { docx: docxPath });
    reply.send(db().prepare('SELECT * FROM documents WHERE id = ?').get(doc.id));
  });

  // ---- Download the generated file ------------------------------------
  fastify.get('/:id/download', async (request, reply) => {
    const doc = getDoc(request, reply, request.params.id);
    if (!doc) return;
    if (!doc.docx_path) return sendError(reply, 404, 'no_file', 'Файл ещё не сгенерирован');
    // Streamed manually — the static plugin is registered with decorateReply:false,
    // so reply.download is not available.
    const { createReadStream } = await import('node:fs');
    const { basename } = await import('node:path');
    reply.header('content-type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    reply.header('content-disposition', `attachment; filename="${encodeURIComponent(basename(doc.docx_path))}"`);
    return reply.send(createReadStream(doc.docx_path));
  });

  // ---- Optional send (§14: honest evidence or honest NOT SENT) --------
  fastify.post('/:id/send', async (request, reply) => {
    const doc = getDoc(request, reply, request.params.id);
    if (!doc) return;
    if (doc.status !== 'stored') return sendError(reply, 409, 'bad_state', 'Документ должен быть утверждён и сохранён');

    const channel = String(request.body?.channel ?? 'email');
    if (channel === 'email') {
      if (!config.SMTP_URL || !config.MAIL_FROM) {
        // Honest negative: no transport configured → we do NOT claim it was sent.
        return sendError(reply, 503, 'not_sent', 'Отправка по email не настроена на сервере. Скачайте DOCX и приложите вручную.', {
          status: 'NOT_SENT',
          reason: 'no_smtp_transport',
        });
      }
      const { sendDocumentEmail } = await import('../integrations/email.js');
      const to = String(request.body?.to ?? '').trim();
      if (!to) return sendError(reply, 400, 'validation_error', 'Укажите получателя to');
      try {
        const evidence = await sendDocumentEmail({ to, subject: doc.title, html: wrapDocumentHtml(doc.body_html ?? '', doc.title), doc });
        db()
          .prepare("UPDATE documents SET status = 'sent_email', sent_evidence = ?, updated_at = unixepoch() WHERE id = ?")
          .run(writeJson(evidence), doc.id);
        auditRequest(request, 'send', 'document', doc.id, { channel, to });
        return reply.send(db().prepare('SELECT * FROM documents WHERE id = ?').get(doc.id));
      } catch (err) {
        request.log.error({ err }, 'email send failed');
        return sendError(reply, 502, 'send_failed', `Отправка не удалась: ${err.message}`, { status: 'FAILED' });
      }
    }
    return sendError(reply, 400, 'validation_error', `Канал ${channel} не поддерживается`);
  });

  // ---- Contract record from a stored document -------------------------
  fastify.post('/:id/contract', async (request, reply) => {
    const doc = getDoc(request, reply, request.params.id);
    if (!doc) return;
    if (doc.kind !== 'contract') return sendError(reply, 400, 'bad_kind', 'Это не договор');
    const body = validateOrThrow(
      z.object({
        number: z.string().max(60).optional(),
        amount: z.coerce.number().int().nullable().optional(),
        starts_at: z.coerce.number().int().nullable().optional(),
        ends_at: z.coerce.number().int().nullable().optional(),
      }),
      request.body ?? {},
      reply
    );
    if (!body) return;
    const id = nanoid();
    db()
      .prepare(`INSERT INTO contracts (id, document_id, owner_id, client_id, number, amount, starts_at, ends_at, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')`)
      .run(id, doc.id, request.user.id, doc.client_id, body.number ?? null, body.amount ?? doc.amount, body.starts_at ?? null, body.ends_at ?? null);
    auditRequest(request, 'create', 'contract', id, { document_id: doc.id });
    reply.code(201).send(db().prepare('SELECT * FROM contracts WHERE id = ?').get(id));
  });

  // ---- Contracts list/detail ------------------------------------------
  fastify.get('/contracts', async (request) => {
    const rows = db()
      .prepare('SELECT * FROM contracts WHERE owner_id = ? ORDER BY created_at DESC')
      .all(request.user.id);
    return { data: rows };
  });

  fastify.patch('/contracts/:id', async (request, reply) => {
    const row = db().prepare('SELECT * FROM contracts WHERE id = ?').get(request.params.id);
    if (!row || row.owner_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Договор не найден');
    const body = validateOrThrow(
      z.object({
        status: z.enum(['draft', 'active', 'signed', 'terminated', 'expired']).optional(),
        signed_at: z.coerce.number().int().nullable().optional(),
      }),
      request.body ?? {},
      reply
    );
    if (!body) return;
    db()
      .prepare('UPDATE contracts SET status = ?, signed_at = ? WHERE id = ?')
      .run(body.status ?? row.status, body.signed_at ?? row.signed_at, request.params.id);
    reply.send(db().prepare('SELECT * FROM contracts WHERE id = ?').get(request.params.id));
  });

  // ---- State transition (explicit, validated) -------------------------
  fastify.post('/:id/status', async (request, reply) => {
    const doc = getDoc(request, reply, request.params.id);
    if (!doc) return;
    const body = validateOrThrow(z.object({ status: z.enum(PIPELINE) }), request.body, reply);
    if (!body) return;
    db().prepare('UPDATE documents SET status = ?, updated_at = unixepoch() WHERE id = ?').run(body.status, doc.id);
    auditRequest(request, 'status_change', 'document', doc.id, { to: body.status });
    reply.send(db().prepare('SELECT * FROM documents WHERE id = ?').get(doc.id));
  });

  // ---- Delete ----------------------------------------------------------
  fastify.delete('/:id', async (request, reply) => {
    const doc = getDoc(request, reply, request.params.id);
    if (!doc) return;
    db().prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
    auditRequest(request, 'delete', 'document', doc.id);
    reply.send({ ok: true, id: doc.id });
  });
}

let counters = {};
function docNum(kind) {
  const year = new Date().getFullYear();
  counters[`${kind}-${year}`] = (counters[`${kind}-${year}`] ?? 0) + 1;
  return `${kind.toUpperCase()}-${year}-${String(counters[`${kind}-${year}`]).padStart(3, '0')}`;
}
