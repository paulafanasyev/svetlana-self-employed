/**
 * App shell: router + workspace layout.
 *
 * Public marketing site (§35) lives at /, /*. The authenticated workspace
 * (§34) lives under /app/* — after registration the user lands in the real
 * workspace, not a marketing page.
 */
import { useEffect, useMemo, useState } from 'react';
import { Routes, Route, Navigate, NavLink, useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { isBackendAvailable, probeHealth } from './api.js';
import { SvetlanaAvatar } from './components/SvetlanaAvatar.jsx';

import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';

import Dashboard from './pages/Dashboard.jsx';
import SvetlanaPage from './pages/Svetlana.jsx';
import Clients from './pages/Clients.jsx';
import Companies from './pages/Companies.jsx';
import Leads from './pages/Leads.jsx';
import Deals from './pages/Deals.jsx';
import Projects from './pages/Projects.jsx';
import Tasks from './pages/Tasks.jsx';
import CalendarPage from './pages/Calendar.jsx';
import Documents from './pages/Documents.jsx';
import Contracts from './pages/Contracts.jsx';
import Finance from './pages/Finance.jsx';
import Taxes from './pages/Taxes.jsx';
import Grants from './pages/Grants.jsx';
import Marketplace from './pages/Marketplace.jsx';
import Vacancies from './pages/Vacancies.jsx';
import MyApplications from './pages/MyApplications.jsx';
import Services from './pages/Services.jsx';
import Portfolio from './pages/Portfolio.jsx';
import Courses from './pages/Courses.jsx';
import Experts from './pages/Experts.jsx';
import Competitors from './pages/Competitors.jsx';
import Analytics from './pages/Analytics.jsx';
import Profile from './pages/Profile.jsx';
import Settings from './pages/Settings.jsx';
import Admin from './pages/Admin.jsx';

/** §34 navigation — the full workspace structure. */
const NAV = [
  { group: 'Светлана', items: [
    { to: '/app', icon: '🏠', label: 'Обзор', end: true },
    { to: '/app/svetlana', icon: '✨', label: 'Светлана' },
  ]},
  { group: 'CRM', items: [
    { to: '/app/clients', icon: '👥', label: 'Клиенты' },
    { to: '/app/companies', icon: '🏢', label: 'Компании' },
    { to: '/app/leads', icon: '🎯', label: 'Лиды' },
    { to: '/app/deals', icon: '🤝', label: 'Сделки' },
    { to: '/app/projects', icon: '📁', label: 'Проекты' },
    { to: '/app/tasks', icon: '✅', label: 'Задачи' },
    { to: '/app/calendar', icon: '📅', label: 'Календарь' },
  ]},
  { group: 'Документы и финансы', items: [
    { to: '/app/documents', icon: '📄', label: 'Документы' },
    { to: '/app/contracts', icon: '📜', label: 'Договоры' },
    { to: '/app/finance', icon: '💰', label: 'Финансы' },
    { to: '/app/taxes', icon: '🧾', label: 'Налоги' },
    { to: '/app/grants', icon: '🎁', label: 'Гранты' },
  ]},
  { group: 'Работа', items: [
    { to: '/app/marketplace', icon: '🛒', label: 'Маркетплейс' },
    { to: '/app/vacancies', icon: '💼', label: 'Вакансии' },
    { to: '/app/applications', icon: '📨', label: 'Мои отклики' },
    { to: '/app/services', icon: '🧰', label: 'Услуги' },
    { to: '/app/portfolio', icon: '🖼️', label: 'Портфолио' },
  ]},
  { group: 'Обучение и рынок', items: [
    { to: '/app/courses', icon: '🎓', label: 'Курсы' },
    { to: '/app/experts', icon: '🧑‍🏫', label: 'Эксперты' },
    { to: '/app/competitors', icon: '🔍', label: 'Конкуренты' },
    { to: '/app/analytics', icon: '📊', label: 'Аналитика' },
  ]},
  { group: 'Аккаунт', items: [
    { to: '/app/profile', icon: '👤', label: 'Профиль' },
    { to: '/app/settings', icon: '⚙️', label: 'Настройки' },
    { to: '/app/admin', icon: '🛡️', label: 'Админка' },
  ]},
];

function BackendBadge() {
  const [state, setState] = useState({ checking: true, ok: false, reason: '' });
  useEffect(() => {
    let alive = true;
    probeHealth().then((r) => { if (alive) setState({ checking: false, ok: r.ok, reason: r.reason ?? '' }); });
    return () => { alive = false; };
  }, []);
  if (state.checking) return <span className="badge">⏳ проверка API…</span>;
  if (state.ok) return <span className="badge ok" title="Backend отвечает">● API онлайн</span>;
  return (
    <span className="badge err" title={state.reason}>● API недоступен</span>
  );
}

function WorkspaceLayout({ children }) {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { setOpen(false); }, [location.pathname]);

  const title = useMemo(() => {
    for (const group of NAV) {
      const hit = group.items.find((i) =>
        i.end ? location.pathname === i.to : location.pathname.startsWith(i.to));
      if (hit) return hit.label;
    }
    return 'Рабочее пространство';
  }, [location.pathname]);

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Главное меню">
        <Link to="/app" className="brand">
          <SvetlanaAvatar emotion="IDLE" size={34} />
          <span>Мир Самозанятых<small>Светлана — AI-оператор</small></span>
        </Link>
        <nav className="nav">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="nav-group">{g.group}</div>
              {g.items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className={() => undefined}>
                  <span className="emoji" aria-hidden="true">{i.icon}</span> {i.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="row between">
            <span>{user?.email}</span>
            <button className="btn btn-sm" onClick={() => { logout(); navigate('/login'); }}>Выйти</button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setOpen((v) => !v)} aria-label="Меню">☰</button>
          <h1>{title}</h1>
          <span className="spacer" />
          <BackendBadge />
          <NavLink to="/app/svetlana" className="btn btn-primary btn-sm">✨ Светлана</NavLink>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

/** Redirect to the workspace when already authenticated. */
function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/app" replace /> : children;
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="content"><p className="muted">Проверка входа…</p></div>;
  return user ? <WorkspaceLayout>{children}</WorkspaceLayout> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />

      <Route path="/app" element={<Protected><Dashboard /></Protected>} />
      <Route path="/app/svetlana" element={<Protected><SvetlanaPage /></Protected>} />
      <Route path="/app/clients" element={<Protected><Clients /></Protected>} />
      <Route path="/app/companies" element={<Protected><Companies /></Protected>} />
      <Route path="/app/leads" element={<Protected><Leads /></Protected>} />
      <Route path="/app/deals" element={<Protected><Deals /></Protected>} />
      <Route path="/app/projects" element={<Protected><Projects /></Protected>} />
      <Route path="/app/tasks" element={<Protected><Tasks /></Protected>} />
      <Route path="/app/calendar" element={<Protected><CalendarPage /></Protected>} />
      <Route path="/app/documents" element={<Protected><Documents /></Protected>} />
      <Route path="/app/contracts" element={<Protected><Contracts /></Protected>} />
      <Route path="/app/finance" element={<Protected><Finance /></Protected>} />
      <Route path="/app/taxes" element={<Protected><Taxes /></Protected>} />
      <Route path="/app/grants" element={<Protected><Grants /></Protected>} />
      <Route path="/app/marketplace" element={<Protected><Marketplace /></Protected>} />
      <Route path="/app/vacancies" element={<Protected><Vacancies /></Protected>} />
      <Route path="/app/applications" element={<Protected><MyApplications /></Protected>} />
      <Route path="/app/services" element={<Protected><Services /></Protected>} />
      <Route path="/app/portfolio" element={<Protected><Portfolio /></Protected>} />
      <Route path="/app/courses" element={<Protected><Courses /></Protected>} />
      <Route path="/app/experts" element={<Protected><Experts /></Protected>} />
      <Route path="/app/competitors" element={<Protected><Competitors /></Protected>} />
      <Route path="/app/analytics" element={<Protected><Analytics /></Protected>} />
      <Route path="/app/profile" element={<Protected><Profile /></Protected>} />
      <Route path="/app/settings" element={<Protected><Settings /></Protected>} />
      <Route path="/app/admin" element={<Protected><Admin /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
