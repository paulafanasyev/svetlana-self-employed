/**
 * Vercel entrypoint for the backend Fastify API.
 * Vercel owns the HTTP lifecycle; Fastify is built once per function instance.
 */
let appPromise;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const { buildServer } = await import('../src/server.js');
      const { db } = await import('../src/db/client.js');
      const { migrate } = await import('../src/db/migrate.js');

      migrate(db());

      // Idempotent system data required by a newly created database.
      try {
        const { seedBase } = await import('../src/db/seed.js');
        await seedBase();
      } catch (error) {
        console.error('Base seed failed (API continues without it):', error);
      }

      const app = await buildServer();
      await app.ready();
      return app;
    })().catch((error) => {
      appPromise = undefined;
      throw error;
    });
  }
  return appPromise;
}

function startupErrorBody(error, env = process.env) {
  const body = {
    error: 'startup_failed',
    message: 'Backend startup failed. See Vercel function logs for details.',
  };
  if (env.VERCEL_ENV !== 'production') {
    body.detail = String(error?.message || error).slice(0, 500);
    if (error?.code) body.code = String(error.code);
  }
  return body;
}

export default async function handler(req, res) {
  try {
    const app = await getApp();
    app.server.emit('request', req, res);
  } catch (error) {
    console.error('API startup failed:', error);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(startupErrorBody(error)));
  }
}
