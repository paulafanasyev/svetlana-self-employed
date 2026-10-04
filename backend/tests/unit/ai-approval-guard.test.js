import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('approved_tool не принимается из /ai/chat', () => {
  assert.ok(!/approvedTool:\s*body\.approved_tool/.test(read('../../src/routes/ai.js')));
});

test('not_proven отражается в orchestrator', () => {
  assert.match(read('../../src/ai/orchestrator.js'), /a\.status === 'not_proven'/);
});
