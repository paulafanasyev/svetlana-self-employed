/**
 * Мои услуги (§21, сторона продавца): каталог услуг, создание/правки/удаление
 * и заказы на них с управлением статусом.
 */
import { useState } from 'react';
import { marketplace } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useResource, EmptyState, ErrorState, fmtDate, fmtMoney, confirmAction } from '../ui.jsx';

const UNITS = { project: 'за проект', hour: 'за час', month: 'за месяц', piece: 'за штуку' };

const ORDER_STATUS = {
  created: ['Создан', 'info'], paid: ['Оплачен', 'ok'],
  in_progress: ['В работе', 'warn'], delivered: ['Доставлен', 'info'],
  completed: ['Завершён', 'ok'], disputed: ['Спор', 'err'],
  cancelled: ['Отменён', 'err'], refunded: ['Возврат', 'warn'],
};

export default function Services() {
  const { user } = useAuth();
  const services = useResource(() => marketplace.myServices(), []);
  const orders = useResource(() => marketplace.orders(), []);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [orderError, setOrderError] = useState(null);

  const rows = services.data?.data ?? [];
  const orderRows = orders.data?.data ?? [];
  const titleById = Object.fromEntries(rows.map((s) => [s.id, s.title]));

  const create = async (body) => {
    await marketplace.createService(body);
    setShowForm(false);
    services.reload();
  };

  const update = async (id, body) => {
    await marketplace.updateService(id, body);
    services.reload();
    setEditing(null);
    setShowForm(false);
  };

  const remove = async (id) => {
    if (!confirmAction('Удалить услугу? Это действие необратимо.')) return;
    await marketplace.deleteService(id);
    services.reload();
  };

  const togglePublished = async (s) => {
    try {
      await marketplace.updateService(s.id, { is_published: !s.is_published });
      services.reload();
    } catch (err) {
      window.alert(err.message || 'Не удалось изменить статус публикации');
    }
  };

  const decideOrder = async (id, status) => {
    setOrderError(null);
    try {
      const updated = await marketplace.updateOrder(id, { status });
      orders.setData((d) => ({
        ...d,
        data: (d?.data ?? []).map((o) => (o.id === id ? { ...o, ...updated } : o)),
      }));
    } catch (err) {
      setOrderError(err.message || 'Не удалось изменить статус заказа');
    }
  };

  if (services.error) return <ErrorState error={services.error} onRetry={services.reload} />;

  return (
    <div className="stack">
      <div className="row between">
        <p className="muted small" style={{ margin: 0 }}>
          Ваш каталог услуг: публикуйте, редактируйте и принимайте заказы.
        </p>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Добавить услугу
        </button>
      </div>

      {showForm && (
        <ServiceForm
          initial={editing}
          onSubmit={(body) => (editing ? update(editing.id, body) : create(body))}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {services.loading && <p className="muted">Загружаю услуги…</p>}

      {!services.loading && rows.length === 0 && (
        <EmptyState icon="🧰" title="Услуг пока нет"
          hint="Добавьте услугу с ценой — она появится в каталоге маркетплейса" />
      )}

      {!services.loading && rows.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Услуга</th><th>Категория</th><th>Цена</th><th>Статус</th><th>Обновлена</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.title}</strong>
                      {s.description ? (
                        <div className="small muted" style={{ marginTop: 2 }}>{s.description}</div>
                      ) : null}
                    </td>
                    <td className="small">{s.category ?? '—'}</td>
                    <td className="small">
                      <strong>{fmtMoney(s.price, s.currency)}</strong>{' '}
                      <span className="muted">{UNITS[s.unit] ?? ''}</span>
                    </td>
                    <td>
                      <span className={`badge ${s.is_published ? 'ok' : 'warn'}`}>
                        {s.is_published ? 'Опубликована' : 'Черновик'}
                      </span>
                    </td>
                    <td className="small muted">{fmtDate(s.updated_at)}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => togglePublished(s)}>
                          {s.is_published ? 'Снять с публикации' : 'Опубликовать'}
                        </button>
                        <button className="btn btn-sm" onClick={() => { setEditing(s); setShowForm(true); }}>
                          Изменить
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(s.id)}>
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ margin: 0 }}>Заказы на мои услуги</h3>
        <p className="small muted" style={{ margin: '4px 0 10px' }}>
          Заказы, где вы покупатель или продавец
        </p>
        {orderError && <div className="alert err" role="alert">{orderError}</div>}
        {orders.loading && <p className="muted">Загружаю заказы…</p>}
        {orders.error && <ErrorState error={orders.error} onRetry={orders.reload} />}
        {!orders.loading && !orders.error && orderRows.length === 0 && (
          <EmptyState icon="📦" title="Заказов пока нет"
            hint="Опубликуйте услугу — заказы появятся здесь" />
        )}
        {!orders.loading && !orders.error && orderRows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Дата</th><th>Услуга</th><th>Сумма</th><th>Роль</th><th>Статус</th><th></th>
                </tr>
              </thead>
              <tbody>
                {orderRows.map((o) => {
                  const isSeller = o.seller_id === user?.id;
                  const [label, tone] = ORDER_STATUS[o.status] ?? [o.status, ''];
                  const canDecide = isSeller && (o.status === 'created' || o.status === 'paid');
                  return (
                    <tr key={o.id}>
                      <td className="small muted">{fmtDate(o.created_at)}</td>
                      <td className="small">
                        {titleById[o.service_id] ?? `Заказ ${String(o.id).slice(0, 6)}`}
                      </td>
                      <td className="small"><strong>{fmtMoney(o.amount, o.currency)}</strong></td>
                      <td className="small">{isSeller ? 'Продавец' : 'Покупатель'}</td>
                      <td><span className={`badge ${tone}`}>{label}</span></td>
                      <td>
                        {canDecide ? (
                          <div className="row" style={{ gap: 4 }}>
                            <button className="btn btn-sm btn-primary"
                              onClick={() => decideOrder(o.id, 'in_progress')}>Принять</button>
                            <button className="btn btn-sm btn-danger"
                              onClick={() => decideOrder(o.id, 'cancelled')}>Отклонить</button>
                          </div>
                        ) : (
                          <span className="small muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    category: initial?.category ?? '',
    price: initial?.price ?? '',
    unit: initial?.unit ?? 'project',
    is_published: initial ? !!initial.is_published : true,
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.title.trim().length < 3) { setError('Название — минимум 3 символа'); return; }
    if (form.price === '' || Number(form.price) < 0) { setError('Укажите цену (число ≥ 0)'); return; }
    setBusy(true);
    try {
      await onSubmit({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim() || undefined,
        price: Number(form.price),
        currency: 'RUB',
        unit: form.unit,
        is_published: !!form.is_published,
      });
    } catch (err) {
      setError(err.message || 'Не удалось сохранить услугу');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3>{initial ? 'Изменить услугу' : 'Новая услуга'}</h3>
      {error && <div className="alert err" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="s-title">Название *</label>
            <input id="s-title" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="s-cat">Категория</label>
            <input id="s-cat" value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="s-price">Цена, ₽ *</label>
            <input id="s-price" type="number" min="0" step="1" value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="s-unit">Единица</label>
            <select id="s-unit" value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {Object.entries(UNITS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="s-desc">Описание</label>
          <textarea id="s-desc" rows={3} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="field">
          <label>
            <input type="checkbox" style={{ width: 'auto', marginRight: 6 }}
              checked={form.is_published}
              onChange={(e) => setForm({ ...form, is_published: e.target.checked })} />
            Опубликовать в каталоге
          </label>
        </div>
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Сохраняю…' : initial ? 'Сохранить' : 'Создать'}
          </button>
          <button className="btn" type="button" onClick={onCancel}>Отмена</button>
        </div>
      </form>
    </div>
  );
}
