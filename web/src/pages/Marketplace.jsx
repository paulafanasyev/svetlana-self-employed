/**
 * Маркетплейс заказов (§21): открытая доска проектов, отклики и AI-матчинг.
 * Список публичный — карточки не предполагают, что заказ принадлежит нам.
 */
import { useState } from 'react';
import { marketplace } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useResource, EmptyState, ErrorState, fmtDate, fmtMoney } from '../ui.jsx';

const PROJECT_STATUS = {
  open: ['Открыт', 'ok'], in_progress: ['В работе', 'warn'],
  closed: ['Закрыт', ''], cancelled: ['Отменён', 'err'],
};

function StatusBadge({ status }) {
  const [label, tone] = PROJECT_STATUS[status] ?? [status, ''];
  return <span className={`badge ${tone}`}>{label}</span>;
}

function budget(p) {
  const cur = p.currency || 'RUB';
  if (p.budget_min != null && p.budget_max != null) {
    return `${fmtMoney(p.budget_min, cur)} – ${fmtMoney(p.budget_max, cur)}`;
  }
  if (p.budget_max != null) return `до ${fmtMoney(p.budget_max, cur)}`;
  if (p.budget_min != null) return `от ${fmtMoney(p.budget_min, cur)}`;
  return 'не указан';
}

export default function Marketplace() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('open');
  const query = `?q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`;
  const { data, loading, error, reload, setData } = useResource(
    () => marketplace.projects(query), [q, status],
  );
  const [showForm, setShowForm] = useState(false);
  const [applyFor, setApplyFor] = useState(null);
  const [matchFor, setMatchFor] = useState(null);
  const [match, setMatch] = useState({});

  const rows = data?.data ?? [];

  const create = async (body) => {
    const created = await marketplace.createProject(body);
    setData((d) => ({ ...d, data: [created, ...(d?.data ?? [])] }));
    setShowForm(false);
  };

  const toggleMatch = async (p) => {
    if (matchFor === p.id) { setMatchFor(null); return; }
    setMatchFor(p.id);
    if (match[p.id]) return;
    setMatch((m) => ({ ...m, [p.id]: { loading: true } }));
    try {
      const res = await marketplace.matching(p.id);
      setMatch((m) => ({ ...m, [p.id]: { data: res } }));
    } catch (e) {
      setMatch((m) => ({ ...m, [p.id]: { error: e } }));
    }
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="stack">
      <div className="row between">
        <div className="field" style={{ margin: 0, flex: '1 1 220px' }}>
          <input type="search" placeholder="Поиск по названию и описанию…" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="Поиск заказов" />
        </div>
        <select aria-label="Статус заказа" className="field" style={{ margin: 0, flex: '0 0 170px' }}
          value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Открытые</option>
          <option value="in_progress">В работе</option>
          <option value="closed">Закрытые</option>
          <option value="cancelled">Отменённые</option>
        </select>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Опубликовать заказ
        </button>
      </div>

      {showForm && <ProjectForm onSubmit={create} onCancel={() => setShowForm(false)} />}

      {loading && <p className="muted">Загружаю заказы…</p>}

      {!loading && rows.length === 0 && (
        <EmptyState icon="🛒" title="Заказов не найдено"
          hint="Измените запрос или статус, либо опубликуйте свой заказ для исполнителей" />
      )}

      {!loading && rows.length > 0 && (
        <div className="grid grid-2">
          {rows.map((p) => (
            <div className="card" key={p.id}>
              <div className="row between">
                <h3 style={{ margin: 0 }}>{p.title}</h3>
                <StatusBadge status={p.status} />
              </div>
              <p className="muted small">{p.description}</p>
              <div className="row" style={{ gap: 14 }}>
                <span className="small">💰 Бюджет: <strong>{budget(p)}</strong></span>
                <span className="small">📅 Дедлайн: {fmtDate(p.deadline)}</span>
              </div>
              <div className="row" style={{ gap: 4 }}>
                {p.category ? <span className="badge">{p.category}</span> : null}
                {(p.skills ?? []).map((s) => <span key={s} className="badge info">{s}</span>)}
              </div>
              <p className="small muted">
                Откликов: {p.applications_count ?? 0} · Заказчик: {p.customer_email ?? '—'}
              </p>
              <div className="row" style={{ gap: 6 }}>
                {p.customer_id === user?.id ? (
                  <span className="small muted">Это ваш заказ — откликнуться нельзя</span>
                ) : (
                  <button className="btn btn-sm btn-primary"
                    onClick={() => setApplyFor(applyFor === p.id ? null : p.id)}>
                    {applyFor === p.id ? 'Скрыть форму' : 'Откликнуться'}
                  </button>
                )}
                <button className="btn btn-sm" onClick={() => toggleMatch(p)}>
                  Насколько подходит
                </button>
              </div>
              {applyFor === p.id && (
                <ApplyForm projectId={p.id} onCancel={() => setApplyFor(null)} />
              )}
              {matchFor === p.id && <MatchPanel m={match[p.id]} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ApplyForm({ projectId, onCancel }) {
  const [cover, setCover] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (cover.trim().length < 10) { setError('Сопроводительное письмо — минимум 10 символов'); return; }
    setBusy(true);
    try {
      await marketplace.apply(projectId, {
        cover_letter: cover.trim(),
        proposed_price: price ? Number(price) : undefined,
      });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Не удалось отправить отклик');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="alert ok" role="status">
        Отклик отправлен. Ответ появится в разделе «Мои отклики».
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-sm" onClick={onCancel}>Закрыть</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 8 }}>
      {error && <div className="alert err" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="a-cover">Сопроводительное письмо *</label>
        <textarea id="a-cover" rows={3} placeholder="Чем вы полезны для этого заказа…"
          value={cover} onChange={(e) => setCover(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="a-price">Предлагаемая цена, ₽ (необязательно)</label>
        <input id="a-price" type="number" min="0" step="1" placeholder="Например, 15000"
          value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Отправляю…' : 'Отправить отклик'}
        </button>
        <button className="btn" type="button" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  );
}

function MatchPanel({ m }) {
  if (!m) return null;
  if (m.loading) return <p className="muted small" style={{ margin: 0 }}>Считаю совместимость…</p>;
  if (m.error) {
    return (
      <div className="alert err" role="alert" style={{ marginTop: 8 }}>
        {m.error.message || 'Не удалось рассчитать совместимость'}
      </div>
    );
  }
  const d = m.data;
  const score = Math.max(0, Math.min(100, Number(d?.score ?? 0)));
  const color = score >= 70 ? 'var(--ok)' : score >= 40 ? 'var(--warn)' : 'var(--err)';
  const wanted = d?.wanted ?? [];
  const matched = d?.matched_skills ?? [];
  const missing = wanted.filter((w) => !matched.includes(w));
  return (
    <div className="alert info" style={{ marginTop: 8 }}>
      <strong>Совпадение с профилем: {score}%</strong>
      <div style={{ height: 8, background: 'var(--line)', borderRadius: 4, margin: '8px 0', overflow: 'hidden' }}
        role="img" aria-label={`Совпадение ${score}%`}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      {matched.length > 0 ? (
        <div className="row" style={{ gap: 4 }}>
          <span className="small">Подходящие навыки:</span>
          {matched.map((s) => <span key={s} className="badge ok">{s}</span>)}
        </div>
      ) : (
        <p className="small" style={{ margin: 0 }}>Подходящих навыков из требований не найдено.</p>
      )}
      {missing.length > 0 && (
        <div className="row" style={{ gap: 4, marginTop: 6 }}>
          <span className="small">Не хватает:</span>
          {missing.map((s) => <span key={s} className="badge warn">{s}</span>)}
        </div>
      )}
      {d?.have?.length > 0 && (
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          Навыки в профиле: {d.have.map((s) => s.name).join(', ')}
        </p>
      )}
    </div>
  );
}

function ProjectForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState({
    title: '', description: '', budget_min: '', budget_max: '',
    category: '', skills: '', deadline: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.title.trim().length < 5) { setError('Заголовок — минимум 5 символов'); return; }
    if (form.description.trim().length < 20) { setError('Описание — минимум 20 символов'); return; }
    const body = {
      title: form.title.trim(),
      description: form.description.trim(),
      budget_min: form.budget_min ? Number(form.budget_min) : null,
      budget_max: form.budget_max ? Number(form.budget_max) : null,
      currency: 'RUB',
      skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
    };
    if (form.category.trim()) body.category = form.category.trim();
    if (form.deadline) body.deadline = Math.floor(new Date(form.deadline).getTime() / 1000);
    setBusy(true);
    try {
      await onSubmit(body);
    } catch (err) {
      setError(err.message || 'Не удалось опубликовать заказ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3>Опубликовать заказ</h3>
      {error && <div className="alert err" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="p-title">Заголовок *</label>
          <input id="p-title" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="p-desc">Описание * (минимум 20 символов)</label>
          <textarea id="p-desc" rows={4} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="p-min">Бюджет от, ₽</label>
            <input id="p-min" type="number" min="0" step="1" value={form.budget_min}
              onChange={(e) => setForm({ ...form, budget_min: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="p-max">Бюджет до, ₽</label>
            <input id="p-max" type="number" min="0" step="1" value={form.budget_max}
              onChange={(e) => setForm({ ...form, budget_max: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="p-cat">Категория</label>
            <input id="p-cat" placeholder="Дизайн, разработка…" value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="p-dead">Дедлайн</label>
            <input id="p-dead" type="date" value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="p-skills">Требуемые навыки (через запятую)</label>
          <input id="p-skills" placeholder="Figma, React, копирайтинг" value={form.skills}
            onChange={(e) => setForm({ ...form, skills: e.target.value })} />
        </div>
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Публикую…' : 'Опубликовать'}
          </button>
          <button className="btn" type="button" onClick={onCancel}>Отмена</button>
        </div>
      </form>
    </div>
  );
}
