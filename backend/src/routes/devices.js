/**
 * Linked devices: the user's Windows PC and Android phone running «Светлана».
 *
 *   POST   /devices/link-code   (auth)    → one-time code XXXX-XXXX-XXXX, 10 min
 *   POST   /devices/link        (public)  → app exchanges the code for a device token
 *   POST   /devices/heartbeat   (device)  → app reports version, security flags, local models
 *   GET    /devices             (auth)    → cabinet list
 *   DELETE /devices/:id         (auth)    → revoke (token stops working immediately)
 *   GET    /devices/catalog     (public)  → agreed catalog of downloadable local models
 *
 * Security: codes and device tokens are random (CSPRNG), stored only as SHA-256 hashes,
 * compared by hash lookup; codes are single-use; heartbeat payload is a strict whitelist
 * (no CRM/business/voice data). Link and heartbeat are rate limited.
 */
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { auditRequest } from '../plugins/audit.js';
import { validateOrThrow, readJson } from '../lib/http.js';
import { MODEL_CATALOG } from '../lib/modelCatalog.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL_S = 10 * 60;
const MAX_DEVICES = 10;

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const normalizeCode = (raw) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const now = () => Math.floor(Date.now() / 1000);

function newCode() {
  let s = '';
  for (let i = 0; i < 12; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

const linkSchema = z.object({
  code: z.string().min(12).max(20),
  platform: z.enum(['windows', 'android']),
  name: z.string().min(1).max(80),
  app_version: z.string().max(40).optional(),
}).strict();

const modelSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9._-]{1,60}$/),
  size_mb: z.number().int().min(0).max(200_000).optional(),
}).strict();

const heartbeatSchema = z.object({
  app_version: z.string().max(40).optional(),
  status: z.object({
    bridge_v2: z.boolean().optional(),
    voice_enrolled: z.boolean().optional(),
    secrets_encrypted: z.boolean().optional(),
    confirm_gate: z.boolean().optional(),
    paired_with: z.enum(['windows', 'android']).nullable().optional(),
  }).strict().default({}),
  models: z.array(modelSchema).max(50).default([]),
}).strict();

function publicDevice(row) {
  return {
    id: row.id,
    platform: row.platform,
    name: row.name,
    app_version: row.app_version,
    status: readJson(row.status_json, {}),
    models: readJson(row.models_json, []),
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    online: !!row.last_seen_at && now() - row.last_seen_at < 15 * 60,
  };
}

function deviceFromToken(request) {
  const m = /^Device\s+([A-Za-z0-9_-]{40,100})$/.exec(request.headers.authorization ?? '');
  if (!m) return null;
  return db()
    .prepare('SELECT * FROM devices WHERE token_hash = ? AND revoked_at IS NULL')
    .get(sha256(m[1])) ?? null;
}

export default async function deviceRoutes(fastify) {
  const auth = { preValidation: [fastify.requireAuth] };

  fastify.get('/catalog', async (_request, reply) => {
    reply.header('cache-control', 'public, max-age=3600').send(MODEL_CATALOG);
  });

  fastify.get('/', auth, async (request, reply) => {
    const rows = db()
      .prepare('SELECT * FROM devices WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC')
      .all(request.user.id);
    reply.send({ devices: rows.map(publicDevice) });
  });

  fastify.post('/link-code', { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const count = db().prepare('SELECT COUNT(*) AS n FROM devices WHERE user_id = ? AND revoked_at IS NULL').get(request.user.id).n;
    if (count >= MAX_DEVICES) {
      return reply.code(409).send({ error: 'too_many_devices', message: `Не больше ${MAX_DEVICES} устройств. Отключите ненужные.` });
    }
    db().prepare('DELETE FROM device_link_codes WHERE user_id = ? AND (expires_at < ? OR used_at IS NOT NULL)').run(request.user.id, now());
    const code = newCode();
    const expires_at = now() + CODE_TTL_S;
    db().prepare('INSERT INTO device_link_codes (code_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(sha256(normalizeCode(code)), request.user.id, expires_at);
    auditRequest(request, 'create', 'device_link_code', null, { expires_at });
    reply.send({ code, expires_at });
  });

  fastify.post('/link', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = validateOrThrow(linkSchema, request.body, reply);
    if (!body) return;
    const hash = sha256(normalizeCode(body.code));
    const token = randomBytes(32).toString('base64url');
    const id = nanoid();
    let userId = null;
    db().transaction(() => {
      const row = db()
        .prepare('SELECT * FROM device_link_codes WHERE code_hash = ? AND used_at IS NULL AND expires_at >= ?')
        .get(hash, now());
      if (!row) return;
      db().prepare('UPDATE device_link_codes SET used_at = ? WHERE code_hash = ?').run(now(), hash);
      db().prepare(`INSERT INTO devices (id, user_id, platform, name, app_version, token_hash, last_seen_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, row.user_id, body.platform, body.name, body.app_version ?? null, sha256(token), now());
      userId = row.user_id;
    });
    if (!userId) {
      return reply.code(401).send({ error: 'invalid_code', message: 'Код неверный или устарел. Получите новый в личном кабинете.' });
    }
    reply.send({ device_id: id, device_token: token });
  });

  fastify.post('/heartbeat', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const device = deviceFromToken(request);
    if (!device) return reply.code(401).send({ error: 'unauthorized', message: 'Устройство не привязано или отключено' });
    const body = validateOrThrow(heartbeatSchema, request.body ?? {}, reply);
    if (!body) return;
    db().prepare(`UPDATE devices SET app_version = COALESCE(?, app_version), status_json = ?, models_json = ?, last_seen_at = ?
                  WHERE id = ?`)
      .run(body.app_version ?? null, JSON.stringify(body.status), JSON.stringify(body.models), now(), device.id);
    reply.send({ ok: true });
  });

  fastify.delete('/:id', auth, async (request, reply) => {
    const res = db()
      .prepare('UPDATE devices SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL')
      .run(now(), String(request.params.id), request.user.id);
    if (!res.changes) return reply.code(404).send({ error: 'not_found', message: 'Устройство не найдено' });
    auditRequest(request, 'revoke', 'device', String(request.params.id), {});
    reply.code(204).send();
  });
}
