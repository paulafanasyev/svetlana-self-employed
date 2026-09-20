/**
 * Document tools (§16): create draft → collect data → generate → approve.
 * The approve step produces a real DOCX file on disk; verification checks the
 * file exists, so «документ готов» is only ever said when it is.
 */
import { nanoid } from 'nanoid';
import { existsSync } from 'node:fs';
import { db } from '../../db/client.js';
import { renderTemplate, renderDocx } from '../../documents/render.js';
import { defineTool } from './registry.js';

defineTool({
  name: 'documents.create',
  description: 'Создать черновик документа (договор, акт, счёт, КП, оферта, NDA, ТЗ).',
  parameters: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['contract', 'act', 'invoice', 'kp', 'offer', 'nda', 'tz', 'appendix'] },
      title: { type: 'string' },
      client_id: { type: 'string' },
      amount: { type: 'integer' },
    },
    required: ['kind'],
  },
  async execute(ctx, args) {
    const id = nanoid();
    const tpl = db().prepare('SELECT id FROM document_templates WHERE slug = ?').get(args.kind);
    db()
      .prepare(`INSERT INTO documents (id, owner_id, client_id, template_id, kind, title, status, data_json, amount)
                VALUES (?, ?, ?, ?, ?, ?, 'draft', '{}', ?)`)
      .run(id, ctx.userId, args.client_id ?? null, tpl?.id ?? null, args.kind,
        args.title ?? defaultTitle(args.kind), args.amount ?? null);
    return {
      status: 'succeeded',
      result: { id, kind: args.kind },
      evidence: [{ kind: 'db_insert', table: 'documents', id }],
      message: `Черновик создан. Заполните данные — я задам нужные вопросы.`,
    };
  },
  verify(ctx, _args, result) {
    const row = db().prepare('SELECT id FROM documents WHERE id = ? AND owner_id = ?').get(result.id, ctx.userId);
    return { verified: Boolean(row), evidence: [{ kind: 'db_read', table: 'documents', id: result.id, found: Boolean(row) }] };
  },
});

defineTool({
  name: 'documents.set_data',
  description: 'Заполнить данные документа (ответы на вопросы шаблона).',
  parameters: {
    type: 'object',
    properties: {
      document_id: { type: 'string' },
      data: { type: 'object', description: 'Поля шаблона: ключ-значение' },
    },
    required: ['document_id', 'data'],
  },
  async execute(ctx, args) {
    const doc = db().prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?').get(args.document_id, ctx.userId);
    if (!doc) return { status: 'failed', error: 'Документ не найден', message: 'Документ не найден.' };
    const merged = { ...(doc.data_json ? JSON.parse(doc.data_json) : {}), ...(args.data ?? {}) };
    db()
      .prepare("UPDATE documents SET data_json = ?, status = 'data', updated_at = unixepoch() WHERE id = ?")
      .run(JSON.stringify(merged), doc.id);
    return {
      status: 'succeeded',
      result: { id: doc.id, fields: Object.keys(merged) },
      evidence: [{ kind: 'db_update', table: 'documents', id: doc.id, fields: Object.keys(merged) }],
      message: 'Данные сохранены. Могу сгенерировать документ для предпросмотра.',
    };
  },
  verify(ctx, args) {
    const row = db().prepare('SELECT data_json FROM documents WHERE id = ? AND owner_id = ?').get(args.document_id, ctx.userId);
    const ok = Boolean(row && row.data_json && Object.keys(JSON.parse(row.data_json)).length);
    return { verified: ok, evidence: [{ kind: 'db_read', table: 'documents', id: args.document_id, has_data: ok }] };
  },
});

defineTool({
  name: 'documents.generate',
  description: 'Сгенерировать документ по шаблону и заполненным данным (предпросмотр).',
  parameters: { type: 'object', properties: { document_id: { type: 'string' } }, required: ['document_id'] },
  async execute(ctx, args) {
    const doc = db().prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?').get(args.document_id, ctx.userId);
    if (!doc) return { status: 'failed', error: 'Документ не найден', message: 'Документ не найден.' };
    const tpl = db().prepare('SELECT * FROM document_templates WHERE id = ?').get(doc.template_id);
    if (!tpl) return { status: 'failed', error: 'Шаблон не найден', message: 'Шаблон не найден.' };
    const data = doc.data_json ? JSON.parse(doc.data_json) : {};
    const schema = tpl.schema_json ? JSON.parse(tpl.schema_json) : [];
    const missing = schema.filter((f) => f.required && (data[f.key] === undefined || data[f.key] === null || data[f.key] === ''));
    if (missing.length) {
      db().prepare("UPDATE documents SET status = 'questions', questions_json = ? WHERE id = ?")
        .run(JSON.stringify(missing.map((f) => f.label)), doc.id);
      return {
        status: 'blocked',
        result: { questions: missing.map((f) => f.label) },
        evidence: [{ kind: 'missing_fields', fields: missing.map((f) => f.key) }],
        message: `Не хватает данных: ${missing.map((f) => f.label).join(', ')}. Ответьте на эти вопросы.`,
      };
    }
    const bodyHtml = renderTemplate(tpl.body_html, data);
    db()
      .prepare("UPDATE documents SET body_html = ?, status = 'preview', updated_at = unixepoch() WHERE id = ?")
      .run(bodyHtml, doc.id);
    return {
      status: 'succeeded',
      result: { id: doc.id, status: 'preview' },
      evidence: [{ kind: 'rendered', table: 'documents', id: doc.id, chars: bodyHtml.length }],
      message: 'Документ сгенерирован. Откройте предпросмотр и утвердите — после этого появится файл.',
    };
  },
  verify(ctx, args) {
    const row = db().prepare('SELECT status, body_html FROM documents WHERE id = ? AND owner_id = ?').get(args.document_id, ctx.userId);
    const ok = Boolean(row?.body_html && (row.status === 'preview' || row.status === 'stored'));
    return { verified: ok, evidence: [{ kind: 'db_read', table: 'documents', id: args.document_id, status: row?.status }] };
  },
});

defineTool({
  name: 'documents.approve',
  description: 'Утвердить и сохранить документ — создаёт реальный DOCX-файл.',
  parameters: { type: 'object', properties: { document_id: { type: 'string' } }, required: ['document_id'] },
  async execute(ctx, args) {
    const doc = db().prepare('SELECT * FROM documents WHERE id = ? AND owner_id = ?').get(args.document_id, ctx.userId);
    if (!doc) return { status: 'failed', error: 'Документ не найден', message: 'Документ не найден.' };
    if (!doc.body_html) return { status: 'failed', error: 'not generated', message: 'Сначала сгенерируйте документ.' };
    const path = await renderDocx({ id: doc.id, title: doc.title, bodyHtml: doc.body_html });
    db()
      .prepare("UPDATE documents SET status = 'stored', docx_path = ?, updated_at = unixepoch() WHERE id = ?")
      .run(path, doc.id);
    return {
      status: 'succeeded',
      result: { id: doc.id, path },
      evidence: [{ kind: 'db_update', table: 'documents', id: doc.id }, { kind: 'file_written', path }],
      message: `Документ «${doc.title}» утверждён и сохранён. DOCX доступен для скачивания.`,
    };
  },
  verify(ctx, args, result) {
    const row = db().prepare('SELECT status, docx_path FROM documents WHERE id = ? AND owner_id = ?').get(args.document_id, ctx.userId);
    const fileOk = Boolean(row?.docx_path && existsSync(row.docx_path));
    return {
      verified: Boolean(row?.status === 'stored' && fileOk),
      evidence: [{ kind: 'db_read', table: 'documents', id: args.document_id, status: row?.status }, { kind: 'file_check', path: result?.path, exists: fileOk }],
    };
  },
});

function defaultTitle(kind) {
  return { contract: 'Договор оказания услуг', act: 'Акт сдачи-приёмки', invoice: 'Счёт на оплату',
    kp: 'Коммерческое предложение', offer: 'Публичная оферта', nda: 'Соглашение о неразглашении',
    tz: 'Техническое задание', appendix: 'Приложение' }[kind] || 'Документ';
}
