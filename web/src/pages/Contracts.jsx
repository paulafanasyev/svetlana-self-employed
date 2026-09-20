/**
 * Договоры — реестр договоров, связанных с утверждёнными документами (§16).
 *
 * Договор создаётся из утверждённого документа (kind = contract) через
 * POST /documents/:id/contract, а смена статуса договора — через
 * PATCH /documents/contracts/:id (в api.js это documents.linkContract).
 */
import { useMemo, useState } from 'react';
import { api, crm, documents } from '../api.js';
import {
  useResource, Badge, EmptyState, ErrorState, fmtDate, fmtMoney,
} from '../ui.jsx';

const STATUSES = ['draft', 'active', 'signed', 'terminated', 'expired'];
const LABELS = {
  draft: 'Черновик', active: 'Действует', signed: 'Подписан',
  terminated: 'Расторгнут', expired: 'Истёк',
};
/** Договор можно связать с уже утверждённым и сохранённым документом. */
const LINKABLE = ['stored', 'sent_email', 'sent_sign', 'verified'];

const toUnix = (v) => (v ? Math.floor(new Date(v).getTime() / 1000) : null);

export default function Contracts() {
  const { data, loading, error, reload, setData } = useResource(() => documents.contracts(), []);
  const docs = useResource(() => documents.list(), []);
  const clients = useResource(() => crm.clients(), []);
  const [linking, setLinking] = useState(false);
  const [err, setErr] = useState(null);

  const rows = data?.data ?? [];
  // документы и клиенты приходят списком; поддерживаем оба формата ответа
  const docsList = docs.data ?? [];
  const allDocs = Array.isArray(docsList) ? docsList : (docsList.data ?? []);
  const clientsList = clients.data ?? [];
  const clientRows = Array.isArray(clientsList) ? clientsList : (clientsList.data ?? []);
  const titleById = useMemo(
    () => Object.fromEntries(allDocs.map((d) => [d.id, d.title])),
    [allDocs]
  );
  const clientName = useMemo(
    () => Object.fromEntries(clientRows.map((c) => [c.id, c.name])),
    [clientRows]
  );

  const linkable = allDocs.filter((d) => d.kind === 'contract' && LINKABLE.includes(d.status));

  const link = async (body) => {
    setErr(null);
    try {
      const created = await api.post(`/documents/${body.document_id}/contract`, {
        number: body.number || undefined,
        amount: body.amount || null,
        starts_at: body.starts_at || null,
        ends_at: body.ends_at || null,
      });
      setData((d) => ({ ...d, data: [created, ...(d?.data ?? [])] }));
      setLinking(false);
    } catch (e) { setErr(e); }
  };

  const changeStatus = async (id, status, prev) => {
    if (status === prev) return;
    setErr(null);
    try {
      const updated = await documents.linkContract(id, { status });
      setData((d) => ({ ...d, data: (d?.data ?? []).map((r) => (r.id === id ? updated : r)) }));
    } catch (e) {
      setErr(e);
      setData((d) => ({ ...d, data: (d?.data ?? []).map((r) => (r.id === id ? { ...r, status: prev } : r)) }));
    }
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Договоры</h2>
        <button className="btn btn-primary" onClick={() => setLinking(true)} disabled={linkable.length === 0}>
          + Связать с документом
        </button>
      </div>

      {!docs.loading && linkable.length === 0 && !linking && (
        <div className="alert info">
          Чтобы завести договор, создайте документ вида «Договор» и утвердите его на странице «Документы».
        </div>
      )}

      {err && (
        <div className="alert err" role="alert">
          <strong>Действие не выполнено.</strong> {err.message}
        </div>
      )}

      {linking && (
        <LinkForm
          linkable={linkable}
          titleById={titleById}
          onSubmit={link}
          onCancel={() => { setLinking(false); setErr(null); }}
        />
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading && <p className="muted" style={{ padding: 18 }}>Загружаю договоры…</p>}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon="📜"
            title="Договоров пока нет"
            hint="Свяжите утверждённый документ-договор с записью в реестре, и он появится здесь."
          />
        )}
        {!loading && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Документ</th><th>Контрагент</th><th>Номер</th><th>Сумма</th>
                  <th>Статус</th><th>Начало</th><th>Окончание</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{titleById[c.document_id] ?? c.document_id}</strong></td>
                    <td className="small">{clientName[c.client_id] ?? '—'}</td>
                    <td className="small">{c.number ?? '—'}</td>
                    <td className="small">{c.amount != null ? fmtMoney(c.amount, c.currency) : '—'}</td>
                    <td>
                      <select
                        value={c.status}
                        onChange={(e) => changeStatus(c.id, e.target.value, c.status)}
                        aria-label={`Статус договора ${c.number ?? c.id}`}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{LABELS[s]}</option>)}
                      </select>{' '}
                      <Badge status={c.status}>{LABELS[c.status] ?? c.status}</Badge>
                    </td>
                    <td className="small muted">{fmtDate(c.starts_at)}</td>
                    <td className="small muted">{fmtDate(c.ends_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && rows.length > 0 && (
        <p className="small muted">Всего договоров: {rows.length}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LinkForm({ linkable, titleById, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    document_id: '', number: '', amount: '', starts_at: '', ends_at: '',
  });
  const [err, setErr] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    setErr(null);
    if (!form.document_id) { setErr('Выберите утверждённый документ-договор'); return; }
    onSubmit({
      document_id: form.document_id,
      number: form.number.trim() || undefined,
      amount: form.amount ? Number(form.amount) : null,
      starts_at: toUnix(form.starts_at),
      ends_at: toUnix(form.ends_at),
    });
  };

  return (
    <div className="card">
      <h3>Связать документ с договором</h3>
      {err && <div className="alert err" role="alert">{err}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="k-doc">Документ (утверждённый договор) *</label>
          <select
            id="k-doc" value={form.document_id}
            onChange={(e) => setForm({ ...form, document_id: e.target.value })}
          >
            <option value="">— выберите документ —</option>
            {linkable.map((d) => (
              <option key={d.id} value={d.id}>{titleById[d.id] ?? d.title}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="k-number">Номер договора</label>
            <input
              id="k-number" value={form.number} placeholder="Например: № 12/2025"
              onChange={(e) => setForm({ ...form, number: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="k-amount">Сумма, ₽</label>
            <input
              id="k-amount" type="number" min="0" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="k-start">Дата начала</label>
            <input
              id="k-start" type="date" value={form.starts_at}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="k-end">Дата окончания</label>
            <input
              id="k-end" type="date" value={form.ends_at}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
            />
          </div>
        </div>
        <div className="row">
          <button className="btn btn-primary" type="submit">Создать договор</button>
          <button className="btn" type="button" onClick={onCancel}>Отмена</button>
        </div>
      </form>
    </div>
  );
}
