/**
 * Админка (§38) — статистика, пользователи, аудит, состояние системы.
 * Маршруты требуют роль admin: для остальных — честная заглушка
 * «Недостаточно прав». Секции загружаются независимо: упавший раздел
 * не ломает страницу, а 403 показывается понятным текстом.
 */
import { useState } from 'react';
import { admin } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  useResource, Badge, EmptyState, ErrorState, fmtDate, confirmAction,
} from '../ui.jsx';

const STAT_LABELS = {
  users: 'Пользователи', experts: 'Эксперты', training_centers: 'Учебные центры',
  courses: 'Курсы', orders: 'Заказы', payments: 'Платежи',
  commissions: 'Комиссии', revenue: 'Выручка', disputes: 'Споры',
  moderation: 'Модерация', count: 'Количество', n: 'Кол-во',
  documents: 'Документы', knowledge_documents: 'База знаний',
  ai_actions: 'Действия ИИ', enrollments: 'Записи на курсы',
  candidates: 'Кандидаты', vacancies: 'Вакансии', reviews: 'Отзывы',
};

/** Разворачивает ответ stats в плоский список {key, value, isArray}. */
function flattenStats(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flattenStats(v, key));
    else out.push({ key, value: Array.isArray(v) ? v.length : v, isArray: Array.isArray(v) });
  }
  return out;
}

function SiteAnalyticsPanel() {
  const [days, setDays] = useState(30);
  const resource = useResource(() => admin.siteAnalytics(days), [days]);
  const report = resource.data;
  const daily = report?.by_day ?? [];
  const paths = report?.by_path ?? [];
  const maxDaily = Math.max(1, ...daily.map((row) => Number(row.page_views) || 0));
  const maxPath = Math.max(1, ...paths.slice(0, 10).map((row) => Number(row.page_views) || 0));

  const downloadCsv = () => {
    const rows = report?.by_day && report?.by_path
      ? [
          ['Отчёт', 'Мир Самозанятых'],
          ['Период, дней', days],
          ['Часовой пояс', report.timezone || 'Europe/Moscow'],
          [],
          ['Дата', 'Просмотры', 'Уникальные сессии'],
          ...daily.map((row) => [row.day, row.page_views, row.unique_sessions]),
          [],
          ['Страница', 'Просмотры', 'Уникальные сессии'],
          ...paths.map((row) => [row.path, row.page_views, row.unique_sessions]),
        ]
      : [];
    if (!rows.length) return;
    const csv = rows.map((row) => row.map((value) => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mir-samozanyatykh-site-report-' + days + 'd.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card">
      <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: '0 0 4px' }}>Закрытый отчёт об использовании сайта</h3>
          <p className="muted small" style={{ margin: 0 }}>Доступен только администратору. Аналитика включается только после согласия на аналитические cookie.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <select className="field" style={{ margin: 0, width: 130 }} value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={7}>7 дней</option>
            <option value={30}>30 дней</option>
            <option value={90}>90 дней</option>
            <option value={180}>180 дней</option>
          </select>
          <button className="btn" type="button" onClick={downloadCsv} disabled={!report}>Скачать CSV</button>
        </div>
      </div>

      {resource.loading && <p className="muted">Загружаю отчёт…</p>}
      {resource.error && <ErrorState error={resource.error} onRetry={resource.reload} />}
      {!resource.loading && !resource.error && report && (
        <>
          <div className="grid grid-4" style={{ marginTop: 14 }}>
            <div className="card"><h3>{Number(report.summary?.page_views ?? 0).toLocaleString('ru-RU')}</h3><p className="muted small">просмотров</p></div>
            <div className="card"><h3>{Number(report.summary?.unique_sessions ?? 0).toLocaleString('ru-RU')}</h3><p className="muted small">уникальных сессий</p></div>
            <div className="card"><h3>{Number(report.summary?.unique_paths ?? 0).toLocaleString('ru-RU')}</h3><p className="muted small">страниц</p></div>
            <div className="card"><h3>{Number(report.summary?.referrer_origins ?? 0).toLocaleString('ru-RU')}</h3><p className="muted small">источников</p></div>
          </div>

          <div className="analytics-mini-grid">
            <div>
              <h4>По дням</h4>
              {daily.length === 0 ? <p className="muted small">Пока нет данных.</p> : daily.slice(0, 14).map((row) => (
                <div className="analytics-mini-row" key={row.day}>
                  <span>{row.day}</span>
                  <div><i style={{ width: ((Number(row.page_views) / maxDaily) * 100) + '%' }} /></div>
                  <strong>{row.page_views}</strong>
                </div>
              ))}
            </div>
            <div>
              <h4>Популярные страницы</h4>
              {paths.length === 0 ? <p className="muted small">Пока нет данных.</p> : paths.slice(0, 10).map((row) => (
                <div className="analytics-mini-row" key={row.path}>
                  <span title={row.path}>{row.path}</span>
                  <div><i style={{ width: ((Number(row.page_views) / maxPath) * 100) + '%' }} /></div>
                  <strong>{row.page_views}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="site-analytics-privacy">
            <strong>Контур хранения</strong>
            <span>IP: нет · User-Agent: нет · account ID: нет · query string: нет · исходный analytics cookie: не хранится · публичный отчёт: нет · хранение событий: до 180 дней.</span>
          </div>
        </>
      )}
    </div>
  );
}

function isForbidden(err) {
  return err?.status === 403 || err?.code === 'forbidden';
}

/** Секция с честными состояниями: загрузка / 403 / ошибка / данные. */
function Section({ title, resource, children }) {
  let body;
  if (resource.loading) {
    body = <p className="muted">Загружаю…</p>;
  } else if (resource.error) {
    body = isForbidden(resource.error) ? (
      <div className="alert warn" role="alert">Недостаточно прав для этого раздела</div>
    ) : (
      <ErrorState error={resource.error} onRetry={resource.reload} />
    );
  } else {
    body = children;
  }
  return (
    <div className="card">
      <h3 style={{ margin: '0 0 12px' }}>{title}</h3>
      {body}
    </div>
  );
}

export default function Admin() {
  const { user, loading } = useAuth();
  // No /admin/stats endpoint exists — platform counts come from /admin/system
  // (which is admin-gated and returns { counts, migrations, ai_providers, … }).
  const stats = useResource(() => admin.system(), []);
  const users = useResource(() => admin.users('?limit=100'), []);
  const audit = useResource(() => admin.audit('?limit=50'), []);
  const health = useResource(() => admin.system(), []);
  const [actionError, setActionError] = useState(null);

  const toggleStatus = async (u) => {
    setActionError(null);
    const next = u.status === 'active' ? 'suspended' : 'active';
    if (next === 'suspended' && !confirmAction(`Заблокировать пользователя ${u.email}?`)) return;
    try {
      await admin.updateUser(u.id, { status: next });
      users.setData((d) => ({
        ...d,
        data: (d?.data ?? []).map((r) => (r.id === u.id ? { ...r, status: next } : r)),
      }));
    } catch (err) {
      setActionError(err);
    }
  };

  if (loading) return <p className="muted">Проверяю права доступа…</p>;

  if (user?.role !== 'admin') {
    return (
      <div className="alert warn" role="alert">
        <strong>Недостаточно прав.</strong> Раздел доступен только
        администраторам. Текущая роль: <strong>{user?.role ?? 'гость'}</strong>.
      </div>
    );
  }

  // /admin/system returns { counts, migrations, ai_providers, payment_provider,
  // commission_percent, smtp_configured } — render the counts as stat cards.
  const statCards = stats.data?.counts
    ? Object.entries(stats.data.counts).map(([key, value]) => ({ key, value }))
    : [];

  const healthEntries = health.data
    ? Object.entries({
        payment_provider: health.data.payment_provider,
        commission_percent: `${health.data.commission_percent}%`,
        smtp_configured: health.data.smtp_configured ? 'настроен' : 'не настроен',
        ai_providers: (health.data.ai_providers ?? []).map((p) => `${p.name}/${p.model}`).join(', ') || '—',
        migrations_pending: (health.data.migrations?.pending ?? []).length,
      })
    : [];

  return (
    <div className="stack">
      {actionError && (
        <div className="alert err" role="alert">
          Действие не выполнено: {actionError.message ?? String(actionError)}
        </div>
      )}

      <Section title="Статистика платформы" resource={stats}>
        {statCards.length === 0 ? (
          <EmptyState icon="📊" title="Нет данных" hint="Эндпоинт статистики не вернул показателей" />
        ) : (
          <div className="grid grid-3">
            {statCards.map((s) => (
              <div className="card" key={s.key}>
                <h3 style={{ margin: '0 0 4px' }}>{Number(s.value).toLocaleString('ru-RU')}</h3>
                <p className="muted small" style={{ margin: 0 }}>
                  {STAT_LABELS[s.key.split('.').pop()] ?? s.key}
                  {s.isArray ? ' (записей)' : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <SiteAnalyticsPanel />

      <Section title="Пользователи" resource={users}>
        {(users.data?.data ?? []).length === 0 ? (
          <EmptyState icon="👥" title="Пользователей нет" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr><th>Email</th><th>Роль</th><th>Статус</th><th>Создан</th><th></th></tr>
              </thead>
              <tbody>
                {(users.data?.data ?? []).map((u) => {
                  const isMe = u.id === user.id;
                  return (
                    <tr key={u.id}>
                      <td className="small"><strong>{u.email}</strong>{isMe ? ' (вы)' : ''}</td>
                      <td className="small">{u.role}</td>
                      <td><Badge status={u.status === 'active' ? 'ok' : 'err'}>{u.status}</Badge></td>
                      <td className="small muted">{fmtDate(u.created_at)}</td>
                      <td>
                        <button
                          className="btn btn-sm"
                          disabled={isMe}
                          title={isMe ? 'Нельзя заблокировать себя' : ''}
                          onClick={() => toggleStatus(u)}>
                          {u.status === 'active' ? 'Заблокировать' : 'Активировать'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Журнал аудита" resource={audit}>
        {(audit.data?.data ?? []).length === 0 ? (
          <EmptyState icon="🧾" title="Журнал пуст" hint="Здесь появятся действия пользователей" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr><th>Кто</th><th>Действие</th><th>Объект</th><th>Дата</th></tr>
              </thead>
              <tbody>
                {(audit.data?.data ?? []).map((row) => (
                  <tr key={row.id}>
                    <td className="small">{row.actor_email ?? row.actor_id ?? '—'}</td>
                    <td className="small"><Badge>{row.action}</Badge></td>
                    <td className="small muted">
                      {row.entity}{row.entity_id ? ` · ${row.entity_id.slice(0, 8)}` : ''}
                    </td>
                    <td className="small muted">{fmtDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Состояние системы" resource={health}>
        {healthEntries.length === 0 ? (
          <EmptyState icon="🩺" title="Нет данных о состоянии" hint="Эндпоинт не вернул показателей" />
        ) : (
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {healthEntries.map(([key, value]) => (
              <span key={key} className="row" style={{ gap: 6, alignItems: 'center' }}>
                {typeof value === 'boolean' ? (
                  <Badge status={value ? 'ok' : 'err'}>{value ? 'ok' : 'bad'}</Badge>
                ) : (
                  <Badge status="info">{String(value)}</Badge>
                )}
                <span className="small muted">{key}</span>
              </span>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
