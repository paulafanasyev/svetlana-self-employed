/**
 * Search tools: grants (§19), marketplace projects (§21/§23), vacancies (§22).
 * Read-only, so verification is the non-empty, well-formed result itself.
 */
import { nanoid } from 'nanoid';
import { db } from '../../db/client.js';
import { retrieve } from '../rag.js';
import { defineTool } from './registry.js';

defineTool({
  name: 'grants.search',
  description: 'Найти гранты, субсидии и программы поддержки для самозанятого.',
  parameters: {
    type: 'object',
    properties: { q: { type: 'string' }, region: { type: 'string' }, limit: { type: 'integer', default: 6 } },
  },
  async execute(ctx, args) {
    const profile = db().prepare('SELECT city FROM profiles WHERE user_id = ?').get(ctx.userId);
    const region = args.region ?? profile?.city ?? null;
    let sql = 'SELECT * FROM government_programs WHERE is_active = 1';
    const params = [];
    if (region) { sql += ' AND (region = ? OR funder = ? OR region IS NULL)'; params.push(region, region); }
    if (args.q) { sql += ' AND (title LIKE ? OR description LIKE ?)'; params.push(`%${args.q}%`, `%${args.q}%`); }
    sql += ' ORDER BY (funder = ?) DESC, updated_at DESC LIMIT ?';
    const rows = db().prepare(sql).all(...params, 'Федеральный', args.limit ?? 6);
    return {
      status: 'succeeded',
      result: rows,
      evidence: [{ kind: 'db_read', table: 'government_programs', count: rows.length }],
      message: rows.length
        ? `Нашла ${rows.length} программ${region ? ` для региона ${region}` : ''}: ${rows.map((r) => `«${r.title}»`).join(', ')}. Все — со ссылкой на официальный источник.`
        : 'Подходящих программ не нашла — проверьте регион или запрос.',
    };
  },
});

defineTool({
  name: 'marketplace.search_projects',
  description: 'Найти проекты и заказы на маркетплейсе, подходящие под профиль специалиста.',
  parameters: {
    type: 'object',
    properties: { q: { type: 'string' }, limit: { type: 'integer', default: 6 } },
  },
  async execute(ctx, args) {
    let sql = `SELECT m.*, (SELECT COUNT(*) FROM applications a WHERE a.project_id = m.id) AS applications_count
               FROM marketplace_projects m WHERE m.status = 'open'`;
    const params = [];
    if (args.q) { sql += ' AND (m.title LIKE ? OR m.description LIKE ? OR m.category LIKE ?)'; params.push(`%${args.q}%`, `%${args.q}%`, `%${args.q}%`); }
    sql += ' ORDER BY m.created_at DESC LIMIT ?';
    const rows = db().prepare(sql).all(...params, args.limit ?? 6);
    return {
      status: 'succeeded',
      result: rows,
      evidence: [{ kind: 'db_read', table: 'marketplace_projects', count: rows.length }],
      message: rows.length
        ? `Нашла ${rows.length} проектов: ${rows.map((r) => `«${r.title}»`).join(', ')}.`
        : 'Сейчас открытых проектов по вашему запросу нет.',
    };
  },
});

defineTool({
  name: 'vacancies.search',
  description: 'Найти вакансии для самозанятых.',
  parameters: {
    type: 'object',
    properties: { q: { type: 'string' }, limit: { type: 'integer', default: 6 } },
  },
  async execute(ctx, args) {
    let sql = `SELECT v.* FROM vacancies v WHERE v.status = 'active'`;
    const params = [];
    if (args.q) { sql += ' AND (v.title LIKE ? OR v.description LIKE ? OR v.city LIKE ?)'; params.push(`%${args.q}%`, `%${args.q}%`, `%${args.q}%`); }
    sql += ' ORDER BY v.created_at DESC LIMIT ?';
    const rows = db().prepare(sql).all(...params, args.limit ?? 6);
    return {
      status: 'succeeded',
      result: rows,
      evidence: [{ kind: 'db_read', table: 'vacancies', count: rows.length }],
      message: rows.length
        ? `Нашла ${rows.length} вакансий: ${rows.map((r) => `«${r.title}»`).join(', ')}.`
        : 'Подходящих вакансий не нашла.',
    };
  },
});

defineTool({
  name: 'marketplace.apply',
  description: 'Отправить отклик на проект маркетплейса. Действие влияет на третьих лиц — требует подтверждения.',
  parameters: {
    type: 'object',
    properties: {
      project_id: { type: 'string' },
      cover_letter: { type: 'string', description: 'Сопроводительное письмо' },
      proposed_price: { type: 'integer', description: 'Предлагаемая цена, ₽' },
    },
    required: ['project_id', 'cover_letter'],
  },
  sensitive: true,
  label: 'отправка отклика на проект',
  async execute(ctx, args) {
    const project = db().prepare('SELECT id, status, title FROM marketplace_projects WHERE id = ?').get(args.project_id);
    if (!project || project.status !== 'open') {
      return { status: 'failed', error: 'project closed', message: 'Проект закрыт или не найден — отклик не отправлен.' };
    }
    const id = nanoid();
    db()
      .prepare('INSERT INTO applications (id, project_id, specialist_id, cover_letter, proposed_price) VALUES (?, ?, ?, ?, ?)')
      .run(id, args.project_id, ctx.userId, args.cover_letter, args.proposed_price ?? null);
    return {
      status: 'succeeded',
      result: { id, project_id: args.project_id },
      evidence: [{ kind: 'db_insert', table: 'applications', id }],
      message: `Отклик на проект «${project.title}» отправлен.`,
    };
  },
  verify(ctx, _args, result) {
    const row = db().prepare('SELECT id FROM applications WHERE id = ? AND specialist_id = ?').get(result.id, ctx.userId);
    return { verified: Boolean(row), evidence: [{ kind: 'db_read', table: 'applications', id: result.id, found: Boolean(row) }] };
  },
});

defineTool({
  name: 'rag.ask',
  description: 'Ответить по налогам, самозанятым, законодательству — только на основе знаний из RAG, с цитатами источников.',
  parameters: {
    type: 'object',
    properties: { question: { type: 'string' }, limit: { type: 'integer', default: 5 } },
    required: ['question'],
  },
  async execute(ctx, args) {
    const hits = await retrieve({
      query: args.question,
      limit: args.limit ?? 5,
      userId: ctx.userId,
      sources: ['fns', 'law', 'trud', 'msp', 'manual'],
    });
    return {
      status: 'succeeded',
      result: { hits },
      evidence: hits.map((h) => ({ kind: 'rag_citation', documentId: h.document.id, url: h.document.sourceUrl, score: h.score })),
      message: hits.length
        ? hits.map((h, i) => `${i + 1}. ${h.document.title}\n${h.quote}\nИсточник: ${h.document.sourceName} — ${h.document.sourceUrl}`).join('\n\n')
        : 'У меня нет подтверждённой информации по этому вопросу в базе знаний. Я не буду выдумывать ответ — поищите на официальном сайте ФНС (nalog.gov.ru) или уточните вопрос.',
    };
  },
});
