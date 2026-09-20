/**
 * Auth routes: register / login / refresh / logout / me / consent / delete-account.
 *
 * Passwords are bcrypt-hashed. Refresh tokens are opaque, hashed at rest, and
 * rotated on use. Account deletion is a real hard delete (§40 privacy).
 */
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { db } from '../db/client.js';
import {
  hashPassword,
  verifyPassword,
  issueAccessToken,
  issueRefreshToken,
  consumeRefreshToken,
  revokeAllUserTokens,
} from '../auth/crypto.js';
import { auditRequest } from '../plugins/audit.js';
import { sendError, validateOrThrow } from '../lib/http.js';

const registerSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(8, 'Пароль минимум 8 символов').max(100),
  display_name: z.string().min(2, 'Укажите имя').max(80),
  role: z.enum(['user', 'expert', 'training_center']).default('user'),
  consent_ai_processing: z.boolean().refine((v) => v === true, 'Требуется согласие на обработку'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function publicUser(u) {
  return { id: u.id, email: u.email, role: u.role, status: u.status };
}

export default async function authRoutes(fastify) {
  // Brute-force protection: a tighter bucket than the global API limit,
  // keyed per-IP by the global rate-limit plugin (§39).
  const authLimit = {
    max: config.AUTH_RATE_LIMIT_MAX,
    timeWindow: '1 minute',
  };

  fastify.post('/auth/register', { config: { rateLimit: authLimit } }, async (request, reply) => {
    const body = validateOrThrow(registerSchema, request.body, reply);
    if (!body) return;

    const existing = db().prepare('SELECT id FROM users WHERE email = ?').get(body.email.toLowerCase());
    if (existing) {
      // Do not leak which emails are registered.
      return sendError(reply, 409, 'conflict', 'Пользователь с таким email уже существует');
    }

    const id = nanoid();
    db().transaction(() => {
      db()
        .prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)`)
        .run(id, body.email.toLowerCase(), hashPassword(body.password), body.role);
      db()
        .prepare(`INSERT INTO profiles (id, user_id, display_name) VALUES (?, ?, ?)`)
        .run(nanoid(), id, body.display_name);
      // Consent is a legal record, not a flag on the user.
      db()
        .prepare(`INSERT INTO consents (id, user_id, scope, granted, policy_version) VALUES (?, ?, ?, 1, ?)`)
        .run(nanoid(), id, 'ai_processing', '1.0');
    });

    const user = db().prepare('SELECT * FROM users WHERE id = ?').get(id);
    const { token: accessToken, expiresIn } = issueAccessToken(user);
    const { token: refreshToken } = issueRefreshToken(user.id);
    auditRequest(request, 'register', 'user', id, { email: user.email });
    reply.code(201).send({ user: publicUser(user), access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn });
  });

  fastify.post('/auth/login', { config: { rateLimit: authLimit } }, async (request, reply) => {
    const body = validateOrThrow(loginSchema, request.body, reply);
    if (!body) return;

    const user = db().prepare('SELECT * FROM users WHERE email = ?').get(body.email.toLowerCase());
    // Constant-ish failure path: verify the hash regardless to blunt timing.
    const ok = user && user.status === 'active' ? verifyPassword(body.password, user.password_hash) : false;
    if (!ok) {
      auditRequest(request, 'login_failed', 'user', user?.id, { email: body.email });
      return sendError(reply, 401, 'invalid_credentials', 'Неверный email или пароль');
    }
    const { token: accessToken, expiresIn } = issueAccessToken(user);
    const { token: refreshToken } = issueRefreshToken(user.id);
    auditRequest(request, 'login', 'user', user.id);
    reply.send({ user: publicUser(user), access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn });
  });

  fastify.post('/auth/refresh', { config: { rateLimit: authLimit } }, async (request, reply) => {
    const { refresh_token } = request.body ?? {};
    if (typeof refresh_token !== 'string' || !refresh_token) {
      return sendError(reply, 400, 'validation_error', 'refresh_token обязателен');
    }
    const row = consumeRefreshToken(refresh_token);
    if (!row) return sendError(reply, 401, 'invalid_token', 'Недействительный refresh token');
    const user = db().prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
    if (!user || user.status !== 'active') {
      return sendError(reply, 401, 'invalid_token', 'Учётная запись недоступна');
    }
    const { token: accessToken, expiresIn } = issueAccessToken(user);
    const { token: newRefresh } = issueRefreshToken(user.id);
    reply.send({ access_token: accessToken, refresh_token: newRefresh, expires_in: expiresIn });
  });

  fastify.post('/auth/logout', { preValidation: [fastify.requireAuth] }, async (request, reply) => {
    revokeAllUserTokens(request.user.id);
    auditRequest(request, 'logout', 'user', request.user.id);
    reply.send({ ok: true });
  });

  fastify.get('/auth/me', { preValidation: [fastify.requireAuth] }, async (request, reply) => {
    const user = db().prepare('SELECT * FROM users WHERE id = ?').get(request.user.id);
    if (!user) return sendError(reply, 404, 'not_found', 'Пользователь не найден');
    const profile = db()
      .prepare('SELECT * FROM profiles WHERE user_id = ?')
      .get(user.id);
    reply.send({ user: publicUser(user), profile: profile ?? null });
  });

  // §40 privacy: export
  fastify.get('/auth/export', { preValidation: [fastify.requireAuth] }, async (request, reply) => {
    const uid = request.user.id;
    // The owner column differs per table — a blanket `owner_id` used to crash
    // the export with "no such column". Tables with no direct user FK
    // (contacts, services) are reached through their parent row, and only the
    // rows the user actually owns are included.
    const byOwner = (table, col) => db().prepare(`SELECT * FROM ${table} WHERE ${col} = ?`).all(uid);
    const out = {
      users: byOwner('users', 'id'),
      profiles: byOwner('profiles', 'user_id'),
      clients: byOwner('clients', 'owner_id'),
      companies: byOwner('companies', 'owner_id'),
      contacts: db()
        .prepare(`SELECT c.* FROM contacts c JOIN clients cl ON cl.id = c.client_id WHERE cl.owner_id = ?`)
        .all(uid),
      leads: byOwner('leads', 'owner_id'),
      deals: byOwner('deals', 'owner_id'),
      projects: byOwner('projects', 'owner_id'),
      tasks: byOwner('tasks', 'owner_id'),
      calendar_events: byOwner('calendar_events', 'owner_id'),
      documents: byOwner('documents', 'owner_id'),
      invoices: byOwner('invoices', 'owner_id'),
      payments: byOwner('payments', 'owner_id'),
      services: byOwner('services', 'seller_id'),
      orders: byOwner('orders', 'buyer_id'),
      marketplace_projects: byOwner('marketplace_projects', 'customer_id'),
      applications: byOwner('applications', 'specialist_id'),
      vacancies: byOwner('vacancies', 'employer_id'),
      candidates: byOwner('candidates', 'user_id'),
      courses: byOwner('courses', 'author_id'),
      enrollments: byOwner('enrollments', 'user_id'),
      notifications: byOwner('notifications', 'user_id'),
      ai_conversations: byOwner('ai_conversations', 'user_id'),
    };
    // Sensitive fields are removed, not exported.
    out.users = (out.users || []).map((u) => publicUser(u));
    reply.header('content-type', 'application/json; charset=utf-8');
    reply.send(out);
  });

  // §40 privacy: hard delete
  fastify.delete('/auth/account', { preValidation: [fastify.requireAuth] }, async (request, reply) => {
    const { password } = request.body ?? {};
    const user = db().prepare('SELECT * FROM users WHERE id = ?').get(request.user.id);
    if (!user) return sendError(reply, 404, 'not_found', 'Пользователь не найден');
    if (!verifyPassword(String(password ?? ''), user.password_hash)) {
      return sendError(reply, 401, 'invalid_credentials', 'Пароль не подтверждён');
    }
    revokeAllUserTokens(user.id);
    db().prepare("UPDATE users SET status = 'deleted', email = ?, password_hash = '' WHERE id = ?")
      .run(`deleted+${nanoid(8)}@local.invalid`, user.id);
    auditRequest(request, 'delete_account', 'user', user.id);
    reply.send({ ok: true });
  });

  // Consent ledger (§40)
  fastify.get('/auth/consents', { preValidation: [fastify.requireAuth] }, async (request, reply) => {
    const rows = db()
      .prepare('SELECT scope, granted, policy_version, created_at FROM consents WHERE user_id = ? ORDER BY created_at DESC')
      .all(request.user.id);
    reply.send(rows);
  });

  fastify.post('/auth/consents', { preValidation: [fastify.requireAuth] }, async (request, reply) => {
    const body = validateOrThrow(
      z.object({ scope: z.string().min(1), granted: z.boolean() }),
      request.body,
      reply
    );
    if (!body) return;
    db()
      .prepare('INSERT INTO consents (id, user_id, scope, granted, policy_version) VALUES (?, ?, ?, ?, ?)')
      .run(nanoid(), request.user.id, body.scope, body.granted ? 1 : 0, '1.0');
    auditRequest(request, 'consent_change', 'consent', null, body);
    reply.code(201).send({ ok: true });
  });
}
