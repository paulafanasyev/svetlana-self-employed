/**
 * Гранты и государственная поддержка (§19).
 *
 * Каталог только для чтения: персональная подборка под профиль пользователя +
 * полный поиск по программам с фильтрами. Каждая программа ведёт на
 * официальный источник (§18 — факт не существует без ссылки).
 */
import { useState } from 'react';
import { government } from '../api.js';
import { useResource, Badge, EmptyState, ErrorState, fmtDate, fmtMoney, plural } from '../ui.jsx';

const KINDS = [
  { value: '', label: 'Все типы' },
  { value: 'grant', label: 'Грант' },
  { value: 'subsidy', label: 'Субсидия' },
  { value: 'social_contract', label: 'Социальный контракт' },
  { value: 'loan', label: 'Заём' },
  { value: 'training', label: 'Обучение' },
  { value: 'compensation', label: 'Компенсация' },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label]));

function amountRange(g) {
  const cur = g.currency ?? 'RUB';
  if (g.amount_min && g.amount_max) return `${fmtMoney(g.amount_min, cur)} – ${fmtMoney(g.amount_max, cur)}`;
  if (g.amount_max) return `до ${fmtMoney(g.amount_max, cur)}`;
  if (g.amount_min) return `от ${fmtMoney(g.amount_min, cur)}`;
  return 'размер не указан';
}

function GrantCard({ g }) {
  return (
    <div className="card">
      <div className="row between" style={{ gap: 8 }}>
        <Badge status="info">{KIND_LABEL[g.kind] ?? g.kind}</Badge>
        <span className="small muted">{g.funder ?? '—'}{g.region ? ` · ${g.region}` : ''}</span>
      </div>
      <h3 style={{ margin: '8px 0 4px' }}>{g.title}</h3>
      <p className="small muted" style={{ margin: '0 0 8px' }}>
        {g.description ? g.description.slice(0, 220) + (g.description.length > 220 ? '…' : '') : ''}
      </p>
      <div className="row between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontWeight: 700 }}>{amountRange(g)}</div>
          <div className="small muted">
            Срок действия: {fmtDate(g.effective_at) === '—' ? 'не указан' : fmtDate(g.effective_at)}
            {g.published_at ? ` · опубликовано ${fmtDate(g.published_at)}` : ''}
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {g.doc_url && (
            <a className="btn btn-sm" href={g.doc_url} target="_blank" rel="noopener noreferrer">Документ</a>
          )}
          <a className="btn btn-sm btn-primary" href={g.url} target="_blank" rel="noopener noreferrer">Открыть ↗</a>
        </div>
      </div>
      <p className="small muted" style={{ margin: '10px 0 0' }}>
        Источник: {g.source_name}
        {g.retrieved_at ? ` · данные от ${fmtDate(g.retrieved_at)}` : ''}
      </p>
    </div>
  );
}

export default function Grants() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [region, setRegion] = useState('');

  const parts = [];
  if (q.trim()) parts.push(`q=${encodeURIComponent(q.trim())}`);
  if (kind) parts.push(`kind=${encodeURIComponent(kind)}`);
  if (region.trim()) parts.push(`region=${encodeURIComponent(region.trim())}`);
  const params = parts.length ? `?${parts.join('&')}` : '';

  const pers = useResource(() => government.grantsPersonalized(), []);
  const list = useResource(() => government.grants(params), [params]);

  const persRows = pers.data?.data ?? [];
  const rows = list.data?.data ?? [];
  const matchedRegion = pers.data?.matched_region;

  return (
    <div className="stack">
      <div className="card">
        <div className="row between">
          <div>
            <h3 style={{ margin: 0 }}>Подобрано под ваш профиль</h3>
            <p className="muted small" style={{ margin: '4px 0 0' }}>
              {matchedRegion
                ? `Регион из профиля: ${matchedRegion}`
                : 'Регион в профиле не указан — подборка общая. Укажите город в профиле, чтобы стало точнее.'}
            </p>
          </div>
          {!pers.loading && !pers.error && persRows.length > 0 && (
            <span className="badge ok">{persRows.length} программ</span>
          )}
        </div>
        {pers.loading && <p className="muted" style={{ marginTop: 10 }}>Загружаю подборку…</p>}
        {pers.error && <div style={{ marginTop: 10 }}><ErrorState error={pers.error} onRetry={pers.reload} /></div>}
        {!pers.loading && !pers.error && persRows.length === 0 && (
          <div style={{ marginTop: 10 }}>
            <EmptyState icon="🎁" title="Подборка пуста" hint="Заполните профиль — и персональные программы появятся здесь" />
          </div>
        )}
        {!pers.loading && !pers.error && persRows.length > 0 && (
          <div className="stack" style={{ marginTop: 10 }}>
            {persRows.slice(0, 3).map((g) => (
              <div key={g.id} className="row between" style={{ gap: 8, alignItems: 'center' }}>
                <span className="small">{g.title}</span>
                <span className="badge">{amountRange(g)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0, flex: '1 1 220px' }}>
          <input
            type="search"
            placeholder="Поиск по названию и описанию…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Поиск программ поддержки"
          />
        </div>
        <div className="field" style={{ margin: 0, flex: '0 1 190px' }}>
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Тип программы">
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0, flex: '0 1 180px' }}>
          <input
            type="search"
            placeholder="Регион…"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            aria-label="Фильтр по региону"
          />
        </div>
      </div>

      {list.loading && <p className="muted">Загружаю каталог программ…</p>}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && rows.length === 0 && (
        <div className="card">
          <EmptyState
            icon="🔍"
            title="Ничего не найдено"
            hint="Измените запрос, тип программы или регион — либо сбросьте фильтры"
          />
        </div>
      )}
      {!list.loading && !list.error && rows.length > 0 && (
        <>
          <div className="grid grid-2">
            {rows.map((g) => <GrantCard key={g.id} g={g} />)}
          </div>
          <p className="small muted">
            Показано: {rows.length} {plural(rows.length, 'программа', 'программы', 'программ')}
            {params ? ' по фильтрам' : ' без фильтров'}
          </p>
        </>
      )}
    </div>
  );
}
