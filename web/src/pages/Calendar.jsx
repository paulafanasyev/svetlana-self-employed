/**
 * Календарь — события и напоминания (§32).
 */
import { useMemo, useState } from 'react';
import { calendar } from '../api.js';
import {
  useResource, Badge, EmptyState, ErrorState, fmtDate, plural, confirmAction,
} from '../ui.jsx';

const KINDS = { meeting: 'Встреча', deadline: 'Дедлайн', reminder: 'Напоминание', task: 'Задача', other: 'Другое' };
const KIND_TONE = { meeting: 'info', deadline: 'err', reminder: 'warn', task: '', other: '' };
const RSTATUSES = { pending: 'Ожидает', sent: 'Выполнено', snoozed: 'Отложено', cancelled: 'Отменено' };
const FMT = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' };
const now = () => Math.floor(Date.now() / 1000);
const toLocal = (sec) => {
  if (!sec) return '';
  const d = new Date(sec * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v) => (v ? Math.floor(new Date(v).getTime() / 1000) : null);

export default function Calendar() {
  const [offset, setOffset] = useState(0);
  const { from, to, label } = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    const f = new Date(d.getFullYear(), d.getMonth(), 1);
    const t = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    return {
      from: Math.floor(f.getTime() / 1000),
      to: Math.floor(t.getTime() / 1000),
      label: d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
    };
  }, [offset]);

  const { data, loading, error, reload, setData } = useResource(() => calendar.range(from, to), [from, to]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const rows = data?.data ?? [];

  const closeForm = () => { setShowForm(false); setEditing(null); };

  const create = async (body) => {
    const created = await calendar.create(body);
    setData((d) => ({ ...d, data: [...(d?.data ?? []), created] }));
    closeForm();
  };

  const update = async (id, body) => {
    const updated = await calendar.update(id, body);
    setData((d) => ({ ...d, data: (d?.data ?? []).map((r) => (r.id === id ? updated : r)) }));
    closeForm();
  };

  const remove = async (id) => {
    if (!confirmAction('Удалить событие?')) return;
    await calendar.delete(id);
    setData((d) => ({ ...d, data: (d?.data ?? []).filter((r) => r.id !== id) }));
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="stack">
      <div className="row between">
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={() => setOffset((o) => o - 1)} aria-label="Предыдущий месяц">‹</button>
          <strong style={{ textTransform: 'capitalize' }}>{label}</strong>
          <button className="btn btn-sm" onClick={() => setOffset(0)}>Сегодня</button>
          <button className="btn btn-sm" onClick={() => setOffset((o) => o + 1)} aria-label="Следующий месяц">›</button>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Добавить событие
        </button>
      </div>

      {showForm && (
        <EventForm
          initial={editing}
          onSubmit={(body) => (editing ? update(editing.id, body) : create(body))}
          onCancel={closeForm}
        />
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading && <p className="muted" style={{ padding: 18 }}>Загружаю события…</p>}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon="📅"
            title="В этом месяце событий нет"
            hint="Добавьте встречу или дедлайн вручную, либо попросите Светлану: «напомни завтра в 10 позвонить клиенту»"
          />
        )}
        {!loading && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Начало</th><th>Конец</th><th>Событие</th><th>Тип</th><th>Место</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td className="small">{fmtDate(e.starts_at, FMT)}</td>
                    <td className="small">{e.ends_at ? fmtDate(e.ends_at, FMT) : '—'}</td>
                    <td>
                      <strong>{e.title}</strong>
                      {e.description && <div className="small muted">{e.description}</div>}
                    </td>
                    <td><span className={`badge ${KIND_TONE[e.kind]}`}>{KINDS[e.kind]}</span></td>
                    <td className="small">{e.location ?? '—'}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => { setEditing(e); setShowForm(true); }}>Изменить</button>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(e.id)}>Удалить</button>
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
        <p className="small muted">
          Всего: {rows.length} {plural(rows.length, 'событие', 'события', 'событий')}
        </p>
      )}

      <Reminders />
    </div>
  );
}

function Reminders() {
  const { data, loading, error, reload, setData } = useResource(() => calendar.reminders(), []);
  const [message, setMessage] = useState('');
  const [at, setAt] = useState('');
  const rows = data?.data ?? [];

  const create = async (e) => {
    e.preventDefault();
    if (!message.trim() || !at) return;
    const created = await calendar.createReminder({ message: message.trim(), remind_at: fromLocal(at) });
    setData((d) => ({ ...d, data: [...(d?.data ?? []), created] }));
    setMessage('');
    setAt('');
  };

  const patch = async (r, body) => {
    const updated = await calendar.updateReminder(r.id, body);
    setData((d) => ({ ...d, data: (d?.data ?? []).map((x) => (x.id === r.id ? updated : x)) }));
  };

  const remove = async (r) => {
    if (!confirmAction('Удалить напоминание?')) return;
    await calendar.deleteReminder(r.id);
    setData((d) => ({ ...d, data: (d?.data ?? []).filter((x) => x.id !== r.id) }));
  };

  const soon = (r) => r.status === 'pending' && r.remind_at <= now() + 86400;

  return (
    <div className="card">
      <div className="row between">
        <h3>Напоминания</h3>
        <button className="btn btn-sm" onClick={reload}>Обновить</button>
      </div>

      <form className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }} onSubmit={create}>
        <div className="field" style={{ margin: 0, flex: '1 1 200px' }}>
          <label htmlFor="r-msg" className="small">Сообщение</label>
          <input id="r-msg" value={message} placeholder="Позвонить клиенту"
            onChange={(e) => setMessage(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0, flex: '0 1 210px' }}>
          <label htmlFor="r-at" className="small">Напомнить</label>
          <input id="r-at" type="datetime-local" value={at} required
            onChange={(e) => setAt(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit" style={{ alignSelf: 'flex-end' }}>
          Добавить
        </button>
      </form>

      {error && <div style={{ marginTop: 12 }}><ErrorState error={error} onRetry={reload} /></div>}
      {loading && <p className="muted" style={{ marginTop: 12 }}>Загружаю напоминания…</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="muted" style={{ marginTop: 12 }}>Напоминаний пока нет.</p>
      )}
      {!loading && !error && rows.length > 0 && (
        <div className="stack" style={{ gap: 6, marginTop: 12 }}>
          {rows.map((r) => (
            <div key={r.id} className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong>{r.message}</strong>
                <div className="small muted">
                  {fmtDate(r.remind_at, FMT)}
                  {r.event_title ? ` · ${r.event_title}` : ''}
                </div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {soon(r) && <span className="badge warn">Скоро</span>}
                <Badge status={r.status}>{RSTATUSES[r.status]}</Badge>
                {r.status !== 'sent' && (
                  <>
                    <button className="btn btn-sm" onClick={() => patch(r, { status: 'sent' })}>Отметить</button>
                    <button className="btn btn-sm"
                      onClick={() => patch(r, { status: 'snoozed', remind_at: r.remind_at + 3600 })}>
                      Отложить на час
                    </button>
                  </>
                )}
                <button className="btn btn-sm btn-danger" onClick={() => remove(r)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    kind: initial?.kind ?? 'meeting',
    start: toLocal(initial?.starts_at),
    end: toLocal(initial?.ends_at),
    location: initial?.location ?? '',
    description: initial?.description ?? '',
  });
  const [error, setError] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) { setError('Укажите название события'); return; }
    if (!form.start) { setError('Укажите дату и время начала'); return; }
    const startsAt = fromLocal(form.start);
    const endsAt = fromLocal(form.end);
    if (endsAt !== null && endsAt < startsAt) { setError('Окончание раньше начала'); return; }
    onSubmit({
      title: form.title.trim(),
      kind: form.kind,
      starts_at: startsAt,
      ends_at: endsAt,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
    });
  };

  return (
    <div className="card">
      <h3>{initial ? 'Изменить событие' : 'Новое событие'}</h3>
      {error && <div className="alert err" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="e-title">Название *</label>
          <input id="e-title" required value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="e-kind">Тип</label>
            <select id="e-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="e-loc">Место</label>
            <input id="e-loc" value={form.location} placeholder="Офис, Zoom…"
              onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="e-start">Начало *</label>
            <input id="e-start" type="datetime-local" value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="e-end">Окончание</label>
            <input id="e-end" type="datetime-local" value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="e-desc">Описание</label>
          <textarea id="e-desc" rows={3} value={form.description}
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
