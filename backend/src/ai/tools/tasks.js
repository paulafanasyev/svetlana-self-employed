/**
 * Task tools (§15/§33): create tasks, report overdue ones for the proactive
 * engine. Creation is verified by re-reading the task row.
 */
import { nanoid } from 'nanoid';
import { db } from '../../db/client.js';
import { defineTool } from './registry.js';

defineTool({
  name: 'tasks.create',
  description: 'Создать задачу. Используй, когда пользователь просит поставить/создать задачу.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Название задачи' },
      description: { type: 'string' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
      due_at: { type: 'integer', description: 'Срок выполнения, epoch секунд' },
      project_id: { type: 'string' },
    },
    required: ['title'],
  },
  async execute(ctx, args) {
    const id = nanoid();
    db()
      .prepare(`INSERT INTO tasks (id, owner_id, project_id, title, description, priority, due_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, ctx.userId, args.project_id ?? null, args.title, args.description ?? null, args.priority ?? 'medium', args.due_at ?? null);
    return {
      status: 'succeeded',
      result: { id, title: args.title },
      evidence: [{ kind: 'db_insert', table: 'tasks', id }],
      message: `Задача «${args.title}» создана.`,
    };
  },
  verify(ctx, _args, result) {
    const row = db().prepare('SELECT id, title FROM tasks WHERE id = ? AND owner_id = ?').get(result.id, ctx.userId);
    return { verified: Boolean(row), evidence: [{ kind: 'db_read', table: 'tasks', id: result.id, found: Boolean(row) }] };
  },
});

defineTool({
  name: 'tasks.list_overdue',
  description: 'Найти просроченные задачи пользователя.',
  parameters: { type: 'object', properties: {} },
  async execute(ctx) {
    const rows = db()
      .prepare(`SELECT id, title, due_at FROM tasks
                WHERE owner_id = ? AND status NOT IN ('done','cancelled') AND due_at IS NOT NULL AND due_at < unixepoch()
                ORDER BY due_at`)
      .all(ctx.userId);
    return {
      status: 'succeeded',
      result: rows,
      evidence: [{ kind: 'db_read', table: 'tasks', count: rows.length }],
      message: rows.length
        ? `У вас ${rows.length} просроченных задач: ${rows.map((r) => `«${r.title}»`).join(', ')}.`
        : 'Просроченных задач нет.',
    };
  },
});
