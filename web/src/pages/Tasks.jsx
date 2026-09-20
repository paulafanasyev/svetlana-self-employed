/**
 * Задачи — CRUD + подзадачи + просроченные (§15, §32).
 */
import { Fragment, useEffect, useState } from 'react';
import { tasks } from '../api.js';
import {
  useResource, Badge, EmptyState, ErrorState, fmtDate, confirmAction,
} from '../ui.jsx';

const STATUSES = { todo: 'К очереди', in_progress: 'В работе', done: 'Готово', cancelled: 'Отменена' };
const PRIORITIES = { low: 'Низкий', medium: 'Средний', high: 'Высокий', urgent: 'Срочный' };
const PR_TONE = { low: '', medium: 'info', high: 'warn', urgent: 'err' };
const FMT = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' };
const now = () => Math.floor(Date.now() / 1000);
const isOverdue = (t) => t.due_at && t.status !== 'done' && t.status !== 'cancelled' && t.due_at < now();
const toLocal = (sec) => {
  if (!sec) return '';
  const d = new Date(sec * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v) => (v ? Math.floor(new Date(v).getTime() / 1000) : null);

export default function Tasks() {
  const [q, setQ] = useState('');
  const { data, loading, error, reload, setData } = useResource(() => tasks.list(q), [q]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showOverdue, setShowOverdue] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const [counts, setCounts] = useState({});

  const rows = data?.data ?? [];

  // Счётчики подзадач для строки «2/5» (один параллельный обход списка).
  useEffect(() => {
    const list = data?.data ?? [];
    if (!list.length) return;
    let alive = true;
    Promise.all(
      list.map((t) => tasks.subtasks(t.id).then((r) => [t.id, r.data ?? []]).catch(() => null))
    ).then((res) => {
      if (!alive) return;
      setCounts(Object.fromEntries(
        res.filter(Boolean).map(([id, s]) => [id, { total: s.length, done: s.filter((x) => x.done).length }])
      ));
    });
    return () => { alive = false; };
  }, [data]);

  const syncCount = (taskId, subrows) =>
    setCounts((c) => ({ ...c, [taskId]: {
      total: subrows.length, done: subrows.filter((s) => s.done).length,
    } }));

  const toggleExpand = (id) =>
    setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const closeForm = () => { setShowForm(false); setEditing(null); };

  const create = async (body) => {
    const created = await tasks.create(body);
    setData((d) => ({ ...d, data: [created, ...(d?.data ?? [])], total: (d?.total ?? 0) + 1 }));
    closeForm();
  };

  const update = async (id, body) => {
    const updated = await tasks.update(id, body);
    setData((d) => ({ ...d, data: (d?.data ?? []).map((r) => (r.id === id ? updated : r)) }));
    closeForm();
  };

  const remove = async (id) => {
    if (!confirmAction('Удалить задачу? Подзадачи также будут удалены.')) return;
    await tasks.delete(id);
    setData((d) => ({ ...d, data: (d?.data ?? []).filter((r) => r.id !== id), total: (d?.total ?? 0) - 1 }));
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="stack">
      <div className="row between">
        <div className="field" style={{ margin: 0, flex: '1 1 220px' }}>
          <input
            type="search"
            placeholder="Поиск по задачам…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Поиск задач"
          />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            className={`btn ${showOverdue ? 'btn-danger' : ''}`}
            onClick={() => setShowOverdue((v) => !v)}
            aria-expanded={showOverdue}
          >
            Просроченные
          </button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
            + Добавить задачу
          </button>
        </div>
      </div>

      {showOverdue && <OverduePanel />}

      {showForm && (
        <TaskForm
          initial={editing}
          onSubmit={(body) => (editing ? update(editing.id, body) : create(body))}
          onCancel={closeForm}
        />
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading && <p className="muted" style={{ padding: 18 }}>Загружаю задачи…</p>}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon="✅"
            title="Задач пока нет"
            hint="Добавьте задачу вручную или попросите Светлану: «напомни сдать акт до пятницы»"
          />
        )}
        {!loading && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Задача</th><th>Приоритет</th><th>Статус</th><th>Срок</th><th>Подзадачи</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <Fragment key={t.id}>
                    <tr>
                      <td>
                        <strong>{t.title}</strong>
                        {t.description && <div className="small muted">{t.description}</div>}
                      </td>
                      <td><span className={`badge ${PR_TONE[t.priority]}`}>{PRIORITIES[t.priority]}</span></td>
                      <td><Badge status={t.status}>{STATUSES[t.status]}</Badge></td>
                      <td className="small">
                        {!t.due_at ? '—' : isOverdue(t)
                          ? <span className="badge err">{fmtDate(t.due_at, FMT)}</span>
                          : fmtDate(t.due_at, FMT)}
                      </td>
                      <td>
                        <button className="btn btn-sm" onClick={() => toggleExpand(t.id)} aria-expanded={expanded.has(t.id)}>
                          {counts[t.id] ? `${counts[t.id].done}/${counts[t.id].total}` : 'Подзадачи'}
                        </button>
                      </td>
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          <button className="btn btn-sm" onClick={() => { setEditing(t); setShowForm(true); }}>Изменить</button>
                          <button className="btn btn-sm btn-danger" onClick={() => remove(t.id)}>Удалить</button>
                        </div>
                      </td>
                    </tr>
                    {expanded.has(t.id) && (
                      <tr>
                        <td colSpan={6} style={{ padding: 12, background: '#f7f8fa' }}>
                          <Subtasks taskId={t.id} onChange={syncCount} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && rows.length > 0 && (
        <p className="small muted">Всего: {data?.total}</p>
      )}
    </div>
  );
}

function OverduePanel() {
  const { data, loading, error, reload } = useResource(() => tasks.overdue(), []);
  const rows = data?.data ?? [];
  return (
    <div className="card">
      <div className="row between">
        <h3>
          Просроченные задачи <span className="badge err">{data?.count ?? rows.length}</span>
        </h3>
        <button className="btn btn-sm" onClick={reload}>Обновить</button>
      </div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && <p className="muted">Загружаю…</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="muted">Просроченных задач нет. Так держать!</p>
      )}
      {!loading && !error && rows.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          {rows.map((t) => (
            <div key={t.id} className="row between">
              <div>
                <strong>{t.title}</strong>
                <div className="small muted">{PRIORITIES[t.priority]} · {STATUSES[t.status]}</div>
              </div>
              <span className="badge err">Просрочено · {fmtDate(t.due_at, FMT)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Subtasks({ taskId, onChange }) {
  const { data, loading, error, setData } = useResource(() => tasks.subtasks(taskId), [taskId]);
  const [title, setTitle] = useState('');
  const rows = data?.data ?? [];

  const apply = (next) => {
    setData((d) => ({ ...d, data: next }));
    onChange(taskId, next);
  };

  const add = async (e) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    apply([...rows, await tasks.addSubtask(taskId, { title: t })]);
    setTitle('');
  };

  const toggle = async (s) => {
    const updated = await tasks.toggleSubtask(taskId, s.id, !s.done);
    apply(rows.map((r) => (r.id === s.id ? updated : r)));
  };

  const remove = async (s) => {
    if (!confirmAction('Удалить подзадачу?')) return;
    await tasks.deleteSubtask(taskId, s.id);
    apply(rows.filter((r) => r.id !== s.id));
  };

  if (error) return <ErrorState error={error} />;

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row between">
        <strong className="small">
          Подзадачи ({rows.filter((s) => s.done).length}/{rows.length})
        </strong>
        {loading && <span className="small muted">Загружаю подзадачи…</span>}
        {!loading && rows.length === 0 && <span className="small muted">подзадач нет</span>}
      </div>
      {rows.map((s) => (
        <div key={s.id} className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={!!s.done} onChange={() => toggle(s)} aria-label="Готовность подзадачи" />
          <span className="small" style={s.done ? { textDecoration: 'line-through' } : null}>{s.title}</span>
          <button className="btn btn-sm btn-danger" onClick={() => remove(s)}>✕</button>
        </div>
      ))}
      <form className="row" style={{ gap: 8, alignItems: 'center' }} onSubmit={add}>
        <div className="field" style={{ margin: 0, flex: '1 1 160px' }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Новая подзадача" aria-label="Новая подзадача" />
        </div>
        <button className="btn btn-sm" type="submit">Добавить</button>
      </form>
    </div>
  );
}

function Sel({ id, label, options, value, onChange }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={onChange}>
        {Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
}

function TaskForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    status: initial?.status ?? 'todo',
    priority: initial?.priority ?? 'medium',
    due: toLocal(initial?.due_at),
  });
  const [error, setError] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) { setError('Укажите название задачи'); return; }
    onSubmit({
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status,
      priority: form.priority,
      due_at: fromLocal(form.due),
    });
  };

  return (
    <div className="card">
      <h3>{initial ? 'Изменить задачу' : 'Новая задача'}</h3>
      {error && <div className="alert err" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="t-title">Название *</label>
          <input id="t-title" required value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="grid grid-2">
          <Sel id="t-status" label="Статус" options={STATUSES}
            value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
          <Sel id="t-priority" label="Приоритет" options={PRIORITIES}
            value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          <div className="field">
            <label htmlFor="t-due">Срок</label>
            <input id="t-due" type="datetime-local" value={form.due}
              onChange={(e) => setForm({ ...form, due: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="t-desc">Описание</label>
          <textarea id="t-desc" rows={3} value={form.description}
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
