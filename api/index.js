/**
 * Vercel entrypoint for the full Fastify API.
 *
 * vercel.json переписывает все запросы /api/* на эту функцию (/api). Исходный
 * путь остаётся в req.url, поэтому маршруты Fastify /api/v1/* работают как есть.
 * Опциональный catch-all [[...path]] вне Next.js Vercel не маршрутизирует (404).
 *
 * Бэкенд загружается динамически, чтобы ошибка запуска (переменные окружения,
 * база, файлы схемы) не роняла функцию молча с FUNCTION_INVOCATION_FAILED,
 * а возвращала понятный JSON и писала причину в логи Vercel.
 * fastify.listen() не вызываем: HTTP-жизненным циклом управляет Vercel.
 */
let appPromise;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const { buildServer } = await import('../backend/src/server.js');
      const { db } = await import('../backend/src/db/client.js');
      const { migrate } = await import('../backend/src/db/migrate.js');
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

/** Подробности ошибки показываем только вне production-деплоя Vercel. */
export function startupErrorBody(error, env = process.env) {
  const body = { error: 'startup_failed', message: 'Сервер «Мира Самозанятых» не смог запуститься. Подробности — в логах функции.' };
  if (env.VERCEL_ENV !== 'production') {
    body.detail = String(error?.message || error).slice(0, 500);
    if (error?.code) body.code = String(error.code);
  }
  return body;
}

export default async function handler(req, res) {
  let app;
  try {
    app = await getApp();
  } catch (error) {
    console.error('API startup failed:', error);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(startupErrorBody(error)));
    return;
  }
  app.server.emit('request', req, res);
}
