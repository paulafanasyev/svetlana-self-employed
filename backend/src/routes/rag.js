/**
 * RAG API (§29): ingest documents, search the knowledge base, manage versions.
 *
 * Ingest is admin-restricted for official sources (so the base stays curated
 * and cited); users may ingest their own documents into the `user` bucket.
 */
import { z } from 'zod';
import { db } from '../db/client.js';
import { ingestDocument, retrieve, deleteKnowledgeDocument } from '../ai/rag.js';
import { sendError, validateOrThrow, paginationSchema } from '../lib/http.js';

export default async function ragRoutes(fastify) {
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });

  fastify.get('/search', async (request, reply) => {
    const q = String(request.query?.q ?? '').trim();
    if (!q) return sendError(reply, 400, 'validation_error', 'Параметр q обязателен');
    const limit = Number(request.query?.limit ?? 8);
    const hits = await retrieve({ query: q, limit: Math.min(20, Math.max(1, limit)), userId: request.user.id });
    return { data: hits, count: hits.length };
  });

  fastify.get('/documents', async (request, reply) => {
    const { limit, offset } = paginationSchema.parse(request.query ?? {});
    const source = String(request.query?.source ?? '');
    let sql = "SELECT * FROM knowledge_documents WHERE status = 'active' AND (visibility = 'public' OR owner_id = ?)";
    const params = [request.user.id];
    if (source) { sql += ' AND source = ?'; params.push(source); }
    sql += ' ORDER BY retrieved_at DESC LIMIT ? OFFSET ?';
    const rows = db().prepare(sql).all(...params, limit, offset);
    return { data: rows, limit, offset };
  });

  fastify.post('/ingest', async (request, reply) => {
    const isAdmin = request.user.role === 'admin';
    const body = validateOrThrow(
      z.object({
        source: z.enum(['fns', 'law', 'trud', 'msp', 'manual', 'user']),
        source_name: z.string().min(2).max(200),
        source_url: z.string().url().nullable().optional(),
        title: z.string().min(3).max(400),
        text: z.string().min(50).max(200000),
        content_type: z.enum(['text', 'html']).default('text'),
        published_at: z.coerce.number().int().nullable().optional(),
        effective_at: z.coerce.number().int().nullable().optional(),
      }),
      request.body,
      reply
    );
    if (!body) return;

    // Official government sources are admin-curated; a user can only add own docs.
    if (['fns', 'law', 'trud', 'msp'].includes(body.source) && !isAdmin) {
      return sendError(reply, 403, 'forbidden', 'Официальные источники пополняются администратором');
    }

    const visibility = body.source === 'user' ? 'user' : 'public';
    const out = await ingestDocument({
      source: body.source,
      sourceName: body.source_name,
      sourceUrl: body.source_url ?? null,
      title: body.title,
      text: body.text,
      contentType: body.content_type,
      publishedAt: body.published_at ?? null,
      effectiveAt: body.effective_at ?? null,
      visibility,
      ownerId: body.source === 'user' ? request.user.id : null,
    });
    reply.code(201).send(out);
  });

  fastify.delete('/documents/:id', async (request, reply) => {
    const row = db().prepare('SELECT owner_id, visibility FROM knowledge_documents WHERE id = ?').get(request.params.id);
    if (!row) return sendError(reply, 404, 'not_found', 'Документ не найден');
    const owns = row.owner_id === request.user.id;
    if (row.visibility !== 'public' && !owns && request.user.role !== 'admin') {
      return sendError(reply, 403, 'forbidden', 'Нет доступа');
    }
    deleteKnowledgeDocument(request.params.id);
    reply.send({ ok: true });
  });
}
