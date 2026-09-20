/**
 * Финансы — счета, платежи, баланс и аналитика (§15, §25, §26).
 * Все цифры из реального API; ошибки видны честно, заглушек нет.
 */
import { useState } from 'react';
import { crm, finance } from '../api.js';
import {
  useResource, Badge, EmptyState, ErrorState, fmtDate, fmtMoney, plural, confirmAction,
} from '../ui.jsx';

const STATUS_LABEL = {
  draft: 'Черновик', sent: 'Отправлен', paid: 'Оплачен', partial: 'Частично оплачен',
  cancelled: 'Отменён', refunded: 'Возврат',
};
const PAY_LABEL = { pending: 'В обработке', succeeded: 'Успешно', failed: 'Отклонён', refunded: 'Возврат', partially_refunded: 'Частичный возврат' };

function monthBounds() {
  const now = new Date();
  return {
    from: Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000),
    to: Math.floor(Date.now() / 1000),
  };
}

/** unix seconds → значение для <input type="date"> */
function toDateInput(unix) {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function Finance() {
  const [q, setQ] = useState('');
  const inv = useResource(() => finance.invoices(q), [q]);
  const pays = useResource(() => finance.payments(), []);
  const bal = useResource(() => finance.balance(), []);
  const prov = useResource(() => finance.providers(), []);
  const clients = useResource(() => crm.clients(), []);
  const { from, to } = monthBounds();
  const rev = useResource(() => finance.revenue(from, to), [from, to]);

  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const invRows = inv.data?.data ?? [];
  const payRows = pays.data?.data ?? [];
  const clientName = (id) => clients.data?.data?.find((c) => c.id === id)?.name;

  const closeForm = () => { setShowForm(false); setEditing(null); };

  const mutate = async (fn, okText) => {
    setNote(null);
    try {
      const res = await fn();
      if (okText) setNote({ tone: 'ok', text: okText });
      return res;
    } catch (err) {
      setNote({ tone: 'err', text: err?.message ?? 'Не удалось выполнить операцию' });
      return null;
    }
  };

  const create = async (body) => {
    const created = await mutate(() => finance.createInvoice(body), 'Счёт создан');
    if (created) {
      inv.setData((d) => ({ ...d, data: [created, ...(d?.data ?? [])], total: (d?.total ?? 0) + 1 }));
      closeForm();
    }
  };

  const update = async (id, body) => {
    const updated = await mutate(() => finance.updateInvoice(id, body), 'Счёт обновлён');
    if (updated) {
      inv.setData((d) => ({ ...d, data: (d?.data ?? []).map((r) => (r.id === id ? updated : r)) }));
      closeForm();
    }
  };

  const remove = async (id) => {
    if (!confirmAction('Удалить счёт? Это действие необратимо.')) return;
    const res = await mutate(() => finance.deleteInvoice(id), 'Счёт удалён');
    if (res) {
      inv.setData((d) => ({
        ...d,
        data: (d?.data ?? []).filter((r) => r.id !== id),
        total: Math.max(0, (d?.total ?? 0) - 1),
      }));
    }
  };

  // POST /invoices/:id/pay не читает тело — счёт просто помечается оплаченным.
  // Показываем ответ честно: реальный статус и дату оплаты из базы.
  const pay = async (row) => {
    if (busy) return;
    setBusy(true);
    const res = await mutate(() => finance.payInvoice(row.id, {}), '');
    setBusy(false);
    if (res) {
      inv.setData((d) => ({ ...d, data: (d?.data ?? []).map((r) => (r.id === res.id ? res : r)) }));
      setNote({
        tone: 'ok',
        text: `Счёт «${res.number}» оплачен. Статус: ${STATUS_LABEL[res.status] ?? res.status}` +
          `, дата оплаты: ${fmtDate(res.paid_at)}.`,
      });
    }
  };

  const revRows = rev.data?.data ?? [];
  const paidRev = revRows.filter((r) => r.status === 'paid');
  const monthTotal = paidRev.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const commissionTotal = payRows.reduce((s, p) => s + Number(p.platform_fee ?? 0), 0);
  const b = bal.data?.balance;

  return (
    <div className="stack">
      <div className="grid grid-3">
        <div className="card">
          <h3>Доход за текущий месяц</h3>
          {rev.loading && <p className="muted">Загружаю аналитику…</p>}
          {rev.error && <ErrorState error={rev.error} onRetry={rev.reload} />}
          {!rev.loading && !rev.error && (
            <>
              <p style={{ fontSize: '1.6rem', fontWeight: 700, margin: '6px 0 0' }}>{fmtMoney(monthTotal)}</p>
              <p className="muted small" style={{ margin: 0 }}>
                {paidRev.length} {plural(paidRev.length, 'счёт', 'счёта', 'счетов')} · статус paid
              </p>
            </>
          )}
        </div>

        <div className="card">
          <h3>Баланс продавца</h3>
          {bal.loading && <p className="muted">Загружаю баланс…</p>}
          {bal.error && <ErrorState error={bal.error} onRetry={bal.reload} />}
          {!bal.loading && !bal.error && b && (
            <div className="small" style={{ display: 'grid', gap: 6 }}>
              <div className="row between"><span>Доступно к выводу</span><strong>{fmtMoney(b.available, b.currency)}</strong></div>
              <div className="row between"><span>В споре / заморожено</span><strong>{fmtMoney(b.in_dispute, b.currency)}</strong></div>
              <div className="row between"><span>Выплачено всего</span><strong>{fmtMoney(b.paid_out, b.currency)}</strong></div>
              <div className="row between"><span className="muted">Комиссия платформы (по платежам)</span><span className="muted">{fmtMoney(commissionTotal, b.currency)}</span></div>
            </div>
          )}
        </div>

        <div className="card">
          <h3>Платёжные провайдеры</h3>
          {prov.loading && <p className="muted">Загружаю провайдеры…</p>}
          {prov.error && <ErrorState error={prov.error} onRetry={prov.reload} />}
          {!prov.loading && !prov.error && (prov.data?.data ?? []).length === 0 && (
            <p className="muted small">Настроенных провайдеров нет</p>
          )}
          {!prov.loading && !prov.error && (
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {(prov.data?.data ?? []).map((p) => (
                <span key={p.name} className={`badge ${p.configured ? 'ok' : 'warn'}`}>
                  {p.name} · {p.mode === 'sandbox' ? 'тестовый режим' : p.mode}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {note && <div className={`alert ${note.tone}`} role="alert">{note.text}</div>}

      <div className="row between">
        <div className="field" style={{ margin: 0, flex: '1 1 220px' }}>
          <input
            type="search"
            placeholder="Поиск по номеру счёта…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Поиск счетов"
          />
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Добавить счёт
        </button>
      </div>

      {showForm && (
        <InvoiceForm
          initial={editing}
          clients={clients}
          onSubmit={(body) => (editing ? update(editing.id, body) : create(body))}
          onCancel={closeForm}
        />
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {inv.loading && <p className="muted" style={{ padding: 18 }}>Загружаю счета…</p>}
        {inv.error && <div style={{ padding: 18 }}><ErrorState error={inv.error} onRetry={inv.reload} /></div>}
        {!inv.loading && !inv.error && invRows.length === 0 && (
          <EmptyState icon="🧾" title="Счетов пока нет" hint="Создайте первый счёт и отправьте его клиенту" />
        )}
        {!inv.loading && !inv.error && invRows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Номер</th><th>Клиент</th><th>Сумма</th><th>Статус</th>
                  <th>Срок оплаты</th><th>Оплачен</th><th></th>
                </tr>
              </thead>
              <tbody>
                {invRows.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.number}</strong></td>
                    <td className="small">{clientName(r.client_id) ?? <span className="muted">{r.client_id ?? '—'}</span>}</td>
                    <td>{fmtMoney(r.amount, r.currency)}</td>
                    <td><Badge status={r.status}>{STATUS_LABEL[r.status] ?? r.status}</Badge></td>
                    <td className="small muted">{fmtDate(r.due_at)}</td>
                    <td className="small muted">{fmtDate(r.paid_at)}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => { setEditing(r); setShowForm(true); }}>Изменить</button>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy || r.status === 'paid' || r.status === 'cancelled'}
                          onClick={() => pay(r)}
                        >
                          Оплатить счёт
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(r.id)}>Удалить</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!inv.loading && !inv.error && invRows.length > 0 && (
        <p className="small muted">Всего: {inv.data?.total} {plural(inv.data?.total ?? 0, 'счёт', 'счёта', 'счетов')}</p>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="row between" style={{ padding: '14px 18px 0' }}>
          <h3>Платежи</h3>
          <button className="btn btn-sm" onClick={pays.reload}>Обновить</button>
        </div>
        {pays.loading && <p className="muted" style={{ padding: 18 }}>Загружаю платежи…</p>}
        {pays.error && <div style={{ padding: 18 }}><ErrorState error={pays.error} onRetry={pays.reload} /></div>}
        {!pays.loading && !pays.error && payRows.length === 0 && (
          <EmptyState icon="💳" title="Платежей пока нет" hint="Они появятся после оплаты счетов и заказов" />
        )}
        {!pays.loading && !pays.error && payRows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Дата</th><th>Счёт / заказ</th><th>Провайдер</th><th>Сумма</th>
                  <th>Комиссия</th><th>Продавцу</th><th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {payRows.map((p) => (
                  <tr key={p.id}>
                    <td className="small muted">{fmtDate(p.created_at)}</td>
                    <td className="small">{p.invoice_id ?? p.order_id ?? '—'}</td>
                    <td className="small">{p.provider}</td>
                    <td>{fmtMoney(p.amount, p.currency)}</td>
                    <td className="small muted">{fmtMoney(p.platform_fee, p.currency)}</td>
                    <td className="small">{fmtMoney(p.seller_amount, p.currency)}</td>
                    <td>
                      <Badge status={p.status}>{PAY_LABEL[p.status] ?? p.status}</Badge>
                      {p.failure_reason && <div className="small muted">{p.failure_reason}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function InvoiceForm({ initial, clients, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    number: initial?.number ?? '',
    client_id: initial?.client_id ?? '',
    amount: initial?.amount ?? '',
    currency: initial?.currency ?? 'RUB',
    status: initial?.status ?? 'draft',
    dueDate: toDateInput(initial?.due_at),
  });
  const [error, setError] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    setError(null);
    if (!form.number.trim()) { setError('Укажите номер счёта'); return; }
    const amount = Number(form.amount);
    if (!Number.isInteger(amount) || amount < 0) { setError('Сумма должна быть целым неотрицательным числом'); return; }
    onSubmit({
      number: form.number.trim(),
      client_id: form.client_id || null,
      amount,
      currency: form.currency.trim().toUpperCase() || 'RUB',
      status: form.status,
      due_at: form.dueDate ? Math.floor(new Date(`${form.dueDate}T00:00:00`).getTime() / 1000) : null,
    });
  };

  const clientRows = clients.data?.data ?? [];

  return (
    <div className="card">
      <h3>{initial ? 'Изменить счёт' : 'Новый счёт'}</h3>
      {error && <div className="alert err" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="i-number">Номер счёта *</label>
            <input id="i-number" required value={form.number}
              onChange={(e) => setForm({ ...form, number: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="i-client">Клиент</label>
            <select id="i-client" value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
              <option value="">— без клиента —</option>
              {clients.loading && <option disabled>Загружаю клиентов…</option>}
              {clientRows.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="i-amount">Сумма, ₽ *</label>
            <input id="i-amount" type="number" min="0" step="1" required value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="i-currency">Валюта (3 буквы)</label>
            <input id="i-currency" value={form.currency} maxLength={3}
              onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="i-status">Статус</label>
            <select id="i-status" value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="i-due">Срок оплаты</label>
            <input id="i-due" type="date" value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
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
