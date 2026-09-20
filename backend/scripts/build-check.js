/**
 * Build check (§50): verifies the backend compiles/loads and every route
 * module is importable — a cheap structural gate before running tests.
 * Also prints the route table so the API surface is reviewable.
 */
import { buildServer } from '../src/server.js';
import { closeDb } from '../src/db/client.js';

const ok = [];
const fail = [];

async function check(name, fn) {
  try {
    await fn();
    ok.push(name);
  } catch (err) {
    fail.push(`${name}: ${err.message}`);
  }
}

async function main() {
  const fastify = await buildServer();
  await fastify.ready();

  await check('server boots', () => {
    if (!fastify.server) throw new Error('no server');
  });

  const routes = [];
  for (const r of fastify.printRoutes({ commonPrefix: false }).split('\n')) {
    const trimmed = r.trim();
    if (trimmed && /(GET|POST|PUT|PATCH|DELETE)/.test(trimmed)) routes.push(trimmed.replace(/\s+/g, ' '));
  }
  await check('route table populated', () => {
    if (routes.length < 30) throw new Error(`only ${routes.length} routes`);
  });

  // Smoke: public health route responds.
  await check('health responds 200', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/health' });
    const body = res.json();
    if (res.statusCode !== 200 || body.status !== 'ok') {
      throw new Error(`health unhealthy: ${res.statusCode} ${JSON.stringify(body.checks)}`);
    }
    if (body.migrations?.pending?.length) throw new Error('pending migrations');
  });

  // Smoke: protected route rejects anonymous access.
  await check('protected route 401', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/v1/clients' });
    if (res.statusCode !== 401) throw new Error(`expected 401, got ${res.statusCode}`);
  });

  console.log(`\n✅ ${ok.length} checks passed`);
  if (fail.length) {
    console.error(`❌ ${fail.length} checks failed:`);
    for (const f of fail) console.error(`  - ${f}`);
  }
  console.log(`\n📡 ${routes.length} routes:\n  ${routes.slice(0, 12).join('\n  ')}\n  …`);
  await fastify.close();
  closeDb();
  process.exit(fail.length ? 1 : 0);
}

main().catch((err) => {
  console.error('Build check crashed:', err);
  process.exit(1);
});
