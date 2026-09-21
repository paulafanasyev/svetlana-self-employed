import { buildServer } from '../backend/src/server.js';
import { db } from '../backend/src/db/client.js';
import { migrate } from '../backend/src/db/migrate.js';

let appPromise;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      migrate(db());
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

/**
 * Vercel entrypoint for the full Fastify API.
 *
 * The original Fastify routes remain unchanged under /api/v1/*.
 * We deliberately do not call fastify.listen(): Vercel owns the HTTP
 * lifecycle and forwards the Node request/response pair to Fastify.
 */
export default async function handler(req, res) {
  const app = await getApp();
  app.server.emit('request', req, res);
}

export const config = {
  api: {
    bodyParser: false,
  },
};
