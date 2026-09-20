/**
 * Конкуренты — разведка по конкурентам (§27). Только наблюдаемые, публичные
 * факты, которые пользователь сам внёс из открытых источников: платформа не
 * собирает и не придумывает данные о конкурентах.
 *
 * В схеме competitors нет полей сильных/слабых сторон и цен — они выводятся
 * только если backend когда-нибудь начнёт их возвращать.
 */
import { useState } from 'react';
import { competitors } from '../api.js';
import {
  useResource, EmptyState, ErrorState, fmtDate, fmtMoney, plural, confirmAction,
} from '../ui.jsx';

export default function Competitors() {
  const [q, setQ] = useState('');
  const { data, loading, error, reload, setData } = useResource(
    () => competitors.list(q ? `?q=${encodeURIComponent(q)}` : ''),
    [q],
  );
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const rows = data?.data ?? [];

  const create = async (body) => {
    const created = await competitors.create(body);
    setData((d) => ({ ...d, data: [created, ...(d?.data ?? [])], total: (d?.total ?? 0) + 1 }));
    setShowForm(false);
    setEditing(null);
  };

  const update = async (id, body) => {
    const updated = await competitors.update(id, body);
    setData((d) => ({ ...d, data: (d?.data ?? []).map((r) => (r.id === id ? updated : r)) }));
    setEditing(null);
    setShowForm(false);
  };

  const remove = async (id) => {
    if (!confirmAction('Удалить карточку конкурента? Это действие необратимо.')) return;
    await competitors.delete(id);
    setData((d) => ({ ...d, data: (d?.data ?? []).filter((r) => r.id !== id), total: (d?.total ?? 0) - 1 }));
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="stack">
      <div className="alert info" style={{ margin: 0 }}>
        Анализ основан на данных, которые вы сами внесли из открытых источников.
        Платформа не собирает факты о конкурентах автоматически и ничего не
        выдумывает: чем больше наблюдений вы сохраните, тем точнее картина.
      </div>

      <div className="row between">
        <div className="field" style={{ margin: 0, flex: '1 1 220px' }}>
          <input
            type="search"
            placeholder="Поиск по названию, позиционированию, заметкам…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Поиск конкурентов"
          />
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Добавить конкурента
        </button>
      </div>

      {showForm && (
        <CompetitorForm
          initial={editing}
          onSubmit={(body) => (editing ? update(editing.id, body) : create(body))}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {loading && <p className="muted">Загружаю конкурентов…</p>}
      {!loading && rows.length === 0 && (
        <EmptyState
          icon="🔍"
          title="Конкуренты ещё не добавлены"
          hint="Добавьте конкурента вручную, чтобы фиксировать наблюдения по нему."
        />
      )}
      {!loading && rows.length > 0 && (
        <div className="grid grid-2">
          {rows.map((c) => (
            <div className="card" key={c.id}>
              <div className="row between" style={{ alignItems: 'flex-start', gap: 8 }}>
                <strong style={{ flex: '1 1 auto' }}>{c.name}</strong>
                <span className="small muted">{fmtDate(c.created_at)}</span>
              </div>

              {c.website ? (
                <p className="small" style={{ margin: '4px 0' }}>
                  Сайт:{' '}
                  <a href={c.website} target="_blank" rel="noopener noreferrer">
                    {c.website}
                  </a>
                </p>
              ) : (
                <p className="small muted" style={{ margin: '4px 0' }}>Сайт не указан.</p>
              )}

              {c.position && (
                <p className="small" style={{ margin: '0 0 6px' }}>
                  <strong>Позиционирование:</strong> {c.position}
                </p>
              )}
              {c.notes && (
                <p className="small muted" style={{ margin: '0 0 6px' }}>{c.notes}</p>
              )}
              {c.strengths && (
                <p className="small" style={{ margin: '0 0 6px' }}>
                  <strong>Сильные стороны:</strong> {c.strengths}
                </p>
              )}
              {c.weaknesses && (
                <p className="small" style={{ margin: '0 0 6px' }}>
                  <strong>Слабые стороны:</strong> {c.weaknesses}
                </p>
              )}
              {(c.price_from != null || c.price_to != null) && (
                <p className="small" style={{ margin: '0 0 6px' }}>
                  <strong>Цены:</strong> {c.price_from != null ? fmtMoney(c.price_from, c.currency) : '—'}
                  {' – '}
                  {c.price_to != null ? fmtMoney(c.price_to, c.currency) : '—'}
                </p>
              )}

              <div className="row" style={{ gap: 4, marginTop: 8 }}>
                <button className="btn btn-sm" onClick={() => { setEditing(c); setShowForm(true); }}>
                  Изменить
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => remove(c.id)}>
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <p className="small muted">
          Всего: {data?.total} {plural(data?.total ?? 0, 'конкурент', 'конкурента', 'конкурентов')}
        </p>
      )}
    </div>
  );
}

function CompetitorForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    website: initial?.website ?? '',
    position: initial?.position ?? '',
    notes: initial?.notes ?? '',
  });
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError('Укажите название компании-конкурента'); return; }
    try {
      await onSubmit({
        name: form.name.trim(),
        website: form.website.trim() || null,
        position: form.position.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
    } catch (err) {
      setError(err?.message || 'Не удалось сохранить конкурента');
    }
  };

  return (
    <div className="card">
      <h3>{initial ? 'Изменить конкурента' : 'Новый конкурент'}</h3>
      {error && <div className="alert err" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="cp-name">Название *</label>
            <input id="cp-name" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="cp-site">Сайт</label>
            <input id="cp-site" type="url" placeholder="https://example.ru" value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="cp-position">Позиционирование</label>
          <input id="cp-position" placeholder="например, премиум-сегмент, онлайн-школа для новичков"
            value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="cp-notes">Заметки</label>
          <textarea id="cp-notes" rows={3} placeholder="Что известно из открытых источников"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="row">
          <button className="btn btn-primary" type="submit">{initial ? 'Сохранить' : 'Добавить'}</button>
          <button className="btn" type="button" onClick={onCancel}>Отмена</button>
        </div>
      </form>
    </div>
  );
}
