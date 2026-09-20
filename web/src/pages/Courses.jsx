/**
 * Курсы — образовательный маркетплейс (§24). Каталог (покупатель), мои курсы
 * (автор), моё обучение с прогрессом и сертификатами (ученик).
 *
 * В схеме courses нет рейтинга/уровня — вместо них показываем честный бейдж
 * формата (курс / консультация / вебинар / мастер-класс / материалы).
 */
import { useState } from 'react';
import { education } from '../api.js';
import {
  useResource, Badge, EmptyState, ErrorState, fmtMoney, fmtDate, plural, confirmAction,
} from '../ui.jsx';

const FORMATS = {
  course: 'Курс', consultation: 'Консультация', webinar: 'Вебинар',
  masterclass: 'Мастер-класс', materials: 'Материалы',
};

export default function Courses() {
  const [q, setQ] = useState('');
  const catalog = useResource(() => education.courses(q ? `?q=${encodeURIComponent(q)}` : ''), [q]);
  const mine = useResource(() => education.myCourses(), []);
  const enr = useResource(() => education.myEnrollments(), []);
  const [expanded, setExpanded] = useState(null);
  const [msg, setMsg] = useState(null);
  const [draft, setDraft] = useState({});
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const rows = catalog.data?.data ?? [];
  const myRows = mine.data?.data ?? [];
  const enrRows = enr.data?.data ?? [];
  const enrolledIds = new Set(enrRows.map((e) => e.course_id));

  const enroll = async (course) => {
    setMsg(null);
    try {
      const res = await education.enroll(course.id);
      // В обоих случаях запись уже создана: для платного курса — с заказом,
      // доступ к которому откроется после оплаты.
      enr.reload();
      if (res.requires_payment) {
        setMsg({
          id: course.id, kind: 'warn',
          text: `Курс платный (${fmtMoney(course.price, course.currency)}). Создан заказ ${res.order_id} — доступ откроется после его оплаты.`,
        });
      } else {
        setMsg({ id: course.id, kind: 'ok', text: 'Вы записаны на курс.' });
      }
    } catch (err) {
      setMsg({ id: course.id, kind: 'err', text: err?.message || 'Не удалось записаться на курс' });
    }
  };

  const saveProgress = async (e) => {
    const pct = Math.max(0, Math.min(100, Math.round(Number(draft[e.id] ?? e.progress) || 0)));
    setMsg(null);
    try {
      const updated = await education.setProgress(e.id, pct);
      enr.setData((d) => ({ ...d, data: (d?.data ?? []).map((r) => (r.id === e.id ? { ...r, ...updated } : r)) }));
      setMsg({ id: e.id, kind: 'ok', text: 'Прогресс сохранён.' });
    } catch (err) {
      setMsg({ id: e.id, kind: 'err', text: err?.message || 'Не удалось сохранить прогресс' });
    }
  };

  const createCourse = async (body) => {
    const created = await education.createCourse(body);
    mine.setData((d) => ({ ...d, data: [created, ...(d?.data ?? [])] }));
    catalog.reload();
    setShowForm(false);
    setEditing(null);
  };

  const updateCourse = async (id, body) => {
    const updated = await education.updateCourse(id, body);
    mine.setData((d) => ({ ...d, data: (d?.data ?? []).map((r) => (r.id === id ? updated : r)) }));
    catalog.reload();
    setEditing(null);
    setShowForm(false);
  };

  const deleteCourse = async (id) => {
    if (!confirmAction('Удалить курс? Это действие необратимо.')) return;
    await education.deleteCourse(id);
    mine.setData((d) => ({ ...d, data: (d?.data ?? []).filter((r) => r.id !== id) }));
    catalog.reload();
  };

  return (
    <div className="stack">
      <h2 style={{ margin: 0 }}>Каталог курсов</h2>

      <div className="row between">
        <div className="field" style={{ margin: 0, flex: '1 1 220px' }}>
          <input
            type="search"
            placeholder="Поиск по названию или описанию…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Поиск курсов"
          />
        </div>
      </div>

      {catalog.error && <ErrorState error={catalog.error} onRetry={catalog.reload} />}
      {catalog.loading && <p className="muted">Загружаю курсы…</p>}
      {!catalog.loading && rows.length === 0 && (
        <EmptyState
          icon="🎓"
          title="Курсов пока нет"
          hint="Опубликуйте первый курс в разделе «Мои курсы» — он появится в каталоге."
        />
      )}
      {!catalog.loading && rows.length > 0 && (
        <div className="grid grid-3">
          {rows.map((c) => (
            <CourseCard
              key={c.id}
              c={c}
              expanded={expanded === c.id}
              onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
              enrolled={enrolledIds.has(c.id)}
              onEnroll={() => enroll(c)}
              msg={msg}
            />
          ))}
        </div>
      )}

      <h2 style={{ margin: '8px 0 0' }}>Мои курсы</h2>

      <div className="row between">
        <span className="small muted">
          {myRows.length} {plural(myRows.length, 'курс', 'курса', 'курсов')}
        </span>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + Создать курс
        </button>
      </div>
      {showForm && (
        <CourseForm
          initial={editing}
          onSubmit={(body) => (editing ? updateCourse(editing.id, body) : createCourse(body))}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {mine.error && <ErrorState error={mine.error} onRetry={mine.reload} />}
      {mine.loading && <p className="muted">Загружаю мои курсы…</p>}
      {!mine.loading && myRows.length === 0 && (
        <EmptyState
          icon="🧑‍🏫"
          title="Вы ещё не создавали курсы"
          hint="Создайте курс и опубликуйте его, чтобы он появился в каталоге."
        />
      )}
      {!mine.loading && myRows.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Название</th><th>Формат</th><th>Цена</th><th>Статус</th>
                  <th>Создан</th><th></th>
                </tr>
              </thead>
              <tbody>
                {myRows.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.title}</strong></td>
                    <td className="small">{FORMATS[c.format] ?? c.format}</td>
                    <td className="small">{c.price > 0 ? fmtMoney(c.price, c.currency) : 'Бесплатно'}</td>
                    <td>
                      {c.is_published
                        ? <Badge status="published">Опубликован</Badge>
                        : <Badge status="draft">Черновик</Badge>}
                    </td>
                    <td className="small muted">{fmtDate(c.created_at)}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => { setEditing(c); setShowForm(true); }}>
                          Изменить
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteCourse(c.id)}>
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

      <h2 style={{ margin: '8px 0 0' }}>Моё обучение</h2>

      {enr.error && <ErrorState error={enr.error} onRetry={enr.reload} />}
      {enr.loading && <p className="muted">Загружаю моё обучение…</p>}
      {!enr.loading && enrRows.length === 0 && (
        <EmptyState
          icon="📚"
          title="Вы не записаны на курсы"
          hint="Запишитесь на курс из каталога выше — он появится здесь вместе с прогрессом."
        />
      )}
      {!enr.loading && enrRows.length > 0 && (
        <div className="grid grid-2">
          {enrRows.map((e) => {
            const cert = e.certificate_issued || e.progress >= 100;
            return (
              <div className="card" key={e.id}>
                <div className="row between" style={{ alignItems: 'flex-start', gap: 8 }}>
                  <strong style={{ flex: '1 1 auto' }}>{e.course_title ?? 'Курс'}</strong>
                  <Badge status={e.status}>
                    {e.status === 'completed' ? 'Завершён' : e.status === 'active' ? 'Идёт обучение' : e.status}
                  </Badge>
                </div>
                <p className="small muted" style={{ margin: '4px 0 8px' }}>
                  {FORMATS[e.format] ?? 'Курс'} · пройдено {e.progress}%
                  {cert ? ' · 🎓 сертификат выдан' : ''}
                </p>
                {cert && <div style={{ marginBottom: 8 }}><Badge status="ok">🎓 Сертификат выдан</Badge></div>}
                <div className="row" style={{ gap: 8 }}>
                  <div className="field" style={{ margin: 0, flex: '0 1 150px' }}>
                    <input
                      id={`p-${e.id}`}
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      aria-label="Прогресс обучения, процентов"
                      value={draft[e.id] ?? e.progress}
                      onChange={(ev) => setDraft({ ...draft, [e.id]: ev.target.value })}
                    />
                  </div>
                  <button className="btn btn-sm btn-primary" onClick={() => saveProgress(e)}>
                    Сохранить прогресс
                  </button>
                </div>
                {msg?.id === e.id && (
                  <div className={`alert ${msg.kind === 'err' ? 'err' : 'ok'}`} role="alert" style={{ marginTop: 8 }}>
                    {msg.text}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CourseCard({ c, expanded, onToggle, enrolled, onEnroll, msg }) {
  return (
    <div className="card">
      <div className="row between" style={{ alignItems: 'flex-start', gap: 8 }}>
        <strong style={{ flex: '1 1 auto' }}>{c.title}</strong>
        <Badge status={c.format}>{FORMATS[c.format] ?? c.format}</Badge>
      </div>
      <p className="small muted" style={{ margin: '4px 0 8px' }}>
        Автор: {c.author_email ?? '—'}
        {c.duration_hours ? ` · ${c.duration_hours} ч` : ''}
      </p>
      <div className="row between">
        <span>{c.price > 0 ? fmtMoney(c.price, c.currency) : 'Бесплатно'}</span>
        <button className="btn btn-sm" onClick={onToggle} aria-expanded={expanded}>
          {expanded ? 'Свернуть' : 'Подробнее'}
        </button>
      </div>
      {expanded && (
        <div className="stack" style={{ marginTop: 8 }}>
          {c.description
            ? <p className="small" style={{ margin: 0 }}>{c.description}</p>
            : <p className="small muted" style={{ margin: 0 }}>Описание не заполнено.</p>}
          {enrolled ? (
            <Badge status="ok">Вы записаны</Badge>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={onEnroll}>Записаться</button>
          )}
          {msg?.id === c.id && (
            <div className={`alert ${msg.kind === 'err' ? 'err' : msg.kind === 'warn' ? 'warn' : 'ok'}`} role="alert">
              {msg.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CourseForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    price: initial?.price ?? 0,
    currency: initial?.currency ?? 'RUB',
    format: initial?.format ?? 'course',
    duration_hours: initial?.duration_hours ?? '',
    is_published: !!initial?.is_published,
  });
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.title.trim().length < 3) { setError('Укажите название курса (минимум 3 символа)'); return; }
    try {
      await onSubmit({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        price: Number(form.price) || 0,
        currency: form.currency,
        format: form.format,
        duration_hours: form.duration_hours === '' ? null : Number(form.duration_hours) || null,
        is_published: !!form.is_published,
      });
    } catch (err) {
      setError(err?.message || 'Не удалось сохранить курс');
    }
  };

  return (
    <div className="card">
      <h3>{initial ? 'Изменить курс' : 'Новый курс'}</h3>
      {error && <div className="alert err" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="k-title">Название *</label>
          <input id="k-title" required value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="k-desc">Описание</label>
          <textarea id="k-desc" rows={3} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="k-format">Формат и длительность</label>
            <div className="row" style={{ gap: 6 }}>
              <select id="k-format" style={{ flex: '1 1 60%' }} value={form.format}
                onChange={(e) => setForm({ ...form, format: e.target.value })}>
                {Object.entries(FORMATS).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
              <input type="number" min={0} step={1} placeholder="часов"
                aria-label="Длительность в часах"
                value={form.duration_hours}
                onChange={(e) => setForm({ ...form, duration_hours: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="k-price">Цена (0 — бесплатно)</label>
            <div className="row" style={{ gap: 6 }}>
              <input id="k-price" type="number" min={0} step={1} style={{ flex: '1 1 60%' }}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })} />
              <select aria-label="Валюта" value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option value="RUB">RUB</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="KZT">KZT</option>
              </select>
            </div>
          </div>
        </div>
        <div className="field">
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" style={{ width: 'auto' }}
              checked={form.is_published}
              onChange={(e) => setForm({ ...form, is_published: e.target.checked })} />
            Опубликовать в каталоге
          </label>
        </div>
        <div className="row">
          <button className="btn btn-primary" type="submit">{initial ? 'Сохранить' : 'Создать'}</button>
          <button className="btn" type="button" onClick={onCancel}>Отмена</button>
        </div>
      </form>
    </div>
  );
}
