/**
 * Fastify bootstrap — the single API for web + Android (§6, §42).
 *
 *   POST   /api/v1/auth/...
 *   GET    /api/v1/health
 *   ...    /api/v1/<domain>/...
 *
 * Serves the built web SPA from /web/dist in production (single deployment
 * unit), plus generated/signed documents from STORAGE_DIR.
 */
import { mkdirSync, existsSync } from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import cookie from '@fastify/cookie';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config, isServerless } from './config.js';
import { db, closeDb } from './db/client.js';
import { migrate } from './db/migrate.js';
import authPlugin from './auth/plugin.js';

import healthRoutes from './routes/health.js';
import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import clientRoutes from './routes/clients.js';
import companyRoutes from './routes/companies.js';
import leadRoutes from './routes/leads.js';
import dealRoutes from './routes/deals.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import calendarRoutes from './routes/calendar.js';
import documentRoutes from './routes/documents.js';
import invoiceRoutes from './routes/invoices.js';
import paymentRoutes from './routes/payments.js';
import marketplaceRoutes from './routes/marketplace.js';
import vacancyRoutes from './routes/vacancies.js';
import courseRoutes from './routes/courses.js';
import grantRoutes from './routes/grants.js';
import competitorRoutes from './routes/competitors.js';
import notificationRoutes, { flushAllDueReminders } from './routes/notifications.js';
import ragRoutes from './routes/rag.js';
import aiRoutes from './routes/ai.js';
import ttsRoutes from './routes/tts.js';
import adminRoutes from './routes/admin.js';
import crmSyncRoutes from './routes/crmSync.js';
import assistantRoutes from './routes/assistant.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const WEB_DIST = resolve(__dirname, '../../web/dist');

export async function buildServer() {
  mkdirSync(config.STORAGE_DIR, { recursive: true });

  const fastify = Fastify({
    logger: {
      level: config.isProd ? 'info' : 'info',
      ...(config.isTest ? { level: 'silent' } : {}),
    },
    bodyLimit: 25 * 1024 * 1024,
    ajv: { customOptions: { removeAdditional: 'all' } },
    trustProxy: process.env.TRUST_PROXY === '1' ? 1 : false,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        styleSrcAttr: ["'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", config.WEB_ORIGIN, "https://mir-samozanyatykh-api-frankfurt.onrender.com"],
        fontSrc: ["'self'", "data:", "https:"],
        workerSrc: ["'self'", "blob:"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await fastify.register(cookie, { secret: config.JWT_SECRET });
  await fastify.register(cors, {
    origin: config.corsOrigins.length ? config.corsOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    keyGenerator: (req) => `${req.ip}:${req.routerPath ?? ''}`,
    onExceeded: (req) => {
      req.log.warn({ ip: req.ip, path: req.url }, 'rate limit exceeded');
    },
  });

  await fastify.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 5 },
  });

  await fastify.register(
    async (api) => {
      api.register(authPlugin);
      api.register(healthRoutes);
      api.register(publicRoutes, { prefix: '/public' });
      api.register(authRoutes);
      api.register(profileRoutes, { prefix: '/profile' });
      api.register(clientRoutes, { prefix: '/clients' });
      api.register(companyRoutes, { prefix: '/companies' });
      api.register(leadRoutes, { prefix: '/leads' });
      api.register(dealRoutes, { prefix: '/deals' });
      api.register(projectRoutes, { prefix: '/projects' });
      api.register(taskRoutes, { prefix: '/tasks' });
      api.register(calendarRoutes, { prefix: '/calendar' });
      api.register(documentRoutes, { prefix: '/documents' });
      api.register(invoiceRoutes, { prefix: '/invoices' });
      api.register(paymentRoutes, { prefix: '/payments' });
      api.register(marketplaceRoutes, { prefix: '/marketplace' });
      api.register(vacancyRoutes, { prefix: '/vacancies' });
      api.register(courseRoutes, { prefix: '/courses' });
      api.register(grantRoutes, { prefix: '/grants' });
      api.register(competitorRoutes, { prefix: '/competitors' });
      api.register(notificationRoutes, { prefix: '/notifications' });
      api.register(ragRoutes, { prefix: '/rag' });
      api.register(aiRoutes, { prefix: '/ai' });
      api.register(ttsRoutes, { prefix: '/tts' });
      api.register(adminRoutes, { prefix: '/admin' });
      api.register(crmSyncRoutes, { prefix: '/crm' });
      api.register(assistantRoutes, { prefix: '/assistant' });
    },
    { prefix: '/api/v1' }
  );

  // Generated documents are served only through the authenticated download route.
  if (!config.isServerless && existsSync(WEB_DIST)) {
    const { default: fastifyStatic } = await import('@fastify/static');
    await fastify.register(fastifyStatic, {
      root: WEB_DIST,
      prefix: '/',
      wildcard: false,
    });
    fastify.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/storage/')) {
        return reply.code(404).send({ error: 'not_found', message: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  } else {
    fastify.setNotFoundHandler((req, reply) =>
      reply.code(404).send({ error: 'not_found', message: 'Not found' })
    );
  }

  fastify.addHook('onError', async (request, reply, error) => {
    request.log.error({ err: error, url: request.url }, 'request error');
  });

  return fastify;
}

/** Run migrations + start listening for long-running non-serverless deployments. */
export async function startServer() {
  migrate(db());
  const fastify = await buildServer();
  await fastify.listen({ port: config.PORT, host: config.HOST });
  fastify.log.info(`API ready on http://${config.HOST}:${config.PORT}`);

  const reminderTimer = setInterval(() => {
    try {
      const promoted = flushAllDueReminders();
      if (promoted) fastify.log.info({ promoted }, 'due reminders promoted');
    } catch (err) {
      fastify.log.error({ err }, 'reminder worker failed');
    }
  }, 30_000);
  reminderTimer.unref?.();

  const shutdown = async (signal) => {
    clearInterval(reminderTimer);
    fastify.log.info({ signal }, 'shutting down');
    await fastify.close();
    closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return fastify;
}

// The native Vercel Fastify runtime consumes the exported app instance.
let vercelApp = null;
if (isServerless) {
  migrate(db());
  try {
    const { seedBase } = await import('./db/seed.js');
    await seedBase();
  } catch (error) {
    console.error('Base seed failed (API continues without it):', error);
  }
  vercelApp = await buildServer();
  await vercelApp.ready();
}
export default vercelApp;

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  startServer().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}
