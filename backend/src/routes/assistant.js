/**
 * Единая Светлана для всех сайтов (сервер-сервер).
 *
 *   GET  /api/v1/assistant/sites              → список профилей (без секретов)
 *   POST /api/v1/assistant/:site/chat         → { content, site }
 *        заголовок: Authorization: Bearer <ключ сайта>
 *        тело: { message, history?: [{ role: 'user'|'assistant', content }] }
 *
 * Ключ сайта лежит только на сервере сайта (Vercel/VPS), в браузер не попадает:
 *   ASSISTANT_KEY_MIR, ASSISTANT_KEY_AIKO, ASSISTANT_KEY_ZARYADKA,
 *   ASSISTANT_KEY_REPETITOR, ASSISTANT_KEY_SVETLANA2
 * Нет ключа в окружении — профиль выключен (503), а не открыт для всех.
 */
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { chatWithFallback } from '../ai/providers.js';
import { SITES, SITE_IDS, redactPersonal, tidyForChild } from '../ai/sites.js';

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(4000),
  })).max(10).default([]),
});

export function siteKey(site, env = process.env) {
  return env[`ASSISTANT_KEY_${site.toUpperCase()}`] || '';
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export default async function assistantRoutes(fastify) {
  fastify.get('/sites', async () => ({
    data: SITE_IDS.map((id) => ({ id, title: SITES[id].title, enabled: Boolean(siteKey(id)), full_mode: Boolean(SITES[id].fullMode) })),
  }));

  fastify.post('/:site/chat', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const site = SITES[request.params.site];
    if (!site) return reply.code(404).send({ error: 'unknown_site', message: 'Такого сайта нет' });
    const need = siteKey(request.params.site);
    if (!need) return reply.code(503).send({ error: 'site_disabled', message: 'Светлана для этого сайта не подключена' });
    const got = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!got || !sameSecret(got, need)) return reply.code(401).send({ error: 'unauthorized', message: 'Неверный ключ сайта' });

    const body = bodySchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'validation_error', message: 'Некорректное сообщение' });

    const clean = site.fullMode ? (s) => s : redactPersonal;
    try {
      const result = await chatWithFallback({
        messages: [
          { role: 'system', content: site.prompt() },
          ...body.data.history.slice(-10).map((m) => ({ role: m.role, content: clean(m.content) })),
          { role: 'user', content: clean(body.data.message) },
        ],
        tools: [],
        temperature: site.temperature,
        maxTokens: site.maxTokens,
      });
      let content = site.enforce(result.content);
      if (site.child) content = tidyForChild(content);
      return { site: request.params.site, content: content || 'Не получилось ответить. Попробуйте ещё раз.' };
    } catch (err) {
      request.log.error({ err, site: request.params.site }, 'assistant chat failed');
      return reply.code(503).send({ error: 'ai_unavailable', message: 'Светлана временно недоступна' });
    }
  });
}
