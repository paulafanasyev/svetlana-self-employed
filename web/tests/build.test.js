import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../', import.meta.url));

// Регрессия: production-сборка сайта должна собираться (её проверяет Vercel).
test('vite build собирает сайт без ошибок, плейсхолдеров и с отдельными чанками кабинета', { timeout: 240000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'web-dist-'));
  const vite = [join(webRoot, 'node_modules/vite/bin/vite.js'), join(webRoot, '../node_modules/vite/bin/vite.js')].find((p) => existsSync(p));
  assert.ok(vite, 'vite не установлен');
  const r = spawnSync(process.execPath, [vite, 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], {
    cwd: webRoot,
    env: { ...process.env, NODE_ENV: 'production', VITE_PUBLIC_ORIGIN: '' },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, (r.stderr || '') + (r.stdout || ''));
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /%VITE_|%BASE_URL%/);
  assert.match(html, /xn----8sba1acxdkgqms3b9euc\.xn--p1ai|https:\/\//);
  const assets = readdirSync(join(out, 'assets'));
  assert.ok(assets.some((f) => /^CrmCabinet-.*\.js$/.test(f)), 'CRM кабинета вынесен в отдельный чанк: ' + assets.join(','));
  assert.ok(existsSync(join(out, 'svetlana-face.jpg')));
});
