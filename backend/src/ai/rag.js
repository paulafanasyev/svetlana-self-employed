/**
 * RAG (§29): ingestion → chunking → embeddings → retrieval → reranking →
 * citations, with freshness/versioning and permission boundaries.
 *
 * Sources (§18): ФНС, законы, Работа России, МСП, региональные программы,
 * user documents. Every fact carries source / published / effective /
 * retrieved dates + URL, so answers can cite what they claim.
 */
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { embed, cosine } from './embeddings.js';

const CHUNK_SIZE = 900; // characters — keeps Russian legal text coherent
const CHUNK_OVERLAP = 150;

/** Split long text into overlapping chunks at paragraph boundaries. */
export function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const clean = String(text ?? '').trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const paragraphs = clean.split(/\n\s*\n/);
  const chunks = [];
  let cur = '';
  for (const p of paragraphs) {
    if ((cur + '\n\n' + p).length > size && cur) {
      chunks.push(cur);
      // Seed the next chunk with overlap for context continuity.
      cur = cur.slice(-overlap) + '\n\n' + p;
    } else {
      cur = cur ? `${cur}\n\n${p}` : p;
    }
    while (cur.length > size) {
      chunks.push(cur.slice(0, size));
      cur = cur.slice(size - overlap);
    }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

/**
 * Ingest a document into the knowledge base.
 * @param {object} doc { source, sourceName, sourceUrl, title, contentType, text, publishedAt, effectiveAt, visibility, ownerId }
 */
export async function ingestDocument(doc) {
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);
  const text = doc.text ?? doc.content ?? '';
  db().transaction(() => {
    db()
      .prepare(`INSERT INTO knowledge_documents (id, source, source_name, source_url, title, content_type,
                                                  published_at, effective_at, retrieved_at, version, status, visibility, owner_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', ?, ?)`)
      .run(id, doc.source, doc.sourceName, doc.sourceUrl ?? null, doc.title, doc.contentType ?? 'text',
        doc.publishedAt ?? null, doc.effectiveAt ?? null, now, doc.visibility ?? 'public', doc.ownerId ?? null);
    const stmt = db()
      .prepare(`INSERT INTO knowledge_chunks (id, document_id, position, text, embedding, token_count)
                VALUES (?, ?, ?, ?, ?, ?)`);
    const chunks = chunkText(text);
    for (let i = 0; i < chunks.length; i++) {
      stmt.run(nanoid(), id, i, chunks[i], '', Math.ceil(chunks[i].length / 4));
    }
  });

  // Embed asynchronously and persist vectors (no external call inside the txn).
  const chunks = db().prepare('SELECT id, text FROM knowledge_chunks WHERE document_id = ?').all(id);
  let method = 'none';
  for (const ch of chunks) {
    const embedded = await embed(ch.text);
    method = embedded.method;
    db()
      .prepare('UPDATE knowledge_chunks SET embedding = ? WHERE id = ?')
      .run(JSON.stringify(embedded.vector), ch.id);
  }
  return { id, chunks: chunks.length, method };
}

/**
 * Retrieve relevant chunks with permission filtering + freshness preference.
 * @returns {Array<{chunk, document, score, quote}>}
 */
export async function retrieve({ query, limit = 8, userId = null, sources = null, minScore = 0.05 }) {
  const { vector } = await embed(query);
  let rows = db()
    .prepare(`SELECT c.id AS chunk_id, c.position, c.text, c.document_id,
                     d.source, d.source_name, d.source_url, d.title, d.published_at, d.effective_at,
                     d.retrieved_at, d.version, d.visibility, d.owner_id
              FROM knowledge_chunks c
              JOIN knowledge_documents d ON d.id = c.document_id
              WHERE d.status = 'active'`)
    .all();
  // Permission boundary (§29): private docs only visible to their owner.
  rows = rows.filter((r) =>
    r.visibility === 'public' ||
    (userId && (r.visibility === 'user' || r.visibility === 'private') && r.owner_id === userId)
  );
  if (sources) rows = rows.filter((r) => sources.includes(r.source));

  const scored = [];
  const getEmbedding = db().prepare('SELECT embedding FROM knowledge_chunks WHERE id = ?');
  for (const r of rows) {
    const vec = JSON.parse(getEmbedding.get(r.chunk_id)?.embedding ?? 'null');
    if (!vec) continue;
    const score = cosine(vector, vec);
    if (score >= minScore) scored.push({ ...r, score });
  }

  scored.sort((a, b) => b.score - a.score);
  // Reranking: small boost for official sources and recent retrieval (freshness).
  for (const r of scored) {
    if (['fns', 'law', 'trud', 'msp'].includes(r.source)) r.score += 0.03;
    if (r.retrieved_at && r.retrieved_at > Math.floor(Date.now() / 1000) - 60 * 86400) r.score += 0.01;
  }
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((r) => ({
    chunk: { id: r.chunk_id, position: r.position, text: r.text },
    document: {
      id: r.document_id,
      source: r.source,
      sourceName: r.source_name,
      sourceUrl: r.source_url,
      title: r.title,
      publishedAt: r.published_at,
      effectiveAt: r.effective_at,
      retrievedAt: r.retrieved_at,
      version: r.version,
    },
    score: Number(r.score.toFixed(4)),
    quote: r.text.slice(0, 260),
  }));
}

/** Soft-delete a document from the index (§29 deletion). */
export function deleteKnowledgeDocument(id) {
  db().prepare("UPDATE knowledge_documents SET status = 'deleted' WHERE id = ?").run(id);
  return { id, status: 'deleted' };
}

/** Supersede: mark old versions when a fresher copy of the same doc arrives. */
export function supersedeByTitleAndSource({ title, source, sourceUrl }) {
  db()
    .prepare(`UPDATE knowledge_documents SET status = 'superseded'
              WHERE title = ? AND source = ? AND COALESCE(source_url,'') = COALESCE(?, source_url)
              AND status = 'active'`)
    .run(title, source, sourceUrl ?? null);
}
