/**
 * CRM tools Светланы. Пишут в ту же CRM, что видна в кабинете и на устройствах
 * (crm_records, формат CRMStore v1 из Svetlana 2.0), через applyCrmChanges —
 * поэтому новый контакт сразу уходит в синхронизацию (Windows, Android, сайт).
 * Старая таблица clients пока ведётся как зеркало (тот же id) для старых клиентов API
 * (/api/v1/clients). Каждая запись проверяется повторным чтением из базы (§14).
 */
import { db } from '../../db/client.js';
import { applyCrmChanges } from '../../routes/crmSync.js';
import { defineTool } from './registry.js';

const STATUS_MAP = { lead: 'lead', active: 'client', paused: 'other' };

function makeId(now = Date.now()) {
  return 'c_' + now.toString(36) + Math.random().toString(36).slice(2, 8);
}

function readContacts(ownerId) {
  return db()
    .prepare("SELECT id, data_json FROM crm_records WHERE owner_id = ? AND kind = 'contacts' AND deleted = 0 ORDER BY updated_at DESC")
    .all(ownerId)
    .map((r) => { try { return JSON.parse(r.data_json); } catch { return null; } })
    .filter(Boolean);
}

const norm = (s) => String(s ?? '').trim().toLowerCase();
const phoneKey = (p) => String(p ?? '').replace(/\D/g, '').slice(-10);

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
    const name = String(args.name ?? '').trim().slice(0, 300);
    if (!name) return { status: 'failed', message: 'Нужно имя клиента.' };
    const email = norm(args.email).slice(0, 200);
    const phone = String(args.phone ?? '').trim().slice(0, 40);
    const dup = readContacts(ctx.userId).find((c) =>
      (email && (c.emails || []).some((e) => norm(e) === email))
      || (phoneKey(phone).length >= 7 && (c.phones || []).some((p) => phoneKey(p) === phoneKey(phone))));
    if (dup) {
      return {
        status: 'succeeded',
        result: { id: dup.id, name: dup.name, duplicate: true },
        evidence: [{ kind: 'db_read', table: 'crm_records', id: dup.id }],
        message: `Такой контакт уже есть в CRM: «${dup.name}». Новый не создавала.`,
      };
    }
    const now = Date.now();
    const id = makeId(now);
    const data = {
      id, name,
      phones: phone ? [phone] : [],
      emails: email ? [email] : [],
      company: String(args.company ?? '').trim().slice(0, 300),
      position: '',
      status: STATUS_MAP[args.status] ?? 'lead',
      tags: [],
      source: 'chat',
      notes: String(args.notes ?? '').slice(0, 10000),
      createdAt: now,
      updatedAt: now,
    };
    const companyId = data.company
      ? (db().prepare('SELECT id FROM companies WHERE owner_id = ? AND name LIKE ?').get(ctx.userId, `%${data.company}%`)?.id ?? null)
      : null;
    // db().transaction не вкладывается, а applyCrmChanges уже открывает свою —
    // поэтому сначала зеркало (один INSERT), затем CRM; при сбое зеркало убираем.
    db()
      .prepare(`INSERT INTO clients (id, owner_id, type, name, company_id, email, phone, status, notes)
                VALUES (?, ?, 'person', ?, ?, ?, ?, ?, ?)`)
      .run(id, ctx.userId, name, companyId, email || null, phone || null, args.status ?? 'lead', data.notes || null);
    try {
      applyCrmChanges(ctx.userId, [{ kind: 'contacts', id, updatedAt: now, data }], now);
    } catch (err) {
      db().prepare('DELETE FROM clients WHERE id = ? AND owner_id = ?').run(id, ctx.userId);
      throw err;
    }
    return {
      status: 'succeeded',
      result: { id, name },
      evidence: [{ kind: 'db_insert', table: 'crm_records', id }, { kind: 'db_insert', table: 'clients', id }],
      message: `Клиент «${name}» добавлен в CRM и появится на всех ваших устройствах.`,
    };
  },
  verify(ctx, args, result) {
    const row = db()
      .prepare("SELECT id FROM crm_records WHERE owner_id = ? AND kind = 'contacts' AND id = ? AND deleted = 0")
      .get(ctx.userId, result.id);
    return {
      verified: Boolean(row),
      evidence: [{ kind: 'db_read', table: 'crm_records', id: result.id, found: Boolean(row) }],
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
    const limit = args.limit ?? 20;
    const fromCrm = readContacts(ctx.userId).map((c) => ({
      id: c.id, name: c.name, email: (c.emails || [])[0] ?? null, phone: (c.phones || [])[0] ?? null,
      company: c.company || null, status: c.status, created_at: c.createdAt,
    }));
    // Старые клиенты, заведённые до общей CRM, тоже показываем (без дублей по id).
    const known = new Set(fromCrm.map((c) => c.id));
    const legacy = db()
      .prepare('SELECT id, name, email, phone, status, created_at FROM clients WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(ctx.userId, limit)
      .filter((c) => !known.has(c.id));
    const rows = [...fromCrm, ...legacy].slice(0, limit);
    return {
      status: 'succeeded',
      result: rows,
      evidence: [{ kind: 'db_read', table: 'crm_records+clients', count: rows.length }],
      message: rows.length ? `В CRM ${rows.length} клиентов.` : 'В CRM пока нет клиентов.',
    };
  },
});
