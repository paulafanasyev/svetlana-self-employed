/**
 * Web unit-тесты: контракт API-клиента (§42).
 *
 * Покрываем самое хрупкое звено клиентского слоя: как токены прикрепляются,
 * как происходит single-retry на 401, и как ошибки всплывают наверх честно
 * (никаких фейковых успехов — §54).
 *
 * Тесты разделяют globalThis.fetch и состояние модуля, поэтому файл
 * запускается последовательно (см. --test-concurrency=1 в package.json).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Подготовка окружения браузера ──────────────────────────────────────────
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const fetched = [];

/**
 * Устанавливает детерминированную цепочку ответов fetch.
 * @param {Array<{status:number, body:*}>|null} queue null = сетевой сбой
 */
function queueResponses(queue) {
  fetched.length = 0;
  let i = 0;
  globalThis.fetch = async (url, options) => {
    fetched.push({ url, options });
    if (queue === null) throw new Error('connection refused');
    const r = queue[Math.min(i++, queue.length - 1)];
    const text = r.body === undefined ? '' : JSON.stringify(r.body);
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      text: async () => text,
      json: async () => JSON.parse(text),
    };
  };
}

const { api, setTokens, clearTokens, getAccessToken, ApiError, API_BASE } =
  await import('../src/api.js');

function reset() {
  store.clear();
  fetched.length = 0;
  clearTokens();
  queueResponses([{ status: 200, body: { ok: true } }]);
}

test('api: base path strips a single trailing slash', () => {
  assert.equal(API_BASE, '/api/v1');
});

test('api: bearer token is attached when present', async () => {
  reset();
  setTokens('access-abc', 'refresh-xyz');
  await api.get('/clients');
  assert.equal(fetched[0].options.headers.authorization, 'Bearer access-abc');
});

test('api: no authorization header when logged out', async () => {
  reset();
  await api.get('/clients');
  assert.equal(fetched[0].options.headers.authorization, undefined);
});

test('api: POST sends a JSON body', async () => {
  reset();
  await api.post('/clients', { name: 'ООО Вектор' });
  assert.equal(fetched[0].options.method, 'POST');
  assert.equal(fetched[0].options.body, '{"name":"ООО Вектор"}');
  assert.equal(fetched[0].options.headers['content-type'], 'application/json');
});

test('api: 401 triggers exactly one refresh, then retries', async () => {
  reset();
  setTokens('expired', 'refresh-xyz');
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    // 1) исходный запрос → 401, 2) refresh → новые токены, 3) retry → 200
    const r =
      calls === 1
        ? { status: 401, body: { error: 'unauthorized' } }
        : calls === 2
          ? { status: 200, body: { access_token: 'new-access', refresh_token: 'new-refresh' } }
          : { status: 200, body: { data: [] } };
    return {
      status: r.status,
      ok: r.status < 300,
      text: async () => JSON.stringify(r.body),
      json: async () => r.body,
    };
  };

  const body = await api.get('/clients');
  assert.equal(getAccessToken(), 'new-access');
  assert.equal(body.data.length, 0);
  assert.equal(calls, 3, 'исходный + refresh + retry');
});

test('api: 401 with a bad refresh clears tokens and throws', async () => {
  reset();
  setTokens('expired', 'bad-refresh');
  globalThis.fetch = async () => ({
    status: 401,
    ok: false,
    text: async () => JSON.stringify({ error: 'unauthorized' }),
    json: async () => ({ error: 'unauthorized' }),
  });

  await assert.rejects(() => api.get('/clients'), ApiError);
  assert.equal(getAccessToken(), null);
});

test('api: network failure is surfaced as an error, never a fake success', async () => {
  reset();
  queueResponses(null);
  await assert.rejects(
    () => api.get('/clients'),
    (err) => err instanceof ApiError && err.status === 0,
  );
});

test('api: 403 is reported verbatim (no silent retry)', async () => {
  reset();
  setTokens('valid', 'refresh');
  queueResponses([{ status: 403, body: { error: 'forbidden', message: 'Нет доступа' } }]);
  await assert.rejects(
    () => api.get('/clients'),
    (err) => err instanceof ApiError && err.status === 403 && err.code === 'forbidden',
  );
});

test('api: 204 No Content resolves to null', async () => {
  reset();
  queueResponses([{ status: 204, body: undefined }]);
  const body = await api.del('/clients/1');
  assert.equal(body, null);
});

test('api: clearTokens removes persisted credentials', () => {
  reset();
  setTokens('a', 'b');
  clearTokens();
  assert.equal(getAccessToken(), null);
  assert.equal(store.has('mir_access_token'), false);
  assert.equal(store.has('mir_refresh_token'), false);
});

test('api: account deletion sends a JSON object, not a double-encoded string', async () => {
  reset();
  await (await import('../src/api.js')).auth.deleteAccount('secret');
  assert.equal(fetched[0].options.method, 'DELETE');
  assert.equal(fetched[0].options.body, '{"password":"secret"}');
});

test('api: client tags use the backend array contract', async () => {
  reset();
  const { crm } = await import('../src/api.js');
  await crm.addClientTag('client-1', 'важный');
  assert.equal(fetched[0].options.body, '{"tags":["важный"]}');
});

test('api: grant update uses PATCH to match the backend route', async () => {
  reset();
  const { government } = await import('../src/api.js');
  await government.updateGrant('grant-1', { title: 'Обновлено' });
  assert.equal(fetched[0].options.method, 'PATCH');
});

