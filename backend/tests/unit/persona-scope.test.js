import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enforceSiteScope, buildSystemPrompt, buildPublicSystemPrompt, OFF_TOPIC_REPLY } from '../../src/ai/persona.js';

test('промпт ограничивает тему платформой', () => {
  const p = buildSystemPrompt({});
  assert.match(p, /ТОЛЬКО ПЛАТФОРМА/);
  assert.match(p, /НИКОГДА не отправляй пользователя на сторонние сайты/);
  assert.match(p, /marketplace\.search_projects/);
});

test('ответ без внешних ссылок не меняется', () => {
  const t = 'Открой «Биржу заказов» (/app/marketplace) — там 12 подходящих заказов.';
  assert.equal(enforceSiteScope(t), t);
});

test('официальные ссылки ФНС остаются', () => {
  const t = 'Чек формируется в приложении «Мой налог»: https://lknpd.nalog.ru/ — это официальный кабинет ФНС для самозанятых.';
  assert.equal(enforceSiteScope(t), t);
});

test('пересылка на сторонние биржи заменяется ответом в рамках сайта', () => {
  const t = 'Чтобы найти работу, воспользуйтесь специализированными сайтами: hh.ru, Авито, Kwork и https://fl.ru';
  const out = enforceSiteScope(t);
  assert.ok(!/hh\.ru|Авито|Kwork|fl\.ru/i.test(out), out);
  assert.match(out, /\/app\/marketplace/);
  assert.ok(out.startsWith(OFF_TOPIC_REPLY));
});

test('погода через внешний сервис не проходит', () => {
  const out = enforceSiteScope('Погоду лучше посмотреть на сайте gismeteo.ru или в Яндекс Погоде.');
  assert.ok(!/gismeteo|яндекс/i.test(out), out);
  assert.match(out, /Мире Самозанятых/);
});

test('markdown-ссылка наружу превращается в текст', () => {
  const out = enforceSiteScope('Подробнее в разделе [Налоги](https://example.com/tax) нашей платформы, там всё расписано по шагам для самозанятых.');
  assert.ok(!/example\.com/.test(out), out);
  assert.match(out, /Налоги/);
});

test('публичный промпт тоже ограничен темой и без инструментов', () => {
  const p = buildPublicSystemPrompt();
  assert.match(p, /НИКОГДА не отправляй/);
  assert.match(p, /ПУБЛИЧНЫЙ РЕЖИМ/);
  assert.match(p, /\/register/);
});
