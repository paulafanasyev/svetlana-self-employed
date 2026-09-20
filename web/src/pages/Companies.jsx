/**
 * Компании — список компаний CRM (§15). Полный CRUD.
 */
import { useState } from 'react';
import { crm } from '../api.js';
import {
  useResource, EmptyState, ErrorState, fmtDate, plural, confirmAction,
} from '../ui.jsx';

export default function Companies() {
  const [q, setQ] = useState('');
  const { data, loading, error, reload, setData } = useResource(() => crm.companies(q), [q]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const rows = data?.data ?? [];

  const create = async (body) => {
    const created = await crm.createCompany(body);
    setData((d) => ({ ...d, data: [created, ...(d?.data ?? [])], total: (d?.total ?? 0) + 1 }));
    setShowForm(false);
    setEditing(null);
  };

  const update = async (id, body) => {
    const updated = await crm.updateCompany(id, body);
    setData((d) => ({ ...d, data: (d?.data ?? []).map((r) => (r.id === id ? updated : r)) }));
    setEditing(null);
    setShowForm(false);
  };

  const remove = async (id) => {
    if (!confirmAction('Удалить компанию? Это действие необратимо.')) return;
    await crm.deleteCompany(id);
    setData((d) => ({ ...d, data: (d?.data ?? []).filter((r) => r.id !== id), total: (d?.total ?? 0) - 1 }));
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="stack">
      <div className="row between">
        <div className="field" style={{ margin: 0, flex: '1 1 220px' }}>
          <input
            type="search"
            placeholder="Поиск по названию, ИНН, отрасли…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Поиск компаний"
          />
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Добавить компанию
        </button>
      </div>

      {showForm && (
        <CompanyForm
          initial={editing}
          onSubmit={(body) => (editing ? update(editing.id, body) : create(body))}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading && <p className="muted" style={{ padding: 18 }}>Загружаю компании…</p>}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon="🏢"
            title="Компаний пока нет"
            hint="Добавьте первую компанию вручную или попросите Светлану: «создай компанию ООО Вектор»"
          />
        )}
        {!loading && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Название</th><th>ИНН</th><th>Сайт</th><th>Отрасль</th>
                  <th>Размер</th><th>Создана</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong></td>
                    <td className="small">{c.inn ?? '—'}</td>
                    <td className="small">
                      {c.website
                        ? <a href={c.website} target="_blank" rel="noreferrer">{c.website}</a>
                        : '—'}
                    </td>
                    <td className="small">{c.industry ?? '—'}</td>
                    <td className="small">{c.size ?? '—'}</td>
                    <td className="small muted">{fmtDate(c.created_at)}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => { setEditing(c); setShowForm(true); }}>
                          Изменить
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(c.id)}>
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && rows.length > 0 && (
        <p className="small muted">Всего: {data?.total} {plural(data?.total ?? 0, 'компания', 'компании', 'компаний')}</p>
      )}
    </div>
  );
}

function CompanyForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    inn: initial?.inn ?? '',
    website: initial?.website ?? '',
    industry: initial?.industry ?? '',
    size: initial?.size ?? '',
    notes: initial?.notes ?? '',
  });
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError('Укажите название компании'); return; }
    try {
      await onSubmit({
        name: form.name.trim(),
        inn: form.inn.trim() || null,
        website: form.website.trim() || null,
        industry: form.industry.trim() || null,
        size: form.size.trim() || null,
        notes: form.notes.trim() || null,
      });
    } catch (err) {
      setError(err?.message || 'Не удалось сохранить компанию');
    }
  };

  return (
    <div className="card">
      <h3>{initial ? 'Изменить компанию' : 'Новая компания'}</h3>
      {error && <div className="alert err" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="co-name">Название *</label>
            <input id="co-name" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="co-inn">ИНН</label>
            <input id="co-inn" maxLength={20} value={form.inn}
              onChange={(e) => setForm({ ...form, inn: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="co-website">Сайт</label>
            <input id="co-website" type="url" placeholder="https://example.ru" value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="co-industry">Отрасль</label>
            <input id="co-industry" value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="co-size">Размер</label>
            <input id="co-size" placeholder="например, 11–50 человек" value={form.size}
              onChange={(e) => setForm({ ...form, size: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="co-notes">Заметки</label>
          <textarea id="co-notes" rows={3} value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="row">
          <button className="btn btn-primary" type="submit">{initial ? 'Сохранить' : 'Создать'}</button>
          <button className="btn" type="button" onClick={onCancel}>Отмена</button>
        </div>
      </form>
    </div>
  );
}
