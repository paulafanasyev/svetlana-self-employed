/** Единая Светлана для всех сайтов: ключ сайта, тема сайта, без утечки ключей. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../../src/server.js';
import { db } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';

let fastify;
test.before(async () => {
  process.env.ASSISTANT_KEY_ZARYADKA = 'test-key-zaryadka-1234567890';
  process.env.ASSISTANT_KEY_AIKO = 'test-key-aiko-1234567890';
  delete process.env.ASSISTANT_KEY_SVETLANA2;
  migrate(db());
  fastify = await buildServer();
});
test.after(async () => { await fastify.close(); });

const chat = (site, body, key) => fastify.inject({
  method: 'POST', url: `/api/v1/assistant/${site}/chat`, body,
  headers: key ? { authorization: `Bearer ${key}` } : {},
});

test('список сайтов без секретов', async () => {
  const res = await fastify.inject({ method: 'GET', url: '/api/v1/assistant/sites' });
  assert.equal(res.statusCode, 200);
  const ids = res.json().data.map((s) => s.id);
  for (const id of ['mir', 'aiko', 'zaryadka', 'repetitor', 'svetlana2']) assert.ok(ids.includes(id));
  assert.ok(!res.body.includes('test-key'), 'ключи не показываются');
  assert.equal(res.json().data.find((s) => s.id === 'zaryadka').enabled, true);
  assert.equal(res.json().data.find((s) => s.id === 'svetlana2').enabled, false);
});

test('неизвестный сайт — 404, без ключа — 401, выключенный профиль — 503', async () => {
  assert.equal((await chat('nope', { message: 'привет' }, 'x')).statusCode, 404);
  assert.equal((await chat('zaryadka', { message: 'привет' })).statusCode, 401);
  assert.equal((await chat('zaryadka', { message: 'привет' }, 'test-key-aiko-1234567890')).statusCode, 401, 'ключ другого сайта не подходит');
  assert.equal((await chat('svetlana2', { message: 'напиши код' }, 'anything')).statusCode, 503, 'полный режим без ключа выключен');
});

test('с ключом сайта Светлана отвечает в теме сайта', async () => {
  const res = await chat('zaryadka', { message: 'Как делать приседания?', history: [{ role: 'user', content: 'привет' }] }, 'test-key-zaryadka-1234567890');
  assert.ok([200, 503].includes(res.statusCode), res.body);
  if (res.statusCode === 200) {
    assert.equal(res.json().site, 'zaryadka');
    assert.equal(typeof res.json().content, 'string');
    assert.ok(!/https?:\/\//.test(res.json().content), 'ребёнку без ссылок');
  }
});

test('мусор в теле — 400', async () => {
  assert.equal((await chat('aiko', { message: '' }, 'test-key-aiko-1234567890')).statusCode, 400);
});
