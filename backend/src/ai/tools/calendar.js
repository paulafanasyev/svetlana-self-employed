/**
 * Calendar / reminder tool (§32). «Напомни завтра в 10 позвонить клиенту»
 * creates a real reminder row; the scheduler promotes it to a notification.
 */
import { nanoid } from 'nanoid';
import { db } from '../../db/client.js';
import { defineTool } from './registry.js';

defineTool({
  name: 'calendar.remind',
  description: 'Поставить напоминание. Используй для фраз вроде «напомни завтра в 10 позвонить».',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Текст напоминания' },
      remind_at: { type: 'integer', description: 'Момент напоминания, epoch секунд' },
      when: { type: 'string', description: 'Человекочитаемое описание времени (для ответа)' },
    },
    required: ['message', 'remind_at'],
  },
  async execute(ctx, args) {
    const id = nanoid();
    const at = Number(args.remind_at);
    if (!Number.isFinite(at) || at <= 0) {
      return { status: 'failed', error: 'Не удалось определить время напоминания', message: 'Не поняла, когда напомнить. Укажите время, например «завтра в 10:00».' };
    }
    db()
      .prepare('INSERT INTO reminders (id, owner_id, message, remind_at, channel) VALUES (?, ?, ?, ?, ?)')
      .run(id, ctx.userId, args.message, at, 'in_app');
    return {
      status: 'succeeded',
      result: { id, remind_at: at },
      evidence: [{ kind: 'db_insert', table: 'reminders', id, remind_at: at }],
      message: `Напомню ${args.when ?? 'в назначенное время'}: ${args.message}`,
    };
  },
  verify(ctx, _args, result) {
    const row = db()
      .prepare('SELECT id, status, remind_at FROM reminders WHERE id = ? AND owner_id = ?')
      .get(result.id, ctx.userId);
    return { verified: Boolean(row), evidence: [{ kind: 'db_read', table: 'reminders', id: result.id, found: Boolean(row) }] };
  },
});

defineTool({
  name: 'calendar.list_events',
  description: 'Показать предстоящие события календаря.',
  parameters: {
    type: 'object',
    properties: { limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 } },
  },
  async execute(ctx, args) {
    const rows = db()
      .prepare('SELECT id, title, starts_at, kind FROM calendar_events WHERE owner_id = ? AND starts_at >= unixepoch() ORDER BY starts_at LIMIT ?')
      .all(ctx.userId, args.limit ?? 10);
    return {
      status: 'succeeded',
      result: rows,
      evidence: [{ kind: 'db_read', table: 'calendar_events', count: rows.length }],
      message: rows.length ? `У вас ${rows.length} предстоящих событий.` : 'Предстоящих событий нет.',
    };
  },
});
