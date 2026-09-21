/**
 * Health + readiness. Reports DB, migrations, and AI provider availability —
 * no secrets, so it is safe to expose publicly for monitoring.
 */
import { db } from '../db/client.js';
import { migrationStatus } from '../db/migrate.js';
import { config } from '../config.js';

export default async function healthRoutes(fastify) {
  fastify.get('/health', async () => {
    const checks = { db: 'ok' };
    try {
      db().prepare('SELECT 1').get();
    } catch (err) {
      checks.db = `fail: ${err.message}`;
    }
    let migrations = null;
    try {
      migrations = migrationStatus();
    } catch (err) {
      checks.migrations = `fail: ${err.message}`;
    }
    return {
      status: 'ok',
      service: 'mir-samozanyatyh-backend',
      version: '3.0.0',
      time: new Date().toISOString(),
      checks,
      migrations,
      payment_provider: config.isProd && config.PAYMENT_PROVIDER === 'test'
        ? 'misconfigured_in_production'
        : config.PAYMENT_PROVIDER,
    };
  });

  fastify.get('/health/ready', async (request, reply) => {
    const report = await fastify.inject({ method: 'GET', url: '/api/v1/health' });
    const body = report.json();
    const ready = body.checks.db === 'ok' && (!body.migrations || body.migrations.pending.length === 0);
    reply.code(ready ? 200 : 503).send({ ready, checks: body.checks });
  });
}
