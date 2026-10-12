import test from 'node:test';
import assert from 'node:assert/strict';
import { calcNpd } from '../src/npd/npd.js';
import { normalizeName, greetingFor } from '../src/components/welcomeText.js';

test('НПД: 4% и 6% с вычетом 1% / 2%', () => {
  const r = calcNpd({ person: 100000, business: 100000 });
  assert.equal(r.taxFull, 10000);
  assert.equal(r.deductionUsed, 3000);
  assert.equal(r.tax, 7000);
  assert.equal(r.deductionLeft, 7000);
});

test('НПД: вычет не больше остатка, без вычета — полная ставка', () => {
  assert.equal(calcNpd({ person: 50000, deductionLeft: 100 }).tax, 1900);
  assert.equal(calcNpd({ business: 50000, deductionLeft: 0 }).tax, 3000);
  assert.equal(calcNpd({ person: -5 }).tax, 0);
});

test('НПД: лимит 2,4 млн за год', () => {
  assert.equal(calcNpd({ person: 100000, yearIncomeBefore: 2200000 }).nearLimit, true);
  assert.equal(calcNpd({ person: 300000, yearIncomeBefore: 2200000 }).overLimit, true);
  assert.equal(calcNpd({ person: 100000 }).limitLeft, 2300000);
});

test('Светлана спрашивает имя: нормализация и приветствие без чужих имён', () => {
  assert.equal(normalizeName('  анна-мария '), 'Анна-Мария');
  assert.equal(normalizeName('иван петров'), 'Иван Петров');
  assert.equal(normalizeName('123'), '');
  assert.equal(normalizeName('<script>'), '');
  assert.match(greetingFor('Ольга'), /^Очень приятно, Ольга!/);
  assert.doesNotMatch(greetingFor(''), /Павел|undefined/);
});

test('НПД считается только с дохода в пределах лимита 2,4 млн', () => {
  const r = calcNpd({ person: 300000, deductionLeft: 0, yearIncomeBefore: 2200000 });
  assert.equal(r.taxableNpd, 200000);
  assert.equal(r.excess, 100000);
  assert.equal(r.tax, 8000);
  assert.equal(r.overLimit, true);
});

test('если лимит уже исчерпан, НПД к уплате 0', () => {
  const r = calcNpd({ business: 50000, deductionLeft: 0, yearIncomeBefore: 2400000 });
  assert.equal(r.tax, 0);
  assert.equal(r.excess, 50000);
});
