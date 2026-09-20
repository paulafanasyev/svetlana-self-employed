/**
 * CRM tools: create + list clients. Each write is verified by re-reading the
 * row from the database (§14) before success can be claimed.
 */
import { nanoid } from 'nanoid';
import { db } from '../../db/client.js';
import { defineTool } from './registry.js';

defineTool({
  name: 'crm.create_client',
  description: 'Создать клиента в CRM. Используй, когда пользователь просит завести/добавить клиента.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Имя клиента или название компании' },
      email: { type: 'string', format: 'email', description: 'Email (необязательно)' },
      phone: { type: 'string', description: 'Телефон (необязательно)' },
      company: { type: 'string', description: 'Компания (необязательно)' },
      status: { type: 'string', enum: ['lead', 'active', 'paused'], default: 'lead' },
      notes: { type: 'string' },
    },
    required: ['name'],
  },
  async execute(ctx, args) {
    const id = nanoid();
    const companyId = args.company
      ? (db().prepare('SELECT id FROM companies WHERE owner_id = ? AND name LIKE ?').get(ctx.userId, `%${args.company}%`)?.id ?? null)
      : null;
    db()
      .prepare(`INSERT INTO clients (id, owner_id, type, name, company_id, email, phone, status, notes)
                VALUES (?, ?, 'person', ?, ?, ?, ?, ?, ?)`)
      .run(id, ctx.userId, args.name, companyId, args.email ?? null, args.phone ?? null, args.status ?? 'lead', args.notes ?? null);
    return {
      status: 'succeeded',
      result: { id, name: args.name },
      evidence: [{ kind: 'db_insert', table: 'clients', id }],
      message: `Клиент «${args.name}» создан в CRM.`,
    };
  },
  verify(ctx, args, result) {
    const row = db().prepare('SELECT id, name FROM clients WHERE id = ? AND owner_id = ?').get(result.id, ctx.userId);
    return {
      verified: Boolean(row),
      evidence: [{ kind: 'db_read', table: 'clients', id: result.id, found: Boolean(row) }],
    };
  },
});

defineTool({
  name: 'crm.list_clients',
  description: 'Показать список клиентов пользователя в CRM.',
  parameters: {
    type: 'object',
    properties: { limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
  },
  async execute(ctx, args) {
    const rows = db()
      .prepare('SELECT id, name, email, phone, status, created_at FROM clients WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(ctx.userId, args.limit ?? 20);
    return {
      status: 'succeeded',
      result: rows,
      evidence: [{ kind: 'db_read', table: 'clients', count: rows.length }],
      message: rows.length ? `В CRM ${rows.length} клиентов.` : 'В CRM пока нет клиентов.',
    };
  },
});
