/**
 * Синхронизация CRM: сайт ↔ Windows ↔ Android через один аккаунт.
 * Реальный in-process сервер и реальная SQLite, без моков.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../../src/server.js';
import { db } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';

let fastify;
test.before(async () => {
  migrate(db());
  fastify = await buildServer();
});
test.after(async () => { await fastify.close(); });

const auth = (t) => (t ? { authorization: `Bearer ${t}` } : {});
const post = (url, body, t) => fastify.inject({ method: 'POST', url, body, headers: auth(t) });
const get = (url, t) => fastify.inject({ method: 'GET', url, headers: auth(t) });
let n = 0;
const email = () => `crm${process.pid}-${++n}-${Math.random().toString(36).slice(2, 8)}@test.ru`;

async function register() {
  const res = await post('/api/v1/auth/register', {
    email: email(), password: 'Test123456', display_name: 'CRM',
    consent_personal_data: true, accept_terms: true,
  });
  assert.equal(res.statusCode, 201, res.body);
  return { token: res.json().access_token, id: res.json().user.id };
}

const contact = (id, name, t) => ({ kind: 'contacts', id, updatedAt: t, data: { id, name, phones: [], emails: [], company: '', position: '', status: 'lead', tags: [], source: 'manual', notes: '', createdAt: t, updatedAt: t } });

test('контакт с сайта виден на другом устройстве', async () => {
  const { token } = await register();
  const push = await post('/api/v1/crm/sync', { since: 0, changes: [contact('c_site0001', 'Анна', 1000)] }, token);
  assert.equal(push.statusCode, 200, push.body);
  assert.equal(push.json().applied, 1);
  const device = await get('/api/v1/crm/sync?since=0', token);
  assert.equal(device.statusCode, 200);
  const rec = device.json().records.find((r) => r.id === 'c_site0001');
  assert.equal(rec.data.name, 'Анна');
  assert.ok(device.json().cursor >= 1);
});

test('последняя правка побеждает, старая — пропускается', async () => {
  const { token } = await register();
  await post('/api/v1/crm/sync', { changes: [contact('c_lww00001', 'Новое имя', 2000)] }, token);
  const stale = await post('/api/v1/crm/sync', { changes: [contact('c_lww00001', 'Старое имя', 1500)] }, token);
  assert.equal(stale.json().skipped, 1);
  const snap = await get('/api/v1/crm/snapshot', token);
  assert.equal(snap.json().contacts.find((c) => c.id === 'c_lww00001').name, 'Новое имя');
});

test('удаление доходит до других устройств', async () => {
  const { token } = await register();
  const first = await post('/api/v1/crm/sync', { changes: [contact('c_del00001', 'Удалить', 1000)] }, token);
  const cursor = first.json().cursor;
  await post('/api/v1/crm/sync', { changes: [{ kind: 'contacts', id: 'c_del00001', updatedAt: 3000, deleted: true }] }, token);
  const pull = await get(`/api/v1/crm/sync?since=${cursor}`, token);
  const rec = pull.json().records.find((r) => r.id === 'c_del00001');
  assert.equal(rec.deleted, true);
  assert.equal(rec.data, null);
  const snap = await get('/api/v1/crm/snapshot', token);
  assert.ok(!snap.json().contacts.some((c) => c.id === 'c_del00001'));
});

test('данные разных пользователей изолированы', async () => {
  const a = await register();
  const b = await register();
  await post('/api/v1/crm/sync', { changes: [contact('c_secret01', 'Секрет', 1000)] }, a.token);
  const pull = await get('/api/v1/crm/sync?since=0', b.token);
  assert.equal(pull.json().records.length, 0);
});

test('без входа и с мусором — отказ', async () => {
  const anon = await get('/api/v1/crm/sync?since=0');
  assert.equal(anon.statusCode, 401);
  const { token } = await register();
  const bad = await post('/api/v1/crm/sync', { changes: [{ kind: 'users', id: 'x', updatedAt: 1 }] }, token);
  assert.equal(bad.statusCode, 400);
  const badId = await post('/api/v1/crm/sync', { changes: [contact('../etc', 'X', 1)] }, token);
  assert.equal(badId.statusCode, 400);
});

test('удаление аккаунта удаляет его CRM', async () => {
  const { token, id } = await register();
  await post('/api/v1/crm/sync', { changes: [contact('c_gone0001', 'Уйдёт', 1000)] }, token);
  const del = await fastify.inject({ method: 'DELETE', url: '/api/v1/auth/account', headers: auth(token), payload: { password: 'Test123456' } });
  assert.equal(del.statusCode, 200);
  assert.equal(db().prepare('SELECT COUNT(*) AS n FROM crm_records WHERE owner_id = ?').get(id).n, 0);
});

test('клиент, созданный Светланой в чате, попадает в общую CRM и на устройства', async () => {
  const res = await post('/api/v1/auth/register', {
    email: email(), password: 'Test123456', display_name: 'CRM AI',
    consent_personal_data: true, accept_terms: true, consent_ai_processing: true,
  });
  assert.equal(res.statusCode, 201, res.body);
  const token = res.json().access_token;
  const chat = await post('/api/v1/ai/chat', { message: 'Создай клиента ООО Синхрон' }, token);
  assert.equal(chat.statusCode, 200, chat.body);
  const action = (chat.json().actions ?? []).find((a) => a.tool === 'crm.create_client');
  assert.ok(action, 'Светлана должна вызвать crm.create_client');
  assert.equal(action.verified, true);
  const snap = await get('/api/v1/crm/snapshot', token);
  const c = snap.json().contacts.find((x) => x.name === 'ООО Синхрон');
  assert.ok(c, 'контакт должен быть в CRM кабинета');
  assert.equal(c.source, 'chat');
  const device = await get('/api/v1/crm/sync?since=0', token);
  assert.ok(device.json().records.some((r) => r.kind === 'contacts' && r.data?.name === 'ООО Синхрон'), 'контакт должен уйти на устройства');
});
