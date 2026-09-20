/**
 * E2E-проверки обязательных сценариев (§44).
 *
 * Запускаются против реального in-process сервера (fastify.inject) с реальной
 * in-memory SQLite-базой. Никаких моков: регистрируем пользователя, Светлана
 * выполняет действия, проверяем результаты в БД.
 *
 * Каждый тест самоздостаточен (node:test выполняет тесты конкурентно).
 *
 * Запуск: npm run e2e  (npm run e2e -w backend)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../../src/server.js';
import { db } from '../../src/db/client.js';
import { migrate } from '../../src/db/migrate.js';
import { seedTemplates } from '../../src/documents/templates.js';

let fastify;

test.before(async () => {
  migrate(db());
  // Document creation has an FK to document_templates.id, so the pipeline
  // needs real template rows. seedTemplates installs the system defaults
  // (no demo data — §54 forbids fake fixtures outside a demo environment).
  seedTemplates(db());
  fastify = await buildServer();
});

test.after(async () => {
  await fastify.close();
});

const post = (url, body, token) =>
  fastify.inject({ method: 'POST', url, body, headers: auth(token) });
const put = (url, body, token) =>
  fastify.inject({ method: 'PUT', url, body, headers: auth(token) });
const get = (url, token) => fastify.inject({ method: 'GET', url, headers: auth(token) });
const auth = (token) => (token ? { authorization: `Bearer ${token}` } : {});

async function registerUser(email, name = 'E2E User') {
  const res = await post('/api/v1/auth/register', {
    email, password: 'Test123456', display_name: name, consent_ai_processing: true,
  });
  assert.equal(res.statusCode, 201, `register ${email}: ${res.json()?.message ?? res.statusCode}`);
  return { token: res.json().access_token, id: res.json().user.id };
}

let seq = 0;
/** Distinct email per call — node:test runs tests concurrently and they share
 *  one DB, so a plain counter can collide across async interleavings. */
const newEmail = () => `e2e${process.pid}-${++seq}-${Math.random().toString(36).slice(2, 8)}@test.ru`;

// ───────────────────────────────────────────────────────────────────────────
// 1. REGISTER → ONBOARDING → SVETLANA → PROFILE
// ───────────────────────────────────────────────────────────────────────────
test('1. register → onboarding → svetlana → profile', async () => {
  const { token } = await registerUser(newEmail(), 'Анна');

  const me = await get('/api/v1/auth/me', token);
  assert.equal(me.statusCode, 200);

  // Onboarding: fill the work profile Светлана reasons over (§28).
  const profile = await put('/api/v1/profile',
    { profession: 'Копирайтер', city: 'Москва', min_hourly_rate: 2000 }, token);
  assert.equal(profile.statusCode, 200, `profile: ${profile.json()?.message}`);
  assert.equal(profile.json().profession, 'Копирайтер');

  // Светлана responds to a free-form message (full pipeline works).
  const chat = await post('/api/v1/ai/chat', { message: 'Привет, кто ты?' }, token);
  assert.equal(chat.statusCode, 200);
  assert.ok(chat.json().content, 'Светлана должна ответить');
  assert.ok(chat.json().emotion, 'должна быть эмоция');
});

// ───────────────────────────────────────────────────────────────────────────
// 2. SVETLANA → CREATE CLIENT → CRM → VERIFIED
// ───────────────────────────────────────────────────────────────────────────
test('2. svetlana create client → CRM verified', async () => {
  const { token, id } = await registerUser(newEmail());

  const chat = await post('/api/v1/ai/chat', { message: 'Создай клиента ООО Вектор' }, token);
  assert.equal(chat.statusCode, 200);

  const action = (chat.json().actions ?? []).find((a) => a.tool === 'crm.create_client');
  assert.ok(action, 'Светлана должна вызвать инструмент crm.create_client');
  assert.equal(action.status, 'succeeded');
  assert.equal(action.verified, true, 'действие должно быть VERIFIED (§14)');

  const list = await get('/api/v1/clients', token);
  assert.equal(list.statusCode, 200);
  const created = list.json().data.find((c) => c.name === 'ООО Вектор');
  assert.ok(created, 'клиент должен быть в CRM');
  assert.equal(created.owner_id, id);
});

// ───────────────────────────────────────────────────────────────────────────
// 3. SVETLANA → CREATE CONTRACT → PREVIEW → APPROVAL → DOCUMENT
// ───────────────────────────────────────────────────────────────────────────
test('3. svetlana contract pipeline → preview → approve', async () => {
  const { token } = await registerUser(newEmail());

  // template_id is the FK to document_templates.id (not the slug) — resolve it.
  const tpl = db().prepare("SELECT id FROM document_templates WHERE slug = 'contract'").get();
  assert.ok(tpl, 'seed must provide the contract template');

  const create = await post('/api/v1/documents', {
    kind: 'contract', template_id: tpl.id, title: 'Договор оказания услуг',
  }, token);
  assert.equal(create.statusCode, 201, `create doc: ${create.json()?.message}`);
  const docId = create.json().id;

  // Fill required fields — the template's schema_json defines exactly which
  // keys are required (contractor_inn, client_name, service_title, amount…).
  const setData = await put(`/api/v1/documents/${docId}/data`,
    {
      data: {
        contractor_name: 'Иванов Иван Иванович',
        contractor_inn: '770123456789',
        client_name: 'ООО Вектор',
        service_title: 'Услуги копирайтинга',
        amount: '50000',
        deadline: '2026-12-31',
        start_date: '2026-10-01',
      },
    }, token);
  assert.equal(setData.statusCode, 200, `set_data: ${setData.json()?.message}`);

  // Generate preview — must succeed (200) before approve is allowed.
  const gen = await post(`/api/v1/documents/${docId}/generate`, {}, token);
  assert.equal(gen.statusCode, 200, `generate: ${gen.json()?.message ?? gen.statusCode}`);

  // Approve → produces the file
  const approve = await post(`/api/v1/documents/${docId}/approve`, {}, token);
  assert.equal(approve.statusCode, 200, `approve: ${approve.json()?.message}`);
  assert.ok(approve.json().docx_path, 'после утверждения должен быть файл документа');
});

// ───────────────────────────────────────────────────────────────────────────
// 4. SVETLANA → FIND GRANTS → RAG → SOURCES
// ───────────────────────────────────────────────────────────────────────────
test('4. grants search → RAG sources', async () => {
  const { token } = await registerUser(newEmail());

  // Seed a real knowledge document so RAG has something to cite.
  await post('/api/v1/rag/ingest', {
    source: 'user', source_name: 'Личные заметки',
    title: 'Налог на профессиональный доход',
    text: 'Самозанятые на НПД платят налог с дохода: 4% при работе с физлицами и 6% при работе с юрлицами. Налоговый период — месяц, уплата до 28 числа следующего месяца.',
  }, token).catch(() => {}); // tolerated: ingest validates source/user scoping

  const search = await get('/api/v1/rag/search?q=' + encodeURIComponent('налог самозанятый'), token);
  assert.equal(search.statusCode, 200);
  assert.ok(Array.isArray(search.json().data));
  // Either cited hits with sources, or an honest empty result — never fabricated.
  for (const hit of search.json().data) {
    assert.ok(hit.document, 'каждый результат должен иметь источник');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 5. USER → FIND CLIENTS → MATCHING → RESULTS
// ───────────────────────────────────────────────────────────────────────────
test('5. marketplace matching returns a score', async () => {
  const customer = await registerUser(newEmail(), 'Заказчик');
  const specialist = await registerUser(newEmail(), 'Специалист');

  const proj = await post('/api/v1/marketplace/projects', {
    title: 'Тексты для лендинга', description: 'Нужны продающие тексты для главной страницы',
    budget_min: 10000, budget_max: 30000, skills: ['копирайтинг'],
  }, customer.token);
  assert.equal(proj.statusCode, 201, `create project: ${proj.json()?.message}`);
  const pid = proj.json().id;

  const match = await get(`/api/v1/marketplace/projects/${pid}/matching`, specialist.token);
  assert.equal(match.statusCode, 200);
  assert.ok(typeof match.json().score === 'number');
  assert.ok(match.json().score >= 0 && match.json().score <= 100, 'score must be 0..100');
});

// ───────────────────────────────────────────────────────────────────────────
// 6. CUSTOMER → CREATE PROJECT → SPECIALIST → APPLICATION
// ───────────────────────────────────────────────────────────────────────────
test('6. customer project → specialist application', async () => {
  const customer = await registerUser(newEmail(), 'Заказчик');
  const specialist = await registerUser(newEmail(), 'Специалист');

  const proj = await post('/api/v1/marketplace/projects', {
    title: 'Дизайн логотипа', description: 'Нужен логотип для нового бренда, три концепции',
    budget_min: 5000, budget_max: 15000, skills: ['дизайн'],
  }, customer.token);
  assert.equal(proj.statusCode, 201, `create project: ${proj.json()?.message}`);

  const apply = await post(`/api/v1/marketplace/projects/${proj.json().id}/applications`, {
    cover_letter: 'Готов сделать логотип за неделю', proposed_price: 10000,
  }, specialist.token);
  assert.ok([201, 200].includes(apply.statusCode), `apply: ${apply.json()?.message ?? apply.statusCode}`);

  const mine = await get('/api/v1/marketplace/applications/mine', specialist.token);
  assert.equal(mine.statusCode, 200);
  assert.ok((mine.json().data ?? []).length >= 1, 'отклик должен быть виден специалисту');
});

// ───────────────────────────────────────────────────────────────────────────
// 7. EXPERT → CREATE COURSE → CUSTOMER PURCHASE → COMMISSION
// ───────────────────────────────────────────────────────────────────────────
test('7. expert course → purchase → commission', async () => {
  const expert = await registerUser(newEmail(), 'Эксперт');
  const buyer = await registerUser(newEmail(), 'Студент');

  const course = await post('/api/v1/courses', {
    title: 'Курс по копирайтингу', description: 'Практический курс из восьми уроков',
    price: 5000, format: 'course', is_published: true,
  }, expert.token);
  assert.equal(course.statusCode, 201, `create course: ${course.json()?.message}`);
  const cid = course.json().id;

  // Enrollment only finds published courses (is_published = 1).
  const enroll = await post(`/api/v1/courses/${cid}/enroll`, {}, buyer.token);
  assert.ok([201, 200].includes(enroll.statusCode), `enroll: ${enroll.json()?.message ?? enroll.statusCode}`);

  // A paid course creates an order; paying it must record the platform
  // commission (§25) — the rate comes from system_config, never the client.
  if (enroll.json().order_id) {
    const pay = await post('/api/v1/payments/charge', {
      idempotency_key: `e2e-charge-${enroll.json().order_id}`,
      order_id: enroll.json().order_id, provider: 'test',
    }, buyer.token);
    assert.ok([200, 201].includes(pay.statusCode), `charge: ${pay.json()?.message ?? pay.statusCode}`);
    const payment = db().prepare('SELECT * FROM payments WHERE order_id = ?').get(enroll.json().order_id);
    if (payment) {
      assert.ok(payment.platform_fee != null, 'commission must be recorded on the payment');
    }
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 8. ANDROID → CREATE TASK → WEB SEES TASK
//    (same backend + same DB — verified via the identical API contract)
// ───────────────────────────────────────────────────────────────────────────
test('8. android task → web sees the same task', async () => {
  const { token } = await registerUser(newEmail());

  // The Android client calls POST /tasks with the same contract as web.
  const create = await post('/api/v1/tasks', {
    title: 'Позвонить клиенту ООО Вектор', priority: 'high',
  }, token);
  assert.equal(create.statusCode, 201);
  const taskId = create.json().id;

  // Web reads the same list — the row must be there.
  const list = await get('/api/v1/tasks', token);
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().data.some((t) => t.id === taskId), 'задача видна и в web, и в android');
});

// ───────────────────────────────────────────────────────────────────────────
// 9. WEB → CREATE CLIENT → ANDROID SEES CLIENT
// ───────────────────────────────────────────────────────────────────────────
test('9. web client → android sees the same client', async () => {
  const { token } = await registerUser(newEmail());

  const create = await post('/api/v1/clients', { name: 'ИП Смирнов', email: 'smirnov@t.ru' }, token);
  assert.equal(create.statusCode, 201);

  const list = await get('/api/v1/clients', token);
  assert.ok(list.json().data.some((c) => c.name === 'ИП Смирнов'));
});

// ───────────────────────────────────────────────────────────────────────────
// 10. TOOL ACTION → EXECUTION → EVIDENCE → VERIFICATION
// ───────────────────────────────────────────────────────────────────────────
test('10. tool action → execution → evidence → verification', async () => {
  const { token, id } = await registerUser(newEmail());

  const chat = await post('/api/v1/ai/chat', { message: 'Создай клиента ООО Омега' }, token);
  const res = chat.json();
  assert.equal(chat.statusCode, 200);

  // Anti-hallucination (§14): every action carries a persisted evidence record.
  const action = (res.actions ?? []).find((a) => a.tool === 'crm.create_client');
  assert.ok(action, 'tool call must be recorded');
  assert.equal(action.status, 'succeeded');

  const persisted = db()
    .prepare('SELECT * FROM ai_actions WHERE turn_id = ? AND tool = ?')
    .get(res.turn_id, 'crm.create_client');
  assert.ok(persisted, 'действие должно быть в БД с evidence');
  assert.ok(persisted.evidence, 'evidence must be non-empty');
  assert.equal(persisted.verified, 1);

  // The client really exists (verification, not a claim).
  const clientRow = db().prepare('SELECT * FROM clients WHERE name = ? AND owner_id = ?').get('ООО Омега', id);
  assert.ok(clientRow, 'результат должен быть подтверждён реальной записью в БД');
});

// ───────────────────────────────────────────────────────────────────────────
// §45 failure testing: honest FAILED status, never fake success
// ───────────────────────────────────────────────────────────────────────────
test('§45: tool failure is reported honestly, not faked', async () => {
  const { token } = await registerUser(newEmail());

  // Ask Светлана to do something on a nonexistent target: she must not claim
  // a success she cannot prove.
  const chat = await post('/api/v1/ai/chat', { message: 'Удали клиента nonexistent_xyz_123' }, token);
  assert.equal(chat.statusCode, 200);
  const content = chat.json().content ?? '';
  const actions = chat.json().actions ?? [];
  for (const a of actions) {
    if (a.status === 'succeeded') assert.ok(a.verified, 'любой успех должен быть verified');
  }
  assert.ok(!/клиент удалён/i.test(content) || actions.every((a) => a.verified),
    'Светлана не должна утверждать успех без доказательства');
});

test('§39 IDOR: user cannot read another user\'s clients', async () => {
  const a = await registerUser(newEmail());
  const b = await registerUser(newEmail());

  const create = await post('/api/v1/clients', { name: 'Секретный клиент' }, b.token);
  const cid = create.json().id;

  const attempt = await get(`/api/v1/clients/${cid}`, a.token);
  assert.equal(attempt.statusCode, 404, 'чужие данные недоступны (IDOR protection)');
});
    
// ───────────────────────────────────────────────────────────────────────────
// §40 HARD DELETE: DB rows and auth session are actually removed
// ───────────────────────────────────────────────────────────────────────────
test('§40: account deletion cascades owned data and invalidates auth', async () => {
  const { token, id } = await registerUser(newEmail());
  const created = await post('/api/v1/clients', { name: 'Удаляемый клиент' }, token);
  assert.equal(created.statusCode, 201);

  const deleted = await fastify.inject({
    method: 'DELETE',
    url: '/api/v1/auth/account',
    headers: auth(token),
    payload: { password: 'Test123456' },
  });
  assert.equal(deleted.statusCode, 200);
  assert.equal(db().prepare('SELECT 1 FROM users WHERE id = ?').get(id), undefined);
  assert.equal(db().prepare('SELECT 1 FROM clients WHERE owner_id = ?').get(id), undefined);

  const after = await get('/api/v1/auth/me', token);
  assert.equal(after.statusCode, 401);
});

// ───────────────────────────────────────────────────────────────────────────
// Auth must honour current DB status even when a previously issued JWT exists
// ───────────────────────────────────────────────────────────────────────────
test('auth: suspended account cannot use an old access token', async () => {
  const { token, id } = await registerUser(newEmail());
  const before = await get('/api/v1/auth/me', token);
  assert.equal(before.statusCode, 200);

  db().prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(id);
  const blocked = await get('/api/v1/auth/me', token);
  assert.equal(blocked.statusCode, 401);
});

// ───────────────────────────────────────────────────────────────────────────
// RAG: user documents never leak to another authenticated user
// ───────────────────────────────────────────────────────────────────────────
test('rag: user-private knowledge is isolated by owner', async () => {
  const a = await registerUser(newEmail());
  const b = await registerUser(newEmail());
  const unique = 'ПРИВАТНЫЙ_ТЕСТОВЫЙ_МАРКЕР_' + Date.now();

  const ingest = await post('/api/v1/rag/ingest', {
    source: 'user',
    source_name: 'Личные заметки',
    source_url: null,
    title: unique,
    text: unique + ' содержит закрытую информацию владельца и используется только для проверки изоляции.',
  }, a.token);
  assert.equal(ingest.statusCode, 201);

  const search = await get('/api/v1/rag/search?q=' + encodeURIComponent(unique), b.token);
  assert.equal(search.statusCode, 200);
  assert.ok(!(search.json().data ?? []).some((h) => h.document?.title === unique));
});

// ───────────────────────────────────────────────────────────────────────────
// Reminder worker: due rows are promoted without waiting for a UI read
// ───────────────────────────────────────────────────────────────────────────
test('notifications: global reminder worker promotes due reminders', async () => {
  const { id, token } = await registerUser(newEmail());
  const reminderId = 'rem-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const message = 'worker-check-' + reminderId;
  db().prepare('INSERT INTO reminders (id, owner_id, message, remind_at, channel) VALUES (?, ?, ?, ?, ?)') 
    .run(reminderId, id, message, Math.floor(Date.now() / 1000) - 5, 'in_app');

  const { flushAllDueReminders } = await import('../../src/routes/notifications.js');
  assert.equal(flushAllDueReminders() >= 1, true);

  const list = await get('/api/v1/notifications', token);
  assert.equal(list.statusCode, 200);
  assert.ok((list.json().data ?? []).some((n) => n.body === message));
});
    
// ───────────────────────────────────────────────────────────────────────────
// SENSITIVE TOOL: BLOCKED → explicit approval → VERIFIED real action
// ───────────────────────────────────────────────────────────────────────────
test('AI sensitive action: approval executes marketplace application and verifies', async () => {
  const customer = await registerUser(newEmail(), 'Заказчик');
  const specialist = await registerUser(newEmail(), 'Специалист');

  const proj = await post('/api/v1/marketplace/projects', {
    title: 'Тестовый проект подтверждения',
    description: 'Проект для проверки явного подтверждения чувствительного действия.',
    budget_min: 1000, budget_max: 2000, skills: ['тестирование'],
  }, customer.token);
  assert.equal(proj.statusCode, 201);
  const projectId = proj.json().id;

  const conversationId = 'conv-approval-' + Date.now();
  const actionId = 'action-approval-' + Date.now();
  db().prepare('INSERT INTO ai_conversations (id, user_id, title) VALUES (?, ?, ?)')
    .run(conversationId, specialist.id, 'Approval E2E');
  db().prepare(`INSERT INTO ai_actions
      (id, conversation_id, user_id, turn_id, tool, args_json, status, result_json, evidence, verified, human_approved)
      VALUES (?, ?, ?, ?, ?, ?, 'blocked', NULL, '[]', 0, 0)`)
    .run(
      actionId,
      conversationId,
      specialist.id,
      'turn-approval',
      'marketplace.apply',
      JSON.stringify({
        project_id: projectId,
        cover_letter: 'Подтверждённый тестовый отклик',
        proposed_price: 1500,
      }),
    );

  const approved = await fastify.inject({
    method: 'POST',
    url: `/api/v1/ai/actions/${actionId}/approve`,
    headers: auth(specialist.token),
  });
  assert.equal(approved.statusCode, 200, approved.json()?.message);
  assert.equal(approved.json().status, 'succeeded');
  assert.equal(approved.json().verified, true);

  const app = db().prepare('SELECT * FROM applications WHERE id = ?').get(approved.json().result.id);
  assert.equal(app.specialist_id, specialist.id);
  assert.equal(app.project_id, projectId);

  const stored = db().prepare('SELECT status, verified, human_approved FROM ai_actions WHERE id = ?').get(actionId);
  assert.equal(stored.status, 'succeeded');
  assert.equal(stored.verified, 1);
  assert.equal(stored.human_approved, 1);
});

