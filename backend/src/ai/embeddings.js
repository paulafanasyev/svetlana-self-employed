/**
 * Embeddings for RAG (§29).
 *
 * With a provider configured (atria/openai), real vector embeddings are used.
 * Otherwise a deterministic hash-based bag-of-words vector is produced — real
 * lexical retrieval (not random), with cosine similarity over the same
 * interface. Cyrillic is normalized so morphology-ish overlap still scores.
 */
import { config } from '../config.js';
import { db } from '../db/client.js';

const STOP = new Set([
  'и', 'в', 'во', 'не', 'что', 'он', 'на', 'я', 'с', 'со', 'как', 'а', 'то', 'все', 'она', 'так',
  'его', 'но', 'да', 'ты', 'к', 'у', 'же', 'вы', 'за', 'бы', 'по', 'только', 'ее', 'мне', 'было',
  'вот', 'от', 'меня', 'есть', 'для', 'при', 'the', 'a', 'an', 'is', 'are', 'of', 'to', 'in', 'on',
]);

function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, ' ')
    .split(' ')
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * Deterministic hash-bag vector. Tokens are hashed into a fixed dimension and
 * accumulated with L2 normalization, so cosine similarity is meaningful.
 */
function hashBagEmbedding(text, dim = config.EMBEDDING_DIM) {
  const vec = new Float32Array(dim);
  const tokens = tokenize(text);
  const counts = new Map();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const [token, count] of counts) {
    const h = hash32(token);
    vec[Math.abs(h) % dim] += count * (1 + (h % 3) / 10);
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < dim; i++) vec[i] /= norm;
  return Array.from(vec);
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

export async function embed(text) {
  if (config.EMBEDDING_PROVIDER === 'none') {
    return { vector: hashBagEmbedding(text), method: 'hash_bag' };
  }
  try {
    const vector = await embedWithProvider(text);
    return { vector, method: config.EMBEDDING_PROVIDER };
  } catch (err) {
    // Degrade to local retrieval rather than failing the whole pipeline.
    return { vector: hashBagEmbedding(text), method: `fallback:${err.message}` };
  }
}

async function embedWithProvider(text) {
  const dim = config.EMBEDDING_DIM;
  const base = config.EMBEDDING_PROVIDER === 'openai' ? config.OPENAI_BASE_URL : config.ATRIA_BASE_URL;
  const key = config.EMBEDDING_PROVIDER === 'openai' ? config.OPENAI_API_KEY : config.ATRIA_API_KEY;
  if (!key) throw new Error('no api key');
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ input: String(text).slice(0, 8000), model: 'text-embedding-3-small' }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const v = json.data?.[0]?.embedding;
  if (!Array.isArray(v)) throw new Error('bad embedding response');
  // Pad/truncate to the configured dimension so vectors stay comparable.
  if (v.length === dim) return v;
  if (v.length > dim) return v.slice(0, dim);
  return [...v, ...new Array(dim - v.length).fill(0)];
}

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
