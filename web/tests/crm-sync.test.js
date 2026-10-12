import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCrmStore } from '../src/crm/crmStore.js';
import { createCrmSync } from '../src/crm/crmSync.js';

function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** Повторяет логику backend/src/routes/crmSync.js (LWW + tombstones + seq). */
function fakeServer() {
  const rows = new Map();
  let seq = 0;
  let down = false;
  const request = async ({ since = 0, changes = [] }) => {
    if (down) { const e = new Error('Сервер недоступен'); e.status = 0; throw e; }
    let applied = 0; let skipped = 0;
    for (const c of changes) {
      const k = c.kind + ':' + c.id;
      const ex = rows.get(k);
      if (ex && ex.updatedAt > c.updatedAt) { skipped += 1; continue; }
      seq += 1;
      rows.set(k, { kind: c.kind, id: c.id, updatedAt: c.updatedAt, deleted: c.deleted || !c.data, data: c.deleted || !c.data ? null : JSON.parse(JSON.stringify(c.data)), seq });
      applied += 1;
    }
    const records = [...rows.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq);
    return { cursor: Math.max(seq, since), hasMore: false, records: records.map(({ seq: _s, ...r }) => r), applied, skipped };
  };
  return { request, rows, setDown: (v) => { down = v; } };
}

function device(server, t) {
  const storage = mem();
  const clock = () => t.now;
  const store = createCrmStore({ storage, clock, key: 'k:u1' });
  const sync = createCrmSync({ store, owner: 'u1', request: server.request, storage, clock, autoStart: false, intervalMs: 0 });
  return { store, sync, storage };
}

test('контакт с сайта появляется на втором устройстве', async () => {
  const t = { now: 1_700_000_000_000 };
  const s = fakeServer();
  const a = device(s, t); const b = device(s, t);
  const c = a.store.addContact({ name: 'Анна', phones: ['+7 912 345-67-89'] });
  t.now += 1000;
  await a.sync.syncNow();
  assert.equal(a.sync.status.state, 'ok');
  await b.sync.syncNow();
  assert.equal(b.store.data.contacts.length, 1);
  assert.equal(b.store.data.contacts[0].id, c.id);
  assert.equal(b.store.data.contacts[0].name, 'Анна');
  a.sync.stop(); b.sync.stop();
});

test('сделки, задачи и удаление расходятся по устройствам', async () => {
  const t = { now: 1_700_000_000_000 };
  const s = fakeServer();
  const a = device(s, t); const b = device(s, t);
  const c = a.store.addContact({ name: 'Борис' });
  t.now += 10;
  a.store.addDeal({ title: 'Сайт', amount: 30000, contactId: c.id });
  t.now += 10;
  a.store.addActivity({ type: 'task', text: 'Позвонить', contactId: c.id });
  await a.sync.syncNow();
  await b.sync.syncNow();
  assert.equal(b.store.data.deals.length, 1);
  assert.equal(b.store.data.deals[0].contactId, c.id);
  assert.equal(b.store.data.activities.length, 1);
  t.now += 1000;
  b.store.deleteActivity(b.store.data.activities[0].id);
  await b.sync.syncNow();
  await a.sync.syncNow();
  assert.equal(a.store.data.activities.length, 0);
});

test('конфликт: побеждает более поздняя правка', async () => {
  const t = { now: 1_700_000_000_000 };
  const s = fakeServer();
  const a = device(s, t); const b = device(s, t);
  const c = a.store.addContact({ name: 'Вера' });
  await a.sync.syncNow(); await b.sync.syncNow();
  t.now += 1000; a.store.updateContact(c.id, { company: 'Старое' });
  t.now += 1000; b.store.updateContact(c.id, { company: 'Новое' });
  await b.sync.syncNow();
  await a.sync.syncNow(); // правка A старше — сервер её отклоняет, A получает версию B
  assert.equal(a.store.data.contacts[0].company, 'Новое');
  await b.sync.syncNow();
  assert.equal(b.store.data.contacts[0].company, 'Новое');
});

test('без сети изменения копятся и уходят после восстановления', async () => {
  const t = { now: 1_700_000_000_000 };
  const s = fakeServer();
  const a = device(s, t); const b = device(s, t);
  s.setDown(true);
  a.store.addContact({ name: 'Глеб' });
  await a.sync.syncNow();
  assert.equal(a.sync.status.state, 'offline');
  assert.equal(a.sync.status.pending, 1);
  assert.equal(a.store.data.contacts.length, 1, 'CRM работает без сети');
  s.setDown(false);
  await a.sync.syncNow();
  assert.equal(a.sync.status.state, 'ok');
  assert.equal(a.sync.status.pending, 0);
  await b.sync.syncNow();
  assert.equal(b.store.data.contacts[0].name, 'Глеб');
});

test('данные, созданные до включения синхронизации, отправляются при первом запуске', async () => {
  const t = { now: 1_700_000_000_000 };
  const s = fakeServer();
  const storage = mem();
  const store = createCrmStore({ storage, clock: () => t.now, key: 'k:u1' });
  store.addContact({ name: 'Дарья' });
  store.addContact({ name: 'Егор' });
  const sync = createCrmSync({ store, owner: 'u1', request: s.request, storage, clock: () => t.now, autoStart: false, intervalMs: 0 });
  assert.equal(Object.keys(sync.pending).length, 2);
  await sync.syncNow();
  assert.equal(s.rows.size, 2);
  // повторный запуск не дублирует отправку
  const again = createCrmSync({ store, owner: 'u1', request: s.request, storage, clock: () => t.now, autoStart: false, intervalMs: 0 });
  assert.equal(Object.keys(again.pending).length, 0);
  sync.stop(); again.stop();
});

test('удалённые изменения не попадают обратно в очередь', async () => {
  const t = { now: 1_700_000_000_000 };
  const s = fakeServer();
  const a = device(s, t); const b = device(s, t);
  a.store.addContact({ name: 'Жанна' });
  await a.sync.syncNow(); await b.sync.syncNow();
  assert.equal(Object.keys(b.sync.pending).length, 0);
  assert.equal(b.sync.status.state, 'ok');
});

test('ошибка авторизации показывается отдельно', async () => {
  const store = createCrmStore({ storage: mem(), key: 'k' });
  const sync = createCrmSync({ store, owner: 'u', storage: mem(), autoStart: false, intervalMs: 0, request: async () => { const e = new Error('no'); e.status = 401; throw e; } });
  await sync.syncNow();
  assert.equal(sync.status.state, 'auth');
});

test('после start() локальная правка отправляется сама (debounce)', async () => {
  const s = fakeServer();
  const store = createCrmStore({ storage: mem(), key: 'k' });
  const sync = createCrmSync({ store, owner: 'u', storage: mem(), request: s.request, debounceMs: 5, intervalMs: 0 });
  await sync.syncNow();
  store.addContact({ name: 'Зоя' });
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(s.rows.size, 1);
  sync.stop();
});
