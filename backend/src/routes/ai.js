/**
 * Светлана API: chat, conversation history, action log, approval of sensitive
 * actions. One endpoint, one Светлана, shared by web and Android.
 */
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { converse } from '../ai/orchestrator.js';
import { listTools } from '../ai/tools/index.js';
import { sendError, validateOrThrow } from '../lib/http.js';

export default async function aiRoutes(fastify) {
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });

  // Main entry: USER → Светлана → tools → verified result.
  fastify.post('/chat', async (request, reply) => {
    const body = validateOrThrow(
      z.object({
        message: z.string().min(1).max(8000),
        conversation_id: z.string().optional(),
        approved_tool: z.string().optional(),
      }),
      request.body,
      reply
    );
    if (!body) return;
    try {
      const out = await converse({
        userId: request.user.id,
        message: body.message,
        conversationId: body.conversation_id,
        approvedTool: body.approved_tool,
        turnId: nanoid(),
      });
      return reply.send(out);
    } catch (err) {
      request.log.error({ err }, 'ai chat failed');
      return sendError(reply, 503, 'ai_unavailable', `Светлана временно недоступна: ${err.message}`, { status: 'FAILED' });
    }
  });

  fastify.get('/conversations', async (request, reply) => {
    const rows = db()
      .prepare('SELECT id, title, created_at, updated_at FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC')
      .all(request.user.id);
    return { data: rows };
  });

  fastify.get('/conversations/:id', async (request, reply) => {
    const conv = db().prepare('SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?').get(request.params.id, request.user.id);
    if (!conv) return sendError(reply, 404, 'not_found', 'Беседа не найдена');
    const messages = db()
      .prepare('SELECT id, role, content, emotion, provider, model, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY created_at')
      .all(conv.id);
    return { conversation: conv, messages };
  });

  fastify.delete('/conversations/:id', async (request, reply) => {
    const conv = db().prepare('SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?').get(request.params.id, request.user.id);
    if (!conv) return sendError(reply, 404, 'not_found', 'Беседа не найдена');
    db().prepare('DELETE FROM ai_conversations WHERE id = ?').run(conv.id);
    reply.send({ ok: true });
  });

  // The auditable action log (§13/§14): what was attempted, what was verified.
  fastify.get('/actions', async (request, reply) => {
    const { limit, offset } = validateOrThrow(
      z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) }),
      request.query ?? {},
      reply
    ) ?? { limit: 50, offset: 0 };
    const rows = db()
      .prepare(`SELECT a.*, (SELECT group_concat(quote) FROM rag_citations c WHERE c.action_id = a.id) AS citations
                FROM ai_actions a WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT ? OFFSET ?`)
      .all(request.user.id, limit, offset);
    return { data: rows };
  });

  fastify.get('/capabilities', async () => {
    return {
      data: listTools().map((t) => ({
        name: t.name,
        description: t.description,
        sensitive: Boolean(t.sensitive),
        parameters: t.parameters,
      })),
    };
  });

  // Proactive engine (§33): overdue tasks, expiring contracts, due reminders.
  fastify.get('/proactive', async (request, reply) => {
    const uid = request.user.id;
    const overdue = db()
      .prepare(`SELECT id, title, due_at FROM tasks
                WHERE owner_id = ? AND status NOT IN ('done','cancelled') AND due_at IS NOT NULL AND due_at < unixepoch()
                ORDER BY due_at LIMIT 5`)
      .all(uid);
    const dueReminders = db()
      .prepare(`SELECT id, message, remind_at FROM reminders
                WHERE owner_id = ? AND status = 'pending' AND remind_at <= unixepoch() + 86400 ORDER BY remind_at LIMIT 5`)
      .all(uid);
    const expiring = db()
      .prepare(`SELECT c.id, c.ends_at, d.title FROM contracts c JOIN documents d ON d.id = c.document_id
                WHERE c.owner_id = ? AND c.status = 'active' AND c.ends_at IS NOT NULL AND c.ends_at <= unixepoch() + 14*86400
                ORDER BY c.ends_at LIMIT 5`)
      .all(uid);
    const unpaid = db()
      .prepare(`SELECT id, number, amount, due_at FROM invoices WHERE owner_id = ? AND status = 'sent' ORDER BY due_at LIMIT 5`)
      .all(uid);
    return {
      overdue_tasks: overdue,
      due_reminders: dueReminders,
      expiring_contracts: expiring,
      unpaid_invoices: unpaid,
      count: overdue.length + dueReminders.length + expiring.length + unpaid.length,
    };
  });
}
