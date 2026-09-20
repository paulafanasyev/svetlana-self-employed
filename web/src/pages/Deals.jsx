/**
 * Сделки — список сделок CRM (§15). Полный CRUD.
 */
import { useState } from 'react';
import { crm } from '../api.js';
import {
  useResource, Badge, EmptyState, ErrorState, fmtDate, fmtMoney, plural, confirmAction,
} from '../ui.jsx';

const STAGES = {
  new: 'Новая',
  proposal: 'Предложение',
  won: 'Выиграна',
  lost: 'Проиграна',
  closed: 'Закрыта',
};
const CURRENCIES = ['RUB', 'USD', 'EUR'];

export default function Deals() {
  const [q, setQ] = useState('');
  const { data, loading, error, reload, setData } = useResource(() => crm.deals(q), [q]);
  const { data: clientsData } = useResource(() => crm.clients(''), []);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const rows = data?.data ?? [];
  const clients = clientsData?.data ?? [];
  const clientName = (id) => clients.find((c) => c.id === id)?.name;

  const create = async (body) => {
    const created = await crm.createDeal(body);
    setData((d) => ({ ...d, data: [created, ...(d?.data ?? [])], total: (d?.total ?? 0) + 1 }));
    setShowForm(false);
    setEditing(null);
  };

  const update = async (id, body) => {
    const updated = await crm.updateDeal(id, body);
    setData((d) => ({ ...d, data: (d?.data ?? []).map((r) => (r.id === id ? updated : r)) }));
    setEditing(null);
    setShowForm(false);
  };

  const remove = async (id) => {
    if (!confirmAction('Удалить сделку? Это действие необратимо.')) return;
    await crm.deleteDeal(id);
    setData((d) => ({ ...d, data: (d?.data ?? []).filter((r) => r.id !== id), total: (d?.total ?? 0) - 1 }));
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="stack">
      <div className="row between">
        <div className="field" style={{ margin: 0, flex: '1 1 220px' }}>
          <input
            type="search"
            placeholder="Поиск по названию сделки…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Поиск сделок"
          />
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Добавить сделку
        </button>
      </div>

      {showForm && (
        <DealForm
          initial={editing}
          clients={clients}
          onSubmit={(body) => (editing ? update(editing.id, body) : create(body))}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading && <p className="muted" style={{ padding: 18 }}>Загружаю сделки…</p>}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon="💰"
            title="Сделок пока нет"
            hint="Добавьте первую сделку вручную или попросите Светлану: «создай сделку на 50000 рублей»"
          />
        )}
        {!loading && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Сделка</th><th>Клиент</th><th>Сумма</th><th>Этап</th>
                  <th>Закрыта</th><th>Создана</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.title}</strong></td>
                    <td className="small">{clientName(d.client_id) ?? '—'}</td>
                    <td className="small"><strong>{fmtMoney(d.amount, d.currency)}</strong></td>
                    <td><Badge status={d.stage}>{STAGES[d.stage] ?? d.stage}</Badge></td>
                    <td className="small muted">{fmtDate(d.closed_at)}</td>
                    <td className="small muted">{fmtDate(d.created_at)}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => { setEditing(d); setShowForm(true); }}>
                          Изменить
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(d.id)}>
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
        <p className="small muted">Всего: {data?.total} {plural(data?.total ?? 0, 'сделка', 'сделки', 'сделок')}</p>
      )}
    </div>
  );
}

function DealForm({ initial, clients, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    client_id: initial?.client_id ?? '',
    amount: initial?.amount != null ? String(initial.amount) : '',
    currency: initial?.currency ?? 'RUB',
    stage: initial?.stage ?? 'new',
  });
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) { setError('Укажите название сделки'); return; }
    if (form.amount === '' || Number.isNaN(Number(form.amount))) { setError('Укажите сумму сделки'); return; }
    try {
      await onSubmit({
        title: form.title.trim(),
        client_id: form.client_id || null,
        amount: Number(form.amount),
        currency: form.currency,
        stage: form.stage,
      });
    } catch (err) {
      setError(err?.message || 'Не удалось сохранить сделку');
    }
  };

  return (
    <div className="card">
      <h3>{initial ? 'Изменить сделку' : 'Новая сделка'}</h3>
      {error && <div className="alert err" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="d-title">Название *</label>
            <input id="d-title" required value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="d-client">Клиент</label>
            <select id="d-client" value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
              <option value="">— не выбран —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="d-amount">Сумма *</label>
            <input id="d-amount" type="number" min={0} step={1} required value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="d-currency">Валюта</label>
            <select id="d-currency" value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {CURRENCIES.map((cur) => <option key={cur} value={cur}>{cur}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="d-stage">Этап</label>
            <select id="d-stage" value={form.stage}
              onChange={(e) => setForm({ ...form, stage: e.target.value })}>
              {Object.entries(STAGES).map(([key, label]) =>
                <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
        </div>
        <div className="row">
          <button className="btn btn-primary" type="submit">{initial ? 'Сохранить' : 'Создать'}</button>
          <button className="btn" type="button" onClick={onCancel}>Отмена</button>
        </div>
      </form>
    </div>
  );
}
