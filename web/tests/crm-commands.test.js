import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrmStore } from '../src/crm/crmStore.js';
import { parseCommand, runCommand } from '../src/crm/crmCommands.js';

const NOW = new Date(2026, 9, 11, 15, 0, 0).getTime();
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test('«добавь клиента» разбирает имя, телефон и e-mail и требует подтверждения', () => {
  const s = createCrmStore({ storage: mem(), clock: () => NOW });
  const cmd = parseCommand('Добавь клиента Анна Петрова +7 912 345-67-89 anna@mail.ru', s, NOW);
  assert.equal(cmd.kind, 'write');
  assert.equal(cmd.args.name, 'Анна Петрова');
  assert.deepEqual(cmd.args.phones, ['+7 912 345-67-89']);
  assert.deepEqual(cmd.args.emails, ['anna@mail.ru']);
  assert.equal(cmd.args.status, 'client');
  assert.equal(runCommand(cmd, s).needsConfirm, true);
  assert.equal(s.data.contacts.length, 0, 'без подтверждения ничего не меняется');
  assert.equal(runCommand(cmd, s, { confirmed: true }).ok, true);
  assert.equal(s.data.contacts.length, 1);
});

test('«сделка ... для Имя» находит контакт, сумму в тысячах и плательщика', () => {
  const s = createCrmStore({ storage: mem(), clock: () => NOW });
  const c = s.addContact({ name: 'Анна' });
  const cmd = parseCommand('сделка маникюр 2,5 тыс для Анна', s, NOW);
  assert.equal(cmd.args.title, 'маникюр');
  assert.equal(cmd.args.amount, 2500);
  assert.equal(cmd.args.contactId, c.id);
  assert.equal(cmd.args.payer, 'person');
  const biz = parseCommand('создай сделку сайт для ООО Ромашка 80000', s, NOW);
  assert.equal(biz.args.payer, 'business');
  assert.equal(biz.args.amount, 80000);
});

test('«напомни завтра» ставит срок на 9:00 следующего дня', () => {
  const s = createCrmStore({ storage: mem(), clock: () => NOW });
  const cmd = parseCommand('напомни завтра отправить счёт Ивану', s, NOW);
  assert.equal(cmd.args.text, 'отправить счёт Ивану');
  assert.equal(new Date(cmd.args.dueAt).getDate(), 12);
  assert.equal(new Date(cmd.args.dueAt).getHours(), 9);
  const d = parseCommand('задача: позвонить 15.10', s, NOW);
  assert.equal(new Date(d.args.dueAt).getMonth(), 9);
  assert.equal(new Date(d.args.dueAt).getDate(), 15);
});

test('чтение (сводка, поиск) выполняется без подтверждения; неизвестное — подсказка', () => {
  const s = createCrmStore({ storage: mem(), clock: () => NOW });
  s.addContact({ name: 'Пётр', phones: '+79990000000' });
  assert.match(runCommand(parseCommand('сводка', s, NOW), s).text, /1 контактов/);
  assert.match(runCommand(parseCommand('найди Пётр', s, NOW), s).text, /Пётр/);
  assert.equal(parseCommand('удали всё', s, NOW), null);
  assert.match(runCommand(null, s).text, /Не поняла/);
});
