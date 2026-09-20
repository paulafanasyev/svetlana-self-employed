/**
 * Портфолио — публичный рабочий профиль специалиста (§28): профессия,
 * специализация, навыки, ценовые ориентиры, услуги и отзывы. Все данные —
 * из реального API, ничего не выдумывается.
 */
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { profileApi, marketplace } from '../api.js';
import { useResource, Badge, EmptyState, ErrorState, fmtMoney, fmtDate, plural } from '../ui.jsx';

const UNITS = { project: 'за проект', hour: 'за час', month: 'в месяц', piece: 'за штуку' };

export default function Portfolio() {
  const { user } = useAuth();
  const profile = useResource(() => profileApi.get(), []);
  const services = useResource(() => marketplace.myServices(), []);
  const reviews = useResource(
    () => (user?.id ? marketplace.reviews(user.id) : Promise.resolve({ data: [], average: 0, count: 0 })),
    [user?.id],
  );

  const p = profile.data;
  const myServices = services.data?.data ?? [];
  const reviewRows = reviews.data?.data ?? [];
  const pErr = profile.error || services.error || reviews.error;

  if (pErr) return <ErrorState error={pErr} onRetry={() => { profile.reload(); services.reload(); reviews.reload(); }} />;
  if (profile.loading) return <p className="muted">Загружаю профиль…</p>;
  if (!p) return <EmptyState icon="🖼️" title="Профиль не найден" />;

  return (
    <div className="stack">
      <div className="card">
        <div className="row between" style={{ alignItems: 'flex-start', gap: 8 }}>
          <div>
            <h2 style={{ margin: 0 }}>{p.display_name}</h2>
            <p className="small muted" style={{ margin: '4px 0 0' }}>
              {p.profession ? p.profession : 'Профессия не указана'}
              {p.specialization ? ` · ${p.specialization}` : ''}
            </p>
          </div>
          <Link to="/app/profile" className="btn btn-primary">Редактировать профиль</Link>
        </div>

        <div className="grid grid-2" style={{ marginTop: 12 }}>
          <div>
            <p className="small" style={{ margin: '0 0 6px' }}>
              <strong>Город:</strong> {p.city ?? 'не указан'}
            </p>
            {p.work_geography && (
              <p className="small" style={{ margin: '0 0 6px' }}>
                <strong>География работы:</strong> {p.work_geography}
              </p>
            )}
            {p.schedule && (
              <p className="small" style={{ margin: '0 0 6px' }}>
                <strong>График:</strong> {p.schedule}
              </p>
            )}
            {p.experience_years != null && (
              <p className="small" style={{ margin: 0 }}>
                <strong>Опыт:</strong> {p.experience_years}{' '}
                {plural(p.experience_years, 'год', 'года', 'лет')}
              </p>
            )}
          </div>
          <div>
            <p className="small" style={{ margin: '0 0 6px' }}>
              <strong>Минимальная ставка:</strong>{' '}
              {p.min_hourly_rate != null ? `${fmtMoney(p.min_hourly_rate, p.currency)} / час` : 'не указана'}
            </p>
            {p.goals?.length ? (
              <p className="small" style={{ margin: 0 }}>
                <strong>Цели:</strong> {p.goals.join(', ')}
              </p>
            ) : null}
          </div>
        </div>

        {p.bio && <p className="small" style={{ margin: '12px 0 0' }}>{p.bio}</p>}

        {p.skills?.length ? (
          <div className="row" style={{ gap: 6, marginTop: 12 }}>
            {p.skills.map((s) => (
              <Badge key={s.name} status="info">{s.name} · ур. {s.level}/5</Badge>
            ))}
          </div>
        ) : (
          <p className="small muted" style={{ margin: '12px 0 0' }}>Навыки пока не добавлены.</p>
        )}
      </div>

      <h2 style={{ margin: '8px 0 0' }}>Мои услуги</h2>

      {services.loading && <p className="muted">Загружаю услуги…</p>}
      {!services.loading && myServices.length === 0 && (
        <EmptyState
          icon="🧰"
          title="Услуги не опубликованы"
          hint="Добавьте услуги в разделе «Услуги», чтобы они появились в портфолио."
        />
      )}
      {!services.loading && myServices.length > 0 && (
        <div className="grid grid-2">
          {myServices.map((s) => (
            <div className="card" key={s.id}>
              <div className="row between" style={{ alignItems: 'flex-start', gap: 8 }}>
                <strong style={{ flex: '1 1 auto' }}>{s.title}</strong>
                {s.is_published
                  ? <Badge status="published">Опубликована</Badge>
                  : <Badge status="draft">Черновик</Badge>}
              </div>
              {s.category && <p className="small muted" style={{ margin: '4px 0' }}>{s.category}</p>}
              {s.description && <p className="small" style={{ margin: '4px 0' }}>{s.description}</p>}
              <p className="small" style={{ margin: '4px 0 0' }}>
                <strong>{fmtMoney(s.price, s.currency)}</strong>{' '}
                <span className="muted">{UNITS[s.unit] ?? ''}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ margin: '8px 0 0' }}>Отзывы</h2>

      {reviews.loading && <p className="muted">Загружаю отзывы…</p>}
      {!reviews.loading && reviewRows.length === 0 && (
        <p className="small muted" style={{ margin: 0 }}>
          Отзывов пока нет. Они появятся здесь после завершённых заказов.
        </p>
      )}
      {!reviews.loading && reviewRows.length > 0 && (
        <>
          <p className="small" style={{ margin: 0 }}>
            <strong>Средняя оценка:</strong> {reviews.data.average} ★ · отзывов:{' '}
            {reviews.data.count ?? reviewRows.length}
          </p>
          <div className="grid grid-2">
            {reviewRows.map((r) => (
              <div className="card" key={r.id}>
                <div className="row between" style={{ alignItems: 'flex-start', gap: 8 }}>
                  <span className="small">{r.author_email ?? 'Аноним'}</span>
                  <span aria-label={`Оценка ${r.rating} из 5`}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                </div>
                <p className="small" style={{ margin: '4px 0 0' }}>{r.body ?? 'Без текстового отзыва.'}</p>
                <p className="small muted" style={{ margin: '4px 0 0' }}>{fmtDate(r.created_at)}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
