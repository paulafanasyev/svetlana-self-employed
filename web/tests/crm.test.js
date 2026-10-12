import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrmStore, STORAGE_KEY, phoneKey, csvSafe, parseCsv, NPD_YEAR_LIMIT, storageKeyFor, plural } from '../src/crm/crmStore.js';

function mem(initial) {
  const m = new Map(initial ? [[STORAGE_KEY, JSON.stringify(initial)]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), raw: m };
}

const T0 = Date.UTC(2026, 9, 11, 12, 0, 0);

test('контакт: создание, поиск по телефону в любом формате, дубли', () => {
  const s = createCrmStore({ storage: mem(), clock: () => T0 });
  const c = s.addContact({ name: 'Анна Петрова', phones: '+7 (912) 345-67-89', emails: 'Anna@Mail.ru', company: 'Студия' });
  assert.equal(c.status, 'lead');
  assert.deepEqual(c.emails, ['anna@mail.ru']);
  assert.equal(s.listContacts({ q: '89123456789' }).length, 1);
  assert.equal(s.listContacts({ q: 'студ' }).length, 1);
  assert.throws(() => s.addContact({ name: 'Дубль', phones: '8 912 345 67 89' }), /уже есть у «Анна Петрова»/);
  assert.throws(() => s.addContact({ name: '  ' }), /Имя контакта обязательно/);
  assert.equal(phoneKey('+7 (912) 345-67-89'), phoneKey('89123456789'));
});

test('удаление контакта не удаляет сделки и историю, а отвязывает их', () => {
  const s = createCrmStore({ storage: mem(), clock: () => T0 });
  const c = s.addContact({ name: 'Иван' });
  const d = s.addDeal({ title: 'Сайт', amount: '50 000', contactId: c.id });
  s.addActivity({ type: 'call', text: 'Созвон', contactId: c.id });
  assert.equal(s.getContact(c.id).lastContactAt, T0);
  s.deleteContact(c.id);
  assert.equal(s.getDeal(d.id).contactId, undefined);
  assert.equal(s.data.activities[0].contactId, undefined);
  assert.equal(s.getDeal(d.id).amount, 50000);
});

test('сделки: этапы, closedAt, отрицательная сумма запрещена', () => {
  let now = T0;
  const s = createCrmStore({ storage: mem(), clock: () => now });
  assert.throws(() => s.addDeal({ title: 'X', amount: -5 }), /неотрицательным/);
  const d = s.addDeal({ title: 'Маникюр', amount: '2500,50' });
  assert.equal(d.amount, 2500.5);
  assert.equal(s.moveDeal(d.id, 'back').stage, 'new');
  assert.equal(s.moveDeal(d.id, 'forward').stage, 'qualified');
  now += 1000;
  const won = s.moveDeal(d.id, 'won');
  assert.equal(won.closedAt, now);
  assert.equal(s.moveDeal(d.id, 'proposal').closedAt, undefined);
});

test('сводка: воронка, конверсия, НПД 4%/6%, лимит, чеки', () => {
  const s = createCrmStore({ storage: mem(), clock: () => T0 });
  s.addDeal({ title: 'A', amount: 100000, stage: 'won', payer: 'person' });
  s.addDeal({ title: 'B', amount: 100000, stage: 'won', payer: 'business', receipt: true });
  s.addDeal({ title: 'C', amount: 30000, stage: 'lost' });
  s.addDeal({ title: 'D', amount: 70000, stage: 'proposal' });
  const st = s.stats();
  assert.equal(st.openDeals, 1);
  assert.equal(st.pipelineValue, 70000);
  assert.equal(st.wonValue, 200000);
  assert.equal(st.conversion, 67);
  assert.equal(st.npdEstimate, 4000 + 6000);
  assert.equal(st.receiptsMissing, 1);
  assert.equal(st.npdLimitShare, 200000 / NPD_YEAR_LIMIT);
  assert.match(s.summaryText(), /оплаченным сделкам: 1/);
});

test('задачи: просрочка и выполнение', () => {
  const s = createCrmStore({ storage: mem(), clock: () => T0 });
  const t = s.addActivity({ type: 'task', text: 'Отправить счёт', dueAt: T0 - 86400000 });
  assert.equal(s.stats().overdueTasks, 1);
  s.setTaskDone(t.id, true);
  assert.equal(s.stats().openTasks, 0);
  assert.equal(s.listActivities({ type: 'task' })[0].completedAt, T0);
});

test('резервная копия: круговой обмен и защита от мусора', () => {
  const st = mem();
  const s = createCrmStore({ storage: st, clock: () => T0 });
  s.addContact({ name: 'Ольга', phones: '+79001112233' });
  s.addDeal({ title: 'Фотосессия', amount: 8000 });
  const backup = s.exportJSON();
  const s2 = createCrmStore({ storage: mem(), clock: () => T0 });
  assert.deepEqual(s2.importJSON(backup), { contacts: 1, deals: 1, activities: 0 });
  assert.throws(() => s2.importJSON('{oops'), /не похож на резервную копию/);
  assert.throws(() => s2.importJSON('{"a":1}'), /не похож на резервную копию/);
  // данные пережили перезагрузку
  assert.equal(createCrmStore({ storage: st, clock: () => T0 }).data.contacts[0].name, 'Ольга');
});

test('повреждённые данные в хранилище не ломают CRM', () => {
  const s = createCrmStore({ storage: mem({ contacts: [{ id: 'x', name: 'Ок', status: 'vip' }, { name: 'без id' }], deals: [{ id: 'd', title: 'T', stage: '???', amount: 'abc', contactId: 'нет' }] }), clock: () => T0 });
  assert.equal(s.data.contacts.length, 1);
  assert.equal(s.data.contacts[0].status, 'other');
  assert.equal(s.data.deals[0].stage, 'new');
  assert.equal(s.data.deals[0].amount, 0);
  assert.equal(s.data.deals[0].contactId, undefined);
});

test('CSV: экспорт без формул, импорт с объединением дублей и ; разделителем', () => {
  assert.equal(csvSafe('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.deepEqual(parseCsv('a;"b;c"\r\n1;2'), [['a', 'b;c'], ['1', '2']]);
  const s = createCrmStore({ storage: mem(), clock: () => T0 });
  s.addContact({ name: 'Анна', phones: '+79123456789' });
  const res = s.importCSV('Имя;Телефон;Компания\nАнна П.;89123456789;Салон\nПётр;+7 999 000-00-00;\n;+7 111 222-33-44;\n');
  assert.deepEqual(res, { added: 1, merged: 1, skipped: 1 });
  assert.equal(s.listContacts({ q: 'анна' })[0].company, 'Салон');
  const csv = s.exportCSV();
  assert.ok(csv.startsWith('\uFEFFИмя,Телефоны'));
  assert.throws(() => s.importCSV('Телефон\n123'), /нет колонки «Имя»/);
});

test('данные разных пользователей не смешиваются', () => {
  const storage = new Map();
  const st = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) };
  const a = createCrmStore({ storage: st, key: storageKeyFor('user-a') });
  a.addContact({ name: 'Анна' });
  const b = createCrmStore({ storage: st, key: storageKeyFor('user-b') });
  assert.equal(b.listContacts().length, 0);
  const a2 = createCrmStore({ storage: st, key: storageKeyFor('user-a') });
  assert.equal(a2.listContacts().length, 1);
});

test('склонение в сводке', () => {
  assert.equal(plural(1, ['контакт', 'контакта', 'контактов']), 'контакт');
  assert.equal(plural(3, ['контакт', 'контакта', 'контактов']), 'контакта');
  assert.equal(plural(11, ['контакт', 'контакта', 'контактов']), 'контактов');
  assert.equal(plural(21, ['контакт', 'контакта', 'контактов']), 'контакт');
});

test('редактирование не создаёт дубль по телефону', () => {
  const m = new Map();
  const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  const s = createCrmStore({ storage: st });
  s.addContact({ name: 'Анна', phones: ['+7 900 111-22-33'] });
  const b = s.addContact({ name: 'Борис', phones: ['+7 900 999-88-77'] });
  assert.throws(() => s.updateContact(b.id, { phones: ['8 (900) 111-22-33'] }), /уже есть у «Анна»/);
  assert.equal(s.updateContact(b.id, { name: 'Борис П.' }).name, 'Борис П.');
});
