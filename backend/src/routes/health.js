/**
 * Health + readiness. Reports DB, migrations, and AI provider availability —
 * no secrets, so it is safe to expose publicly for monitoring.
 */
import { db } from '../db/client.js';
import { migrationStatus } from '../db/migrate.js';
import { config } from '../config.js';

export default async function healthRoutes(fastify) {
  fastify.get('/health', async (request, reply) => {
    const checks = { db: 'ok' };
    try {
      db().prepare('SELECT 1').get();
    } catch (err) {
      request.log.error({ err }, 'health: db check failed');
      checks.db = 'fail';
    }
    let migrations = null;
    try {
      migrations = migrationStatus();
    } catch (err) {
      request.log.error({ err }, 'health: migration status failed');
      checks.migrations = 'fail';
    }
    const healthy = checks.db === 'ok' && !checks.migrations;
    if (!healthy) reply.code(503);
    return {
      status: healthy ? 'ok' : 'degraded',
      service: 'mir-samozanyatyh-backend',
      version: '3.0.0',
      time: new Date().toISOString(),
      checks,
      migrations,
      // Temporary serverless preview without durable storage / fixed secret.
      storage: config.ephemeralDemo ? 'ephemeral_demo' : 'persistent',
      payment_provider: config.isProd && config.PAYMENT_PROVIDER === 'test'
        ? 'misconfigured_in_production'
        : config.PAYMENT_PROVIDER,
    };
  });

  fastify.get('/health/ready', async (request, reply) => {
    const report = await fastify.inject({ method: 'GET', url: '/api/v1/health' });
    const body = report.json();
    const ready = body.checks.db === 'ok' && Boolean(body.migrations) && body.migrations.pending.length === 0;
    reply.code(ready ? 200 : 503).send({ ready, checks: body.checks });
  });
}
