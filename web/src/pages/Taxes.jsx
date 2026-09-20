/**
 * Налоги и ФНС (§17) — ответы по базе знаний RAG с цитатами.
 *
 * Ответы не выдумываются: каждое утверждение идёт из найденного фрагмента
 * документа со ссылкой на официальный источник. Если источников нет —
 * страница прямо об этом говорит.
 */
import { useState } from 'react';
import { rag } from '../api.js';
import { EmptyState, ErrorState, fmtDate } from '../ui.jsx';

const SUGGESTED = [
  'Какие налоги платит самозанятый на НПД?',
  'Какие ставки НПД: 4% и 6%?',
  'Какой лимит дохода у самозанятого?',
  'Нужно ли подавать декларацию на НПД?',
  'До какого числа нужно платить налог самозанятому?',
];

const OFFICIAL_RESOURCES = [
  { url: 'https://lknpd.nalog.ru/', host: 'lknpd.nalog.ru', title: 'Кабинет плательщика НПД «Мой налог»', note: 'Регистрация, чеки, ставки и уплата налога' },
  { url: 'https://www.nalog.gov.ru/', host: 'nalog.gov.ru', title: 'Сайт ФНС России', note: 'Раздел «Самозанятые»: правила, лимиты, порядок' },
  { url: 'https://lkip.nalog.ru/', host: 'lkip.nalog.ru', title: 'Личный кабинет индивидуального предпринимателя', note: 'Для тех, кто работает как ИП' },
  { url: 'https://frdo.gov.ru/', host: 'frdo.gov.ru', title: 'Федеральный реестр документов об образовании', note: 'Проверка дипломов и сертификатов об обучении' },
];

// Общие ориентиры по НПД из базы знаний RAG и официальных источников ФНС.
// Номера законов намеренно не цитируются — точную правовую базу смотрите в
// ответе RAG или на nalog.gov.ru.
const KEY_DATES = [
  'Уплата НПД — ежемесячно, не позднее 28-го числа месяца, следующего за отчётным.',
  'Налоговый период по НПД — календарный месяц.',
  'Декларация по НПД не подаётся: налог считается автоматически по пробитым чекам.',
  'Чек формируется в приложении «Мой налог» в момент расчёта, а при безналичных оплатах — не позднее 9-го числа следующего месяца.',
  'Лимит дохода на НПД — 2,4 млн ₽ в год; при превышении нужно переходить на другой режим.',
];

function confidenceBadge(score) {
  const pct = Math.round((score ?? 0) * 100);
  const tone = score >= 0.5 ? 'ok' : score >= 0.3 ? 'warn' : 'err';
  return <span className={`badge ${tone}`}>релевантность {pct}%</span>;
}

export default function Taxes() {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState(null); // { hits, count } после ответа
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const ask = async (text) => {
    const q = (text ?? question).trim();
    if (!q || loading) return;
    setError(null);
    setLoading(true);
    setQuestion(q);
    try {
      const res = await rag.search(`?q=${encodeURIComponent(q)}`);
      setResult({ hits: res?.data ?? [], count: res?.count ?? 0 });
    } catch (err) {
      setError(err);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const hits = result?.hits ?? [];

  return (
    <div className="stack">
      <div className="card">
        <h3>Спросить про налоги</h3>
        <p className="muted small">
          Ответы формируются по базе знаний RAG из официальных источников — с цитатами и ссылками.
          Если подходящего источника нет, система честно скажет об этом.
        </p>
        <div className="row" style={{ gap: 8 }}>
          <div className="field" style={{ margin: 0, flex: '1 1 260px' }}>
            <input
              type="search"
              placeholder="Например: какие налоги платит самозанятый на НПД?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
              aria-label="Налоговый вопрос"
            />
          </div>
          <button className="btn btn-primary" onClick={() => ask()} disabled={loading || !question.trim()}>
            {loading ? 'Ищу…' : 'Спросить'}
          </button>
        </div>
        <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {SUGGESTED.map((s) => (
            <button key={s} className="btn btn-sm" onClick={() => ask(s)} disabled={loading}>{s}</button>
          ))}
        </div>
      </div>

      {loading && <p className="muted">Ищу в базе знаний…</p>}
      {error && <ErrorState error={error} onRetry={() => ask(question)} />}
      {!loading && !error && result && result.count === 0 && (
        <div className="card">
          <EmptyState
            icon="🔍"
            title="Источники не найдены"
            hint="В базе знаний нет подходящего материала. Переформулируйте вопрос или проверьте официальные ресурсы ФНС ниже — мы не выдумываем ответы."
          />
        </div>
      )}
      {!loading && !error && result && hits.length > 0 && (
        <div className="stack">
          <p className="small muted">
            Найдено источников: {result.count}. Ответ основан на фрагментах документов — проверяйте
            первоисточник по ссылке.
          </p>
          {hits.map((h, i) => {
            const d = h.document ?? {};
            return (
              <div key={h.chunk?.id ?? i} className="card">
                <div className="row between" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <strong>{d.title ?? 'Источник'}</strong>
                  {confidenceBadge(h.score)}
                </div>
                <p className="small" style={{ margin: '8px 0' }}>{h.quote}</p>
                <p className="small muted" style={{ margin: '0 0 8px' }}>
                  Источник: {d.sourceName ?? '—'}
                  {d.publishedAt ? ` · опубликовано ${fmtDate(d.publishedAt)}` : ''}
                  {d.effectiveAt ? ` · действует с ${fmtDate(d.effectiveAt)}` : ''}
                  {d.retrievedAt ? ` · получено ${fmtDate(d.retrievedAt)}` : ''}
                </p>
                {d.sourceUrl && (
                  <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                    Открыть источник ↗
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3>Ключевые даты НПД</h3>
          <p className="muted small">Общие ориентиры из базы знаний RAG и официальных источников ФНС</p>
          <ul style={{ margin: '10px 0 0', paddingLeft: 20 }} className="small">
            {KEY_DATES.map((d) => <li key={d} style={{ marginBottom: 8 }}>{d}</li>)}
          </ul>
          <p className="muted small" style={{ margin: '12px 0 0' }}>
            Сроки могут отличаться для отдельных случаев — уточняйте через вопрос выше или на nalog.gov.ru.
          </p>
        </div>

        <div className="card">
          <h3>Официальные ресурсы</h3>
          <p className="muted small">Все ссылки — внешние, открываются на официальных сайтах ФНС и Минпросвещения</p>
          <div className="stack" style={{ marginTop: 10 }}>
            {OFFICIAL_RESOURCES.map((r) => (
              <div key={r.host}>
                <a href={r.url} target="_blank" rel="noopener noreferrer"><strong>{r.title} ↗</strong></a>
                <div className="small muted">{r.host} — {r.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="alert info" role="note">
        <strong>Статус интеграции с ФНС.</strong> У сервиса «Мой налог» нет публичного открытого API
        для третьих лиц, поэтому платформа не имитирует обмен данными с налоговой. Вместо этого
        используются официальные веб-кабинеты (lknpd.nalog.ru, nalog.gov.ru) и база знаний RAG с
        цитированием реальных источников. Действия, требующие передачи данных в ФНС, вы выполняете
        самостоятельно на официальных ресурсах.
      </div>
    </div>
  );
}
