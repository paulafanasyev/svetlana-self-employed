/**
 * Рабочий профиль (§28) — контекст, над которым рассуждает Светлана.
 * Редактируются только поля, которые реально существуют в таблице
 * profiles. Навыки показываются как есть (связанная таблица profile_skills).
 */
import { useEffect, useState } from 'react';
import { profileApi } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useResource, ErrorState } from '../ui.jsx';

const CURRENCIES = ['RUB', 'USD', 'EUR'];

/** Только поля из таблицы profiles (schema/back-end/routes/profile.js). */
const FIELD_LABELS = {
  display_name: 'Имя для клиентов *',
  profession: 'Профессия',
  specialization: 'Специализация',
  city: 'Город',
  work_geography: 'География работы',
  schedule: 'График',
  experience_years: 'Опыт, лет',
  min_hourly_rate: 'Минимальная ставка, ₽/час',
  currency: 'Валюта',
  goals: 'Цели (через запятую)',
  bio: 'О себе',
};

export default function Profile() {
  const { refreshProfile } = useAuth();
  const { data, loading, error, reload } = useResource(() => profileApi.get(), []);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);

  // Заполняем форму данными API, когда они приходят.
  useEffect(() => {
    if (!data) return;
    setForm({
      display_name: data.display_name ?? '',
      profession: data.profession ?? '',
      specialization: data.specialization ?? '',
      city: data.city ?? '',
      work_geography: data.work_geography ?? '',
      schedule: data.schedule ?? '',
      experience_years: data.experience_years ?? '',
      min_hourly_rate: data.min_hourly_rate ?? '',
      currency: data.currency ?? 'RUB',
      goals: Array.isArray(data.goals) ? data.goals.join(', ') : '',
      bio: data.bio ?? '',
    });
  }, [data]);

  if (loading) return <p className="muted">Загружаю профиль…</p>;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!form) return null;

  const set = (key) => (e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setSaved(false); };

  const submit = async (e) => {
    e.preventDefault();
    setSaveError(null);
    setSaved(false);
    if (form.display_name.trim().length < 2) {
      setSaveError('Имя для клиентов обязательно — минимум 2 символа');
      return;
    }
    const goals = form.goals.split(',').map((g) => g.trim()).filter(Boolean);
    const body = {
      display_name: form.display_name.trim(),
      profession: form.profession.trim() || null,
      specialization: form.specialization.trim() || null,
      city: form.city.trim() || null,
      work_geography: form.work_geography.trim() || null,
      schedule: form.schedule.trim() || null,
      experience_years: form.experience_years === '' ? null : Number(form.experience_years),
      min_hourly_rate: form.min_hourly_rate === '' ? null : Number(form.min_hourly_rate),
      currency: form.currency,
      goals,
      bio: form.bio.trim() || null,
    };
    setSaving(true);
    try {
      await profileApi.update(body);
      await reload();
      if (typeof refreshProfile === 'function') await refreshProfile();
      setSaved(true);
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Рабочий профиль</h3>
        <p className="muted small">
          Этот контекст использует Светлана: предложения, цены и подборки
          строятся на нём, а не на догадках.
        </p>
        {saved && <div className="alert ok" role="status">Профиль сохранён</div>}
        {saveError && (
          <div className="alert err" role="alert">
            Не удалось сохранить: {saveError.message ?? String(saveError)}
          </div>
        )}
        <form onSubmit={submit}>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="p-display_name">{FIELD_LABELS.display_name}</label>
              <input id="p-display_name" value={form.display_name} onChange={set('display_name')} required />
            </div>
            <div className="field">
              <label htmlFor="p-profession">{FIELD_LABELS.profession}</label>
              <input id="p-profession" placeholder="напр. Дизайнер" value={form.profession} onChange={set('profession')} />
            </div>
            <div className="field">
              <label htmlFor="p-specialization">{FIELD_LABELS.specialization}</label>
              <input id="p-specialization" placeholder="напр. Мобильные приложения" value={form.specialization} onChange={set('specialization')} />
            </div>
            <div className="field">
              <label htmlFor="p-city">{FIELD_LABELS.city}</label>
              <input id="p-city" value={form.city} onChange={set('city')} />
            </div>
            <div className="field">
              <label htmlFor="p-work_geography">{FIELD_LABELS.work_geography}</label>
              <input id="p-work_geography" placeholder="напр. Москва и область, удалённо" value={form.work_geography} onChange={set('work_geography')} />
            </div>
            <div className="field">
              <label htmlFor="p-schedule">{FIELD_LABELS.schedule}</label>
              <input id="p-schedule" placeholder="напр. Будни 10:00–19:00" value={form.schedule} onChange={set('schedule')} />
            </div>
            <div className="field">
              <label htmlFor="p-experience_years">{FIELD_LABELS.experience_years}</label>
              <input id="p-experience_years" type="number" min="0" max="80" value={form.experience_years} onChange={set('experience_years')} />
            </div>
            <div className="field">
              <label htmlFor="p-min_hourly_rate">{FIELD_LABELS.min_hourly_rate}</label>
              <input id="p-min_hourly_rate" type="number" min="0" value={form.min_hourly_rate} onChange={set('min_hourly_rate')} />
            </div>
            <div className="field">
              <label htmlFor="p-currency">{FIELD_LABELS.currency}</label>
              <select id="p-currency" value={form.currency} onChange={set('currency')}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="p-goals">{FIELD_LABELS.goals}</label>
              <input id="p-goals" placeholder="напр. выйти на 300к в месяц, найти помощника" value={form.goals} onChange={set('goals')} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="p-bio">{FIELD_LABELS.bio}</label>
            <textarea id="p-bio" rows={4} maxLength={4000} value={form.bio} onChange={set('bio')} />
          </div>
          <div className="row">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Сохраняю…' : 'Сохранить профиль'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 8px' }}>Навыки</h3>
        {(data?.skills ?? []).length === 0 ? (
          <p className="muted small">Навыки пока не заполнены</p>
        ) : (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {data.skills.map((s) => (
              <span key={s.name} className="badge info">{s.name} · ур. {s.level}</span>
            ))}
          </div>
        )}
        <p className="muted small" style={{ margin: '10px 0 0' }}>
          Навыки обновляются отдельно и доступны в карточке профиля.
        </p>
      </div>
    </div>
  );
}
