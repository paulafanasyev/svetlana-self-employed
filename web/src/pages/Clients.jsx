/**
 * Клиенты — основная CRM-страница (§15).
 */
import { useState } from 'react';
import { crm } from '../api.js';
import {
  useResource, Badge, EmptyState, ErrorState, fmtDate, confirmAction,
} from '../ui.jsx';

export default function Clients() {
  const [q, setQ] = useState('');
  const { data, loading, error, reload, setData } = useResource(() => crm.clients(q), [q]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const rows = data?.data ?? [];

  const create = async (body) => {
    const created = await crm.createClient(body);
    setData((d) => ({ ...d, data: [created, ...(d?.data ?? [])], total: (d?.total ?? 0) + 1 }));
    setShowForm(false);
    setEditing(null);
  };

  const update = async (id, body) => {
    const updated = await crm.updateClient(id, body);
    setData((d) => ({ ...d, data: (d?.data ?? []).map((r) => (r.id === id ? updated : r)) }));
    setEditing(null);
    setShowForm(false);
  };

  const remove = async (id) => {
    if (!confirmAction('Удалить клиента? Это действие необратимо.')) return;
    await crm.deleteClient(id);
    setData((d) => ({ ...d, data: (d?.data ?? []).filter((r) => r.id !== id), total: (d?.total ?? 0) - 1 }));
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="stack">
      <div className="row between">
        <div className="field" style={{ margin: 0, flex: '1 1 220px' }}>
          <input
            type="search"
            placeholder="Поиск по имени, email, телефону…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Поиск клиентов"
          />
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Добавить клиента
        </button>
      </div>

      {showForm && (
        <ClientForm
          initial={editing}
          onSubmit={(body) => (editing ? update(editing.id, body) : create(body))}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading && <p className="muted" style={{ padding: 18 }}>Загружаю клиентов…</p>}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon="👥"
            title="Клиентов пока нет"
            hint="Добавьте первого клиента вручную или попросите Светлану: «создай клиента ООО Вектор»"
          />
        )}
        {!loading && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Имя</th><th>Тип</th><th>Email</th><th>Телефон</th>
                  <th>Город</th><th>Статус</th><th>Создан</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong>
                      {c.tags?.length ? (
                        <div className="row" style={{ gap: 4, marginTop: 4 }}>
                          {c.tags.map((t) => <span key={t} className="badge">{t}</span>)}
                        </div>
                      ) : null}
                    </td>
                    <td>{c.type === 'company' ? 'Компания' : 'Человек'}</td>
                    <td className="small">{c.email ?? '—'}</td>
                    <td className="small">{c.phone ?? '—'}</td>
                    <td className="small">{c.city ?? '—'}</td>
                    <td><Badge status={c.status}>{c.status}</Badge></td>
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
        <p className="small muted">Всего: {data?.total} {plural(data?.total ?? 0, 'клиент', 'клиента', 'клиентов')}</p>
      )}
    </div>
  );
}

function ClientForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    type: initial?.type ?? 'person',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    city: initial?.city ?? '',
    status: initial?.status ?? 'lead',
    notes: initial?.notes ?? '',
  });
  const [error, setError] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError('Укажите имя клиента'); return; }
    onSubmit({
      ...form,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
    });
  };

  return (
    <div className="card">
      <h3>{initial ? 'Изменить клиента' : 'Новый клиент'}</h3>
      {error && <div className="alert err" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="c-name">Имя / название *</label>
            <input id="c-name" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="c-type">Тип</label>
            <select id="c-type" value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="person">Человек</option>
              <option value="company">Компания</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-email">Email</label>
            <input id="c-email" type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="c-phone">Телефон</label>
            <input id="c-phone" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="c-city">Город</label>
            <input id="c-city" value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="c-status">Статус</label>
            <select id="c-status" value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="lead">Лид</option>
              <option value="active">Активный</option>
              <option value="vip">VIP</option>
              <option value="archived">В архиве</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="c-notes">Заметки</label>
          <textarea id="c-notes" rows={3} value={form.notes}
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
