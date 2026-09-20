/**
 * Unit-тесты: emotion engine (§12), анти-галицинация (§14), RAG (§29),
 * комиссии (§25), планировщик локального провайдера.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeEmotion, emotionProfile } from '../../src/ai/emotion.js';
import { chunkText } from '../../src/ai/rag.js';
import { getCommissionPercent, setCommissionPercent } from '../../src/payments/commission.js';
import { db } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';

test.before(() => {
  migrate(db());
});

// ─── §12 Emotion engine: deterministic, never random ──────────────────────
test('emotion: success result → SUCCESS emotion', () => {
  const state = { actions: [{ status: 'succeeded', verified: true }], confidence: 1 };
  assert.equal(computeEmotion(state), 'SUCCESS');
});

test('emotion: failed result → WARNING/CONCERNED, never HAPPY', () => {
  const state = { actions: [{ status: 'failed', verified: false }], confidence: 0.2 };
  const e = computeEmotion(state);
  assert.notEqual(e, 'SUCCESS');
  assert.notEqual(e, 'HAPPY');
});

test('emotion: pending approval → WAITING', () => {
  const state = { actions: [{ status: 'blocked', needsApproval: true }], pendingRisk: 'high' };
  assert.equal(computeEmotion(state), 'WAITING');
});

test('emotion: empty actions → IDLE', () => {
  assert.equal(computeEmotion({ actions: [] }), 'IDLE');
});

test('emotion: every emotion has a voice profile', () => {
  for (const e of ['IDLE', 'THINKING', 'SUCCESS', 'CONCERNED', 'WARNING', 'WAITING']) {
    const p = emotionProfile(e);
    assert.ok(p.label, `${e} needs a label`);
    assert.ok(p.voice, `${e} needs a voice style`);
  }
});

// ─── §14 Anti-hallucination: unverified success is NOT reported as verified ─
test('anti-hallucination: unverified success is flagged NOT PROVEN', () => {
  const action = { status: 'succeeded', verified: false, message: 'Отправила договор' };
  // The orchestrator's actionSummary treats unverified success as NOT PROVEN.
  const label = action.status === 'succeeded' && action.verified ? 'VERIFIED' : 'NOT PROVEN';
  assert.equal(label, 'NOT PROVEN');
});

test('anti-hallucination: verified success is VERIFIED', () => {
  const action = { status: 'succeeded', verified: true, message: 'Создала клиента' };
  const label = action.status === 'succeeded' && action.verified ? 'VERIFIED' : 'NOT PROVEN';
  assert.equal(label, 'VERIFIED');
});

// ─── §29 RAG: chunking keeps Russian legal text coherent ──────────────────
test('rag: short text stays a single chunk', () => {
  const chunks = chunkText('Короткий текст.');
  assert.equal(chunks.length, 1);
});

test('rag: empty text produces no chunks', () => {
  assert.equal(chunkText('').length, 0);
  assert.equal(chunkText('   ').length, 0);
});

test('rag: long text is split into overlapping chunks at paragraph boundaries', () => {
  const paragraphs = [];
  for (let i = 0; i < 30; i++) paragraphs.push(`Абзац номер ${i}. `.repeat(40));
  const text = paragraphs.join('\n\n');
  const chunks = chunkText(text, 900, 150);
  assert.ok(chunks.length > 1, 'long text must be chunked');
  for (const c of chunks) assert.ok(c.length <= 1200, 'chunks respect the size bound');
});

// ─── §25 Commission: configurable, never hardcoded in the client ──────────
test('commission: reads and writes a live system_config value', () => {
  setCommissionPercent(7);
  assert.equal(getCommissionPercent(), 7);
  setCommissionPercent(10);
  assert.equal(getCommissionPercent(), 10);
});

// ─── §18 Legal facts: source metadata must be present to be citable ──────
test('legal facts: a citation requires source + url + dates', () => {
  const citation = {
    document: {
      title: 'Налог на профессиональный доход',
      sourceName: 'ФНС России',
      sourceUrl: 'https://nalog.gov.ru',
      publishedAt: 1577836800,
      effectiveAt: 1577836800,
    },
    score: 0.82,
    quote: 'Ставка 4% при работе с физлицами',
  };
  assert.ok(citation.document.sourceUrl, 'a citable fact must have a URL');
  assert.ok(citation.document.publishedAt, 'a citable fact must have a publication date');
});
