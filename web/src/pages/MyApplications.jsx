/**
 * Мои отклики (§34) — только чтение. Отклики на заказы маркетплейса.
 *
 * Отдельного маршрута для откликов на вакансии (от лица кандидата) в API нет:
 *_candidates_ видит только работодатель через /vacancies/:id/candidates, а
 * маршрута «мои отклики на вакансии» не существует — поэтому здесь только
 * отклики маркетплейса.
 */
import { Link } from 'react-router-dom';
import { marketplace } from '../api.js';
import { useResource, EmptyState, ErrorState, fmtDate, fmtMoney } from '../ui.jsx';

const APP_STATUS = {
  pending: ['На рассмотрении', 'warn'],
  accepted: ['Принят', 'ok'],
  rejected: ['Отклонён', 'err'],
  withdrawn: ['Отозван', ''],
};

function excerpt(text, n = 140) {
  const s = String(text ?? '').trim();
  if (!s) return '—';
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export default function MyApplications() {
  const { data, loading, error, reload } = useResource(
    () => marketplace.myApplications(),
    [],
  );

  const rows = data?.data ?? [];

  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="stack">
      <div className="row between">
        <p className="muted small" style={{ margin: 0 }}>
          Отклики на заказы маркетплейса. Статус выставляет заказчик.
        </p>
        <button className="btn btn-sm" onClick={reload}>↻ Обновить</button>
      </div>

      {loading && <p className="muted">Загружаю отклики…</p>}

      {!loading && rows.length === 0 && (
        <EmptyState
          icon="📨"
          title="Вы ещё не откликались на заказы"
          hint="Найдите подходящий заказ на маркетплейсе и предложите свои услуги"
          action={
            <Link to="/app/marketplace" className="btn btn-primary btn-sm">
              Открыть маркетплейс
            </Link>
          }
        />
      )}

      {!loading && rows.length > 0 && (
        <div className="grid grid-2">
          {rows.map((a) => {
            const [label, tone] = APP_STATUS[a.status] ?? [a.status, ''];
            return (
              <div className="card" key={a.id}>
                <div className="row between">
                  <h3 style={{ margin: 0 }}>{a.project_title ?? 'Проект'}</h3>
                  <span className={`badge ${tone}`}>{label}</span>
                </div>
                <p className="small muted" style={{ margin: '6px 0 0' }}>
                  Отправлен {fmtDate(a.created_at)}
                </p>
                <p className="small" style={{ margin: '8px 0 0' }}>
                  {excerpt(a.cover_letter)}
                </p>
                <div className="row" style={{ gap: 14, marginTop: 8 }}>
                  <span className="small">
                    Предложенная цена:{' '}
                    <strong>
                      {a.proposed_price != null ? fmtMoney(a.proposed_price, a.currency) : '—'}
                    </strong>
                  </span>
                  {a.budget_max != null && (
                    <span className="small muted">
                      Бюджет заказа: до {fmtMoney(a.budget_max)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
