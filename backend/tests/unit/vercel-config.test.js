import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findSchemaDir } from '../../src/db/migrate.js';

const backendRoot = fileURLToPath(new URL('../../', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function loadConfigIn(env) {
  const script = "const { config } = await import('./src/config.js'); console.log(JSON.stringify({ db: config.DB_PATH, st: config.STORAGE_DIR, eph: config.ephemeralDemo, len: config.JWT_SECRET.length, cors: config.corsOrigins, web: config.WEB_ORIGIN }));";
  const base = { PATH: process.env.PATH, NODE_ENV: 'production', HOME: mkdtempSync(join(tmpdir(), 'cfg-')) };
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: backendRoot, env: { ...base, ...env }, encoding: 'utf8' });
}

test('Vercel без переменных: не падает, пишет только во временную папку, режим ephemeral_demo', () => {
  const r = loadConfigIn({ VERCEL: '1', VERCEL_URL: 'mir-abc.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'mir.vercel.app' });
  assert.equal(r.status, 0, r.stderr);
  const c = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.ok(c.db.startsWith(tmpdir()), c.db);
  assert.ok(c.st.startsWith(tmpdir()), c.st);
  assert.equal(c.eph, true);
  assert.ok(c.len >= 64);
  assert.equal(c.web, 'https://mir.vercel.app');
  assert.ok(c.cors.includes('https://mir-abc.vercel.app'));
});

test('Vercel с заданными переменными: используются они, не demo', () => {
  const r = loadConfigIn({ VERCEL: '1', JWT_SECRET: 'x'.repeat(40), DB_PATH: '/tmp/fixed.sqlite', STORAGE_DIR: '/tmp/fixed-st' });
  assert.equal(r.status, 0, r.stderr);
  const c = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.equal(c.db, '/tmp/fixed.sqlite');
  assert.equal(c.eph, false);
  assert.equal(c.len, 40);
});

test('вне Vercel без JWT_SECRET процесс по-прежнему останавливается (безопасность не ослаблена)', () => {
  const r = loadConfigIn({});
  assert.notEqual(r.status, 0);
});

test('папка миграций находится; при её отсутствии — понятная ошибка', () => {
  assert.match(findSchemaDir(), /schema$/);
  assert.throws(() => findSchemaDir(['/nope/a', '/nope/b']), /not packaged/);
});

test('vercel.json: функция API существует и все /api/* ведут на неё раньше SPA', () => {
  const vc = JSON.parse(readFileSync(join(repoRoot, 'vercel.json'), 'utf8'));
  for (const fn of Object.keys(vc.functions || {})) {
    assert.ok(!fn.includes('[['), `опциональный catch-all вне Next.js Vercel не маршрутизирует: ${fn}`);
    assert.ok(existsSync(join(repoRoot, fn)), `нет файла функции ${fn}`);
  }
  const api = vc.rewrites.findIndex((r) => r.source === '/api/(.*)' && r.destination === '/api');
  const spa = vc.rewrites.findIndex((r) => r.destination === '/index.html');
  assert.ok(api >= 0 && api < spa, 'rewrite /api/(.*) → /api должен идти раньше SPA');
});
