/** Одна Светлана — разные сайты: каждый профиль держит свою тему. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SITES, SITE_IDS, redactPersonal, tidyForChild } from '../../src/ai/sites.js';

test('есть профили всех сайтов экосистемы', () => {
  for (const id of ['mir', 'aiko', 'zaryadka', 'repetitor', 'svetlana2']) assert.ok(SITES[id], id);
  assert.deepEqual(SITE_IDS.filter((id) => SITES[id].fullMode), ['svetlana2'], 'код и команда — только в Svetlana 2.0');
});

test('промпты: тема сайта и запрет кода вне Svetlana 2.0', () => {
  assert.match(SITES.aiko.prompt(), /ТОЛЬКО МАРКЕТПЛЕЙС/);
  assert.match(SITES.zaryadka.prompt(), /Пико/);
  assert.match(SITES.repetitor.prompt(), /ТОЛЬКО УЧЁБА/);
  assert.match(SITES.repetitor.prompt(), /код за пользователя здесь нельзя/);
  assert.match(SITES.svetlana2.prompt(), /писать, объяснять и проверять код/);
  assert.match(SITES.svetlana2.prompt(), /управлять командой/);
});

test('АИКО не отправляет на другие маркетплейсы', () => {
  const out = SITES.aiko.enforce('Этот товар дешевле на Wildberries: https://wildberries.ru/x, поищите в интернете на других сайтах.');
  assert.ok(!/wildberries/i.test(out));
  assert.match(out, /только с маркетплейсом АИКО/);
});

test('Пико: любая ссылка или сервис — ответ заменяется целиком', () => {
  assert.match(SITES.zaryadka.enforce('Посмотри видео на YouTube!'), /Я помогаю с зарядкой/);
  assert.match(SITES.zaryadka.enforce('Ответ есть в ГДЗ'), /Я помогаю с зарядкой/);
  const ok = 'Ноги на ширине плеч, приседай, как будто садишься на стул. Сделаем 5 раз?';
  assert.equal(SITES.zaryadka.enforce(ok), ok);
});

test('Репетитор: ГДЗ убирается, ФИПИ можно', () => {
  const t = 'Демоверсии ОГЭ есть на fipi.ru — это официальный сайт. Разберём первое задание по шагам: что известно в условии? Попробуй выписать данные.';
  assert.equal(SITES.repetitor.enforce(t), t);
  const bad = SITES.repetitor.enforce('Спиши ответ из решебника на gdz.ru');
  assert.match(bad, /только с учёбой/);
});

test('Svetlana 2.0 не режет ответ', () => {
  const code = 'Вот пример: fetch("https://api.github.com/repos/x") — и проверь статус.';
  assert.equal(SITES.svetlana2.enforce(code), code);
});

test('телефоны и e-mail скрываются, детский ответ без markdown', () => {
  assert.ok(!/914|kid@/.test(redactPersonal('мой номер +7 914 828-99-64, почта kid@mail.ru')));
  assert.equal(tidyForChild('**Молодец!**'), 'Молодец!');
});

test('из браузера можно звать только АИКО и Репетитор', () => {
  const browser = SITE_IDS.filter((id) => SITES[id].publicOk);
  assert.deepEqual(browser.sort(), ['aiko', 'repetitor']);
  assert.match(SITES.repetitor.prompt(), /всей школьной программе 1–11 класса/);
  assert.match(SITES.repetitor.prompt(), /строго в этом формате/);
});

test('свои инструкции (system) с ключом передают только Svetlana 2.0 и АИКО', () => {
  const ids = SITE_IDS.filter((id) => SITES[id].fullMode || SITES[id].acceptsSystem);
  assert.deepEqual(ids.sort(), ['aiko', 'svetlana2']);
  assert.ok(!SITES.aiko.fullMode, 'АИКО не получает полный режим');
  assert.match(SITES.aiko.prompt(), /только в рамках этих правил/);
  assert.match(SITES.aiko.enforce('Сравните с Ozon'), /только с маркетплейсом АИКО/);
});
