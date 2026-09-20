/**
 * Проекты — проекты владельца CRM (§15, таблица projects). Полный CRUD.
 * Не маркетплейс: это внутренние проекты самозанятого.
 */
import { useState } from 'react';
import { crm } from '../api.js';
import {
  useResource, Badge, EmptyState, ErrorState, fmtDate, fmtMoney, plural, confirmAction,
} from '../ui.jsx';

const STATUSES = {
  planning: 'Планирование',
  active: 'В работе',
  review: 'На проверке',
  done: 'Завершён',
  cancelled: 'Отменён',
};
const CURRENCIES = ['RUB', 'USD', 'EUR'];

/** unix-секунды → значение для <input type="date"> по местному времени. */
function tsToDateInput(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function dateInputToTs(value) {
  if (!value) return null;
  const ts = new Date(`${value}T00:00:00`).getTime() / 1000;
  return Number.isNaN(ts) ? null : Math.floor(ts);
}

export default function Projects() {
  const [q, setQ] = useState('');
  const { data, loading, error, reload, setData } = useResource(() => crm.projects(q), [q]);
  const { data: clientsData } = useResource(() => crm.clients(''), []);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const rows = data?.data ?? [];
  const clients = clientsData?.data ?? [];
  const clientName = (id) => clients.find((c) => c.id === id)?.name;

  const create = async (body) => {
    const created = await crm.createProject(body);
    setData((d) => ({ ...d, data: [created, ...(d?.data ?? [])], total: (d?.total ?? 0) + 1 }));
    setShowForm(false);
    setEditing(null);
  };

  const update = async (id, body) => {
    const updated = await crm.updateProject(id, body);
    setData((d) => ({ ...d, data: (d?.data ?? []).map((r) => (r.id === id ? updated : r)) }));
    setEditing(null);
    setShowForm(false);
  };

  const remove = async (id) => {
    if (!confirmAction('Удалить проект? Это действие необратимо.')) return;
    await crm.deleteProject(id);
    setData((d) => ({ ...d, data: (d?.data ?? []).filter((r) => r.id !== id), total: (d?.total ?? 0) - 1 }));
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="stack">
      <div className="row between">
        <div className="field" style={{ margin: 0, flex: '1 1 220px' }}>
          <input
            type="search"
            placeholder="Поиск по названию, описанию…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Поиск проектов"
          />
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Добавить проект
        </button>
      </div>

      {showForm && (
        <ProjectForm
          initial={editing}
          clients={clients}
          onSubmit={(body) => (editing ? update(editing.id, body) : create(body))}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading && <p className="muted" style={{ padding: 18 }}>Загружаю проекты…</p>}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon="🗂"
            title="Проектов пока нет"
            hint="Добавьте первый проект вручную или попросите Светлану: «создай проект Лендинг для ООО Вектор»"
          />
        )}
        {!loading && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Проект</th><th>Клиент</th><th>Статус</th><th>Бюджет</th>
                  <th>Дедлайн</th><th>Создан</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.title}</strong>
                      {p.description ? (
                        <div className="small muted" style={{
                          maxWidth: 280, marginTop: 2,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{p.description}</div>
                      ) : null}
                    </td>
                    <td className="small">{clientName(p.client_id) ?? '—'}</td>
                    <td><Badge status={p.status}>{STATUSES[p.status] ?? p.status}</Badge></td>
                    <td className="small">{p.budget != null ? fmtMoney(p.budget, p.currency) : '—'}</td>
                    <td className="small muted">{fmtDate(p.deadline)}</td>
                    <td className="small muted">{fmtDate(p.created_at)}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => { setEditing(p); setShowForm(true); }}>
                          Изменить
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(p.id)}>
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
        <p className="small muted">Всего: {data?.total} {plural(data?.total ?? 0, 'проект', 'проекта', 'проектов')}</p>
      )}
    </div>
  );
}

function ProjectForm({ initial, clients, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    client_id: initial?.client_id ?? '',
    status: initial?.status ?? 'planning',
    budget: initial?.budget != null ? String(initial.budget) : '',
    currency: initial?.currency ?? 'RUB',
    deadline: tsToDateInput(initial?.deadline),
    description: initial?.description ?? '',
  });
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) { setError('Укажите название проекта'); return; }
    try {
      await onSubmit({
        title: form.title.trim(),
        client_id: form.client_id || null,
        status: form.status,
        budget: form.budget === '' ? null : Number(form.budget),
        currency: form.currency,
        deadline: dateInputToTs(form.deadline),
        description: form.description.trim() || null,
      });
    } catch (err) {
      setError(err?.message || 'Не удалось сохранить проект');
    }
  };

  return (
    <div className="card">
      <h3>{initial ? 'Изменить проект' : 'Новый проект'}</h3>
      {error && <div className="alert err" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="p-title">Название *</label>
            <input id="p-title" required value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="p-client">Клиент</label>
            <select id="p-client" value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
              <option value="">— не выбран —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-status">Статус</label>
            <select id="p-status" value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {Object.entries(STATUSES).map(([key, label]) =>
                <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-deadline">Дедлайн</label>
            <input id="p-deadline" type="date" value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="p-budget">Бюджет</label>
            <input id="p-budget" type="number" min={0} step={1} value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="p-currency">Валюта</label>
            <select id="p-currency" value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {CURRENCIES.map((cur) => <option key={cur} value={cur}>{cur}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="p-desc">Описание</label>
          <textarea id="p-desc" rows={3} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="row">
          <button className="btn btn-primary" type="submit">{initial ? 'Сохранить' : 'Создать'}</button>
          <button className="btn" type="button" onClick={onCancel}>Отмена</button>
        </div>
      </form>
    </div>
  );
}
