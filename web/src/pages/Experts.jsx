/**
 * Эксперты и учебные центры (§24). Публичные профили экспертов, запрос
 * консультации и регистрация своего профиля эксперта.
 *
 * Внимание: API бронирования консультаций не существует — кнопка консультации
 * показывает правдивую заметку и даёт контакт эксперта, ничего не выдумывая.
 * В схеме experts нет специализации и рейтинга — показываем то, что реально
 * есть: имя, био, верификацию и email.
 */
import { useState } from 'react';
import { education } from '../api.js';
import { useResource, Badge, EmptyState, ErrorState, fmtDate, plural } from '../ui.jsx';

export default function Experts() {
  const { data, loading, error, reload, setData } = useResource(() => education.experts(), []);
  const [showForm, setShowForm] = useState(false);
  const [note, setNote] = useState(null);

  const rows = data?.data ?? [];

  const consult = (expert) => {
    // Никакого выдуманного API бронирования — только честный контакт.
    setNote({
      id: expert.id,
      text: 'Бронирование консультаций пока не автоматизировано. Свяжитесь с экспертом напрямую:',
      email: expert.email,
    });
  };

  const becomeExpert = async (body) => {
    const created = await education.becomeExpert(body);
    setData((d) => ({ ...d, data: [created, ...(d?.data ?? [])] }));
    setShowForm(false);
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="stack">
      <div className="row between">
        <span className="small muted">
          {rows.length} {plural(rows.length, 'эксперт', 'эксперта', 'экспертов')}
        </span>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Скрыть форму' : 'Стать экспертом'}
        </button>
      </div>

      <p className="small muted" style={{ margin: 0 }}>
        Профиль эксперта виден другим пользователям площадки. Размещайте только
        реальные данные о своём опыте.
      </p>

      {showForm && (
        <ExpertForm onSubmit={becomeExpert} onCancel={() => setShowForm(false)} />
      )}

      {loading && <p className="muted">Загружаю экспертов…</p>}
      {!loading && rows.length === 0 && (
        <EmptyState
          icon="🧑‍🏫"
          title="Экспертов пока нет"
          hint="Зарегистрируйте свой профиль эксперта — он первым появится в списке."
        />
      )}
      {!loading && rows.length > 0 && (
        <div className="grid grid-2">
          {rows.map((ex) => (
            <div className="card" key={ex.id}>
              <div className="row between" style={{ alignItems: 'flex-start', gap: 8 }}>
                <strong style={{ flex: '1 1 auto' }}>{ex.display_name}</strong>
                {ex.is_verified ? <Badge status="verified">Верифицирован</Badge> : <Badge>Эксперт</Badge>}
              </div>
              <p className="small muted" style={{ margin: '4px 0 8px' }}>
                {ex.email ? `Email: ${ex.email}` : 'Контакт скрыт'}
                {` · в каталоге с ${fmtDate(ex.created_at)}`}
              </p>
              {ex.bio ? (
                <p className="small" style={{ margin: '0 0 10px' }}>{ex.bio}</p>
              ) : (
                <p className="small muted" style={{ margin: '0 0 10px' }}>Описание профиля не заполнено.</p>
              )}
              <button className="btn btn-sm btn-primary" onClick={() => consult(ex)}>
                Запросить консультацию
              </button>
              {note?.id === ex.id && (
                <div className="alert info" role="alert" style={{ marginTop: 8 }}>
                  {note.text}{' '}
                  {note.email
                    ? <a href={`mailto:${note.email}?subject=Консультация`}>{note.email}</a>
                    : 'контакт недоступен.'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExpertForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState({ display_name: '', bio: '' });
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.display_name.trim().length < 2) {
      setError('Укажите имя для профиля эксперта (минимум 2 символа)');
      return;
    }
    try {
      await onSubmit({
        display_name: form.display_name.trim(),
        bio: form.bio.trim() || undefined,
      });
    } catch (err) {
      setError(err?.message || 'Не удалось создать профиль эксперта');
    }
  };

  return (
    <div className="card">
      <h3>Профиль эксперта</h3>
      {error && <div className="alert err" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="e-name">Имя / название *</label>
          <input id="e-name" required value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="e-bio">О себе</label>
          <textarea id="e-bio" rows={4} placeholder="Опишите свой опыт, специализацию и форматы работы"
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })} />
        </div>
        <div className="row">
          <button className="btn btn-primary" type="submit">Опубликовать профиль</button>
          <button className="btn" type="button" onClick={onCancel}>Отмена</button>
        </div>
      </form>
    </div>
  );
}
