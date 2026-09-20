/**
 * Обзор рабочего пространства: реальные сводные показатели из API.
 */
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useResource, fmtMoney, fmtDate, plural, EmptyState } from '../ui.jsx';
import { crm, tasks, finance, government, marketplace } from '../api.js';
import { SvetlanaAvatar } from '../components/SvetlanaAvatar.jsx';

export default function Dashboard() {
  const { profile } = useAuth();

  const clients = useResource(() => crm.clients(), []);
  const overdue = useResource(() => tasks.overdue(), []);
  const revenue = useResource(() => finance.revenue(0, Math.floor(Date.now() / 1000)), []);
  const grants = useResource(() => government.grantsPersonalized(), []);
  const applied = useResource(() => marketplace.myApplications(), []);

  const loading = clients.loading || overdue.loading || revenue.loading;
  const clientCount = clients.data?.total ?? 0;
  const overdueCount = overdue.data?.total ?? overdue.data?.length ?? 0;
  const totalRevenue = revenue.data?.total ?? revenue.data?.sum ?? 0;

  const stats = [
    { icon: '👥', label: 'Клиентов', value: clientCount, to: '/app/clients', loading: clients.loading },
    { icon: '⏰', label: 'Просрочено задач', value: overdueCount, to: '/app/tasks', loading: overdue.loading,
      tone: overdueCount > 0 ? 'warn' : 'ok' },
    { icon: '💰', label: 'Доход задано', value: fmtMoney(totalRevenue), to: '/app/finance', loading: revenue.loading },
    { icon: '🎁', label: 'Грантов подобрано', value: grants.data?.length ?? grants.data?.total ?? 0,
      to: '/app/grants', loading: grants.loading },
  ];

  if (loading) return <p className="muted">Собираю ваше пространство…</p>;

  return (
    <div className="stack">
      <div className="card">
        <div className="row between">
          <div className="row">
            <SvetlanaAvatar emotion="HAPPY" size={56} />
            <div>
              <h2 style={{ margin: 0 }}>Привет, {profile?.display_name || 'коллега'} 👋</h2>
              <p className="muted small" style={{ margin: 0 }}>
                {profile?.profession || 'Самозанятый'}{profile?.city ? ` · ${profile.city}` : ''}
              </p>
            </div>
          </div>
          <Link to="/app/svetlana" className="btn btn-primary">
            ✨ Поговорить со Светланой
          </Link>
        </div>
      </div>

      <div className="grid grid-3">
        {stats.map((s) => (
          <Link to={s.to} key={s.label} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="ico" aria-hidden="true" style={{ fontSize: '1.6rem' }}>{s.icon}</div>
            <h3 style={{ margin: '6px 0 0' }}>
              {s.loading ? '…' : typeof s.value === 'number' ? s.value.toLocaleString('ru-RU') : s.value}
            </h3>
            <p className="muted small" style={{ margin: 0 }}>{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="row between">
            <h3>Просроченные задачи</h3>
            <Link to="/app/tasks" className="btn btn-sm">Все</Link>
          </div>
          {overdue.loading ? <p className="muted">…</p> : null}
          {!overdue.loading && overdueCount === 0 && (
            <EmptyState icon="🎉" title="Просроченных нет" hint="Хорошая дисциплина" />
          )}
          {!overdue.loading && (overdue.data?.data ?? []).slice(0, 5).map((t) => (
            <div key={t.id} className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
              <span>{t.title}</span>
              <span className="badge err">просрочено</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="row between">
            <h3>Гранты и поддержка</h3>
            <Link to="/app/grants" className="btn btn-sm">Все</Link>
          </div>
          {grants.loading ? <p className="muted">…</p> : null}
          {!grants.loading && (grants.data?.data ?? grants.data ?? []).length === 0 && (
            <EmptyState icon="🎁" title="Подборка пуста" hint="Заполните профиль — и подборка станет точнее" />
          )}
          {!grants.loading && (grants.data?.data ?? grants.data ?? []).slice(0, 5).map((g) => (
            <div key={g.id} className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
              <span>{g.title}</span>
              <span className="badge info">{g.amount ? fmtMoney(g.amount) : 'программа'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <h3>Мои отклики</h3>
          <Link to="/app/applications" className="btn btn-sm">Все</Link>
        </div>
        {applied.loading ? <p className="muted">…</p> : null}
        {!applied.loading && (applied.data?.data ?? applied.data ?? []).length === 0 && (
          <EmptyState icon="📨" title="Откликов пока нет"
            hint="Найдите заказ на маркетплейсе или вакансию" action={
              <Link to="/app/marketplace" className="btn btn-sm">Открыть маркетплейс</Link>
            } />
        )}
        {!applied.loading && (applied.data?.data ?? applied.data ?? []).slice(0, 5).map((a) => (
          <div key={a.id} className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
            <span>{a.project_title ?? a.cover_letter?.slice(0, 40) ?? 'Отклик'}</span>
            <span className="badge">{a.status ?? 'sent'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
