/**
 * Лиды — воронка лидов CRM (§15). Полный CRUD.
 */
import { useState } from 'react';
import { crm } from '../api.js';
import {
  useResource, Badge, EmptyState, ErrorState, fmtDate, fmtMoney, plural, confirmAction,
} from '../ui.jsx';

const STAGES = {
  new: 'Новый',
  qualified: 'Квалифицирован',
  proposal: 'Предложение',
  negotiation: 'Переговоры',
  won: 'Выигран',
  lost: 'Проигран',
};
const CURRENCIES = ['RUB', 'USD', 'EUR'];

export default function Leads() {
  const [q, setQ] = useState('');
  const { data, loading, error, reload, setData } = useResource(() => crm.leads(q), [q]);
  const { data: clientsData } = useResource(() => crm.clients(''), []);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const rows = data?.data ?? [];
  const clients = clientsData?.data ?? [];
  const clientName = (id) => clients.find((c) => c.id === id)?.name;

  const create = async (body) => {
    const created = await crm.createLead(body);
    setData((d) => ({ ...d, data: [created, ...(d?.data ?? [])], total: (d?.total ?? 0) + 1 }));
    setShowForm(false);
    setEditing(null);
  };

  const update = async (id, body) => {
    const updated = await crm.updateLead(id, body);
    setData((d) => ({ ...d, data: (d?.data ?? []).map((r) => (r.id === id ? updated : r)) }));
    setEditing(null);
    setShowForm(false);
  };

  const remove = async (id) => {
    if (!confirmAction('Удалить лид? Это действие необратимо.')) return;
    await crm.deleteLead(id);
    setData((d) => ({ ...d, data: (d?.data ?? []).filter((r) => r.id !== id), total: (d?.total ?? 0) - 1 }));
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="stack">
      <div className="row between">
        <div className="field" style={{ margin: 0, flex: '1 1 220px' }}>
          <input
            type="search"
            placeholder="Поиск по заголовку, описанию, источнику…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Поиск лидов"
          />
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Добавить лид
        </button>
      </div>

      {showForm && (
        <LeadForm
          initial={editing}
          clients={clients}
          onSubmit={(body) => (editing ? update(editing.id, body) : create(body))}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading && <p className="muted" style={{ padding: 18 }}>Загружаю лиды…</p>}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon="🎯"
            title="Лидов пока нет"
            hint="Добавьте первый лид вручную или попросите Светлану: «создай лид на дизайн логотипа»"
          />
        )}
        {!loading && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Заголовок</th><th>Клиент</th><th>Сумма</th><th>Этап</th>
                  <th>Источник</th><th>Создан</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td><strong>{l.title}</strong>
                      {l.description ? (
                        <div className="small muted" style={{
                          maxWidth: 280, marginTop: 2,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{l.description}</div>
                      ) : null}
                    </td>
                    <td className="small">{clientName(l.client_id) ?? '—'}</td>
                    <td className="small">{l.value != null ? fmtMoney(l.value, l.currency) : '—'}</td>
                    <td><Badge status={l.stage}>{STAGES[l.stage] ?? l.stage}</Badge></td>
                    <td className="small">{l.source ?? '—'}</td>
                    <td className="small muted">{fmtDate(l.created_at)}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => { setEditing(l); setShowForm(true); }}>
                          Изменить
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(l.id)}>
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
        <p className="small muted">Всего: {data?.total} {plural(data?.total ?? 0, 'лид', 'лида', 'лидов')}</p>
      )}
    </div>
  );
}

function LeadForm({ initial, clients, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    client_id: initial?.client_id ?? '',
    value: initial?.value != null ? String(initial.value) : '',
    currency: initial?.currency ?? 'RUB',
    stage: initial?.stage ?? 'new',
    source: initial?.source ?? '',
    description: initial?.description ?? '',
  });
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) { setError('Укажите заголовок лида'); return; }
    try {
      await onSubmit({
        title: form.title.trim(),
        client_id: form.client_id || null,
        value: form.value === '' ? null : Number(form.value),
        currency: form.currency,
        stage: form.stage,
        source: form.source.trim() || null,
        description: form.description.trim() || null,
      });
    } catch (err) {
      setError(err?.message || 'Не удалось сохранить лид');
    }
  };

  return (
    <div className="card">
      <h3>{initial ? 'Изменить лид' : 'Новый лид'}</h3>
      {error && <div className="alert err" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="l-title">Заголовок *</label>
            <input id="l-title" required value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="l-client">Клиент</label>
            <select id="l-client" value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
              <option value="">— не выбран —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="l-value">Сумма</label>
            <input id="l-value" type="number" min={0} step={1} value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="l-currency">Валюта</label>
            <select id="l-currency" value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {CURRENCIES.map((cur) => <option key={cur} value={cur}>{cur}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="l-stage">Этап</label>
            <select id="l-stage" value={form.stage}
              onChange={(e) => setForm({ ...form, stage: e.target.value })}>
              {Object.entries(STAGES).map(([key, label]) =>
                <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="l-source">Источник</label>
            <input id="l-source" maxLength={60} value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="l-desc">Описание</label>
          <textarea id="l-desc" rows={3} value={form.description}
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
