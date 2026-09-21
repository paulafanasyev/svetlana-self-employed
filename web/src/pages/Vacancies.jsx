/**
 * Вакансии (§22): публичная доска, отклики и управление кандидатами
 * по своим вакансиям. Список публичный — чужие вакансии не редактируются.
 */
import { useState } from 'react';
import { vacancies } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useResource, EmptyState, ErrorState, fmtDate, fmtMoney } from '../ui.jsx';

const VAC_STATUS = {
  active: ['Активна', 'ok'], closed: ['Закрыта', ''], draft: ['Черновик', 'warn'],
};

const CAND_STATUS = {
  applied: ['Откликнулся', 'info'], screening: ['Отбор', 'warn'],
  interview: ['Собеседование', 'info'], offered: ['Оффер', 'warn'],
  hired: ['Нанят', 'ok'], rejected: ['Отклонён', 'err'],
};

const DECISIONS = [
  ['interview', 'Собеседование', ''],
  ['offered', 'Оффер', ''],
  ['hired', 'Нанять', 'btn-primary'],
  ['rejected', 'Отклонить', 'btn-danger'],
];

function salary(v) {
  const cur = v.currency || 'RUB';
  if (v.salary_from != null && v.salary_to != null) {
    return `${fmtMoney(v.salary_from, cur)} – ${fmtMoney(v.salary_to, cur)}`;
  }
  if (v.salary_to != null) return `до ${fmtMoney(v.salary_to, cur)}`;
  if (v.salary_from != null) return `от ${fmtMoney(v.salary_from, cur)}`;
  return 'не указана';
}

export default function Vacancies() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useResource(
    () => vacancies.list(`?q=${encodeURIComponent(q)}`), [q],
  );
  const mine = useResource(() => vacancies.mine(), []);
  const [showForm, setShowForm] = useState(false);
  const [applyFor, setApplyFor] = useState(null);
  const [openVac, setOpenVac] = useState(null);

  const rows = data?.data ?? [];
  const mineRows = mine.data?.data ?? [];

  const create = async (body) => {
    await vacancies.create(body);
    setShowForm(false);
    mine.reload();
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="stack">
      <div className="row between">
        <div className="field" style={{ margin: 0, flex: '1 1 240px' }}>
          <input type="search" placeholder="Поиск вакансий по названию, описанию, городу…"
            value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск вакансий" />
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Опубликовать вакансию
        </button>
      </div>

      {showForm && <VacancyForm onSubmit={create} onCancel={() => setShowForm(false)} />}

      {loading && <p className="muted">Загружаю вакансии…</p>}

      {!loading && rows.length === 0 && (
        <EmptyState icon="💼" title="Вакансий не найдено"
          hint="Измените поисковый запрос или опубликуйте вакансию со своей стороны" />
      )}

      {!loading && rows.length > 0 && (
        <div className="grid grid-2">
          {rows.map((v) => (
            <div className="card" key={v.id}>
              <div className="row between">
                <h3 style={{ margin: 0 }}>{v.title}</h3>
                <span className="small muted">{fmtDate(v.created_at)}</span>
              </div>
              <p className="small muted">Работодатель: {v.employer_email ?? '—'}</p>
              {v.description ? <p className="small">{v.description}</p> : null}
              <div className="row" style={{ gap: 14 }}>
                <span className="small">💰 Зарплата: <strong>{salary(v)}</strong></span>
                <span className="small">
                  {v.remote ? 'Удалённо' : 'Офис'}{v.city ? ` · ${v.city}` : ''}
                </span>
              </div>
              {(v.skills ?? []).length > 0 && (
                <div className="row" style={{ gap: 4 }}>
                  {v.skills.map((s) => <span key={s} className="badge info">{s}</span>)}
                </div>
              )}
              <div className="row" style={{ gap: 6 }}>
                {v.employer_id === user?.id ? (
                  <span className="small muted">Это ваша вакансия</span>
                ) : (
                  <button className="btn btn-sm btn-primary"
                    onClick={() => setApplyFor(applyFor === v.id ? null : v.id)}>
                    {applyFor === v.id ? 'Скрыть форму' : 'Откликнуться'}
                  </button>
                )}
              </div>
              {applyFor === v.id && (
                <ApplyForm vacancyId={v.id} onCancel={() => setApplyFor(null)} />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3 style={{ margin: 0 }}>Мои вакансии</h3>
        <p className="small muted" style={{ margin: '4px 0 10px' }}>
          Управление потоком кандидатов на ваши вакансии
        </p>
        {mine.loading && <p className="muted">Загружаю…</p>}
        {mine.error && <ErrorState error={mine.error} onRetry={mine.reload} />}
        {!mine.loading && !mine.error && mineRows.length === 0 && (
          <EmptyState icon="🗂️" title="У вас пока нет вакансий"
            hint="Опубликуйте вакансию — здесь появится управление кандидатами" />
        )}
        {!mine.loading && !mine.error && mineRows.length > 0 && (
          <div className="stack">
            {mineRows.map((v) => (
              <div key={v.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                <div className="row between">
                  <div>
                    <strong>{v.title}</strong>
                    <span className="small muted" style={{ marginLeft: 8 }}>
                      {v.city ?? '—'} · {fmtDate(v.created_at)}
                    </span>
                  </div>
                  <span className={`badge ${VAC_STATUS[v.status]?.[1] ?? ''}`}>
                    {VAC_STATUS[v.status]?.[0] ?? v.status}
                  </span>
                </div>
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  <button className="btn btn-sm"
                    onClick={() => setOpenVac(openVac === v.id ? null : v.id)}>
                    {openVac === v.id ? 'Скрыть кандидатов' : 'Кандидаты'}
                  </button>
                </div>
                {openVac === v.id && <CandidateList vacancyId={v.id} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ApplyForm({ vacancyId, onCancel }) {
  const [resume, setResume] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await vacancies.apply(vacancyId, { resume: resume.trim() || undefined });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Не удалось отправить отклик');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="alert ok" role="status" style={{ marginTop: 8 }}>
        Отклик отправлен. Статус можно проверить у работодателя.
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
        <label htmlFor="v-resume">Сопроводительный текст / резюме (необязательно)</label>
        <textarea id="v-resume" rows={3} placeholder="Опыт, ссылки, условия…" maxLength={10000}
          value={resume} onChange={(e) => setResume(e.target.value)} />
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

function ScoreBadge({ score }) {
  const n = Math.max(0, Math.min(100, Number(score ?? 0)));
  const tone = n >= 70 ? 'ok' : n >= 40 ? 'warn' : 'err';
  return <span className={`badge ${tone}`}>{n}%</span>;
}

function CandidateList({ vacancyId }) {
  const { data, loading, error, reload, setData } = useResource(
    () => vacancies.candidates(vacancyId), [vacancyId],
  );
  const [busy, setBusy] = useState(null);
  const rows = data?.data ?? [];

  const decide = async (candId, status) => {
    setBusy(`${candId}:${status}`);
    try {
      const updated = await vacancies.decideCandidate(vacancyId, candId, { status });
      setData((d) => ({
        ...d,
        data: (d?.data ?? []).map((c) => (c.id === candId ? { ...c, ...updated } : c)),
      }));
    } catch (err) {
      window.alert(err.message || 'Не удалось изменить статус кандидата');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <p className="muted small" style={{ margin: '8px 0' }}>Загружаю кандидатов…</p>;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (rows.length === 0) {
    return (
      <EmptyState icon="🧑‍🤝‍🧑" title="Откликов пока нет"
        hint="Кандидаты появятся, когда кто-то откликнется на вакансию" />
    );
  }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 8, marginTop: 8 }}>
      <table className="data">
        <thead>
          <tr>
            <th>Кандидат</th><th>Совпадение</th><th>Навыки</th><th>Резюме</th><th>Статус</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="small"><strong>{c.candidate_email ?? '—'}</strong></td>
              <td className="small"><ScoreBadge score={c.match_score} /></td>
              <td className="small muted" style={{ maxWidth: 200 }}>
                {c.skills ? String(c.skills).split(',').join(', ') : '—'}
              </td>
              <td className="small muted" style={{ maxWidth: 260 }}>
                {c.resume ? `${String(c.resume).slice(0, 90)}${c.resume.length > 90 ? '…' : ''}` : '—'}
              </td>
              <td>
                <span className={`badge ${CAND_STATUS[c.status]?.[1] ?? ''}`}>
                  {CAND_STATUS[c.status]?.[0] ?? c.status}
                </span>
              </td>
              <td>
                <div className="row" style={{ gap: 4 }}>
                  {DECISIONS.map(([st, label, cls]) => (
                    <button key={st} className={`btn btn-sm ${cls}`}
                      disabled={busy === `${c.id}:${st}`} onClick={() => decide(c.id, st)}>
                      {label}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VacancyForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState({
    title: '', description: '', salary_from: '', salary_to: '',
    city: (() => { try { return localStorage.getItem('mir-city') || ''; } catch { return ''; } })(), remote: true, skills: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.title.trim().length < 3) { setError('Заголовок — минимум 3 символов'); return; }
    const body = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      salary_from: form.salary_from ? Number(form.salary_from) : null,
      salary_to: form.salary_to ? Number(form.salary_to) : null,
      city: form.city.trim() || undefined,
      remote: !!form.remote,
      skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
    };
    setBusy(true);
    try {
      await onSubmit(body);
    } catch (err) {
      setError(err.message || 'Не удалось опубликовать вакансию');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3>Опубликовать вакансию</h3>
      {error && <div className="alert err" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="v-title">Заголовок *</label>
          <input id="v-title" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="v-desc">Описание</label>
          <textarea id="v-desc" rows={4} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="v-from">Зарплата от, ₽</label>
            <input id="v-from" type="number" min="0" step="1" value={form.salary_from}
              onChange={(e) => setForm({ ...form, salary_from: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="v-to">Зарплата до, ₽</label>
            <input id="v-to" type="number" min="0" step="1" value={form.salary_to}
              onChange={(e) => setForm({ ...form, salary_to: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="v-city">Город</label>
            <input id="v-city" value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className="field">
            <label>
              <input type="checkbox" style={{ width: 'auto', marginRight: 6 }}
                checked={form.remote} onChange={(e) => setForm({ ...form, remote: e.target.checked })} />
              Удалённая работа
            </label>
          </div>
        </div>
        <div className="field">
          <label htmlFor="v-skills">Требуемые навыки (через запятую)</label>
          <input id="v-skills" placeholder="React, TypeScript, Figma" value={form.skills}
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
