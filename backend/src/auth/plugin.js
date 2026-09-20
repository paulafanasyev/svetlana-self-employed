/**
 * Authentication plugin.
 *
 *   fastify.register(authPlugin)
 *   fastify.get('/me', { preValidation: [fastify.requireAuth] }, handler)
 *   fastify.get('/admin', { preValidation: [fastify.requireAuth, fastify.requireRole('admin')] }, handler)
 *
 * Reads the access token from the Authorization: Bearer header. On success
 * `request.user` is `{ id, email, role, status }`.
 */
import fp from 'fastify-plugin';
import { verifyAccessToken } from './crypto.js';
import { db } from '../db/client.js';

/**
 * Registered with fastify-plugin so the decorators land on the parent scope and
 * every sibling route plugin can see `fastify.requireAuth` / `request.user`.
 */
export default fp(async function authPlugin(fastify) {
  fastify.decorateRequest('user', null);

  fastify.decorate('authenticate', async (request) => {
    const header = request.headers.authorization;
    if (!header) return null;
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m) return null;
    const claims = verifyAccessToken(m[1].trim());
    if (!claims?.sub) return null;

    // Access decisions use current DB state, not stale JWT role/status claims.
    const user = db()
      .prepare('SELECT id, email, role, status FROM users WHERE id = ?')
      .get(claims.sub);
    if (!user || user.status !== 'active') return null;
    return user;
  });

  fastify.decorate('requireAuth', async (request, reply) => {
    const claims = await fastify.authenticate(request);
    if (!claims) {
      reply.code(401).send({ error: 'unauthorized', message: 'Требуется вход в систему' });
      return reply;
    }
    request.user = { id: claims.id, email: claims.email, role: claims.role, status: claims.status };
    return request.user;
  });

  fastify.decorate('requireRole', (...roles) => async (request, reply) => {
    if (!request.user) {
      reply.code(401).send({ error: 'unauthorized', message: 'Требуется вход в систему' });
      return reply;
    }
    if (!roles.includes(request.user.role)) {
      reply.code(403).send({ error: 'forbidden', message: 'Недостаточно прав' });
      return reply;
    }
    return request.user;
  });

  fastify.decorate('optionalAuth', async (request) => {
    const claims = await fastify.authenticate(request);
    if (claims) request.user = { id: claims.id, email: claims.email, role: claims.role, status: claims.status };
    return request.user;
  });
}, { name: 'mir-auth', fastify: '5.x' });

/** Guard every CRM-style route against IDOR: the row must belong to the user. */
export function ownershipGuard(request, reply, row) {
  if (!row) {
    reply.code(404).send({ error: 'not_found', message: 'Не найдено' });
    return false;
  }
  if (row.owner_id && row.owner_id !== request.user.id) {
    reply.code(403).send({ error: 'forbidden', message: 'Нет доступа к этому объекту' });
    return false;
  }
  return true;
}
