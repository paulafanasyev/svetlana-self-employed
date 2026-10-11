/**
 * Router for the public marketing site and the authenticated workspace.
 * Workspace pages are lazy-loaded so the public site stays light.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Routes, Route, Navigate, NavLink, useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { probeHealth } from './api.js';
import { SvetlanaAvatar } from './components/SvetlanaAvatar.jsx';
import PublicLayout from './components/PublicLayout.jsx';
import PublicPages from './pages/PublicPages.jsx';
import HomePage from './pages/HomePage.jsx';
import NpdCalculator from './pages/NpdCalculator.jsx';
import SvetlanaCapabilities from './pages/SvetlanaCapabilities.jsx';
import RegionalHub from './pages/RegionalHub.jsx';
import { OrganizationPage, CooperationPage } from './pages/OrganizationPages.jsx';
import { PrivacyPolicyPage, UserAgreementPage, CookiePolicyPage } from './pages/LegalPages.jsx';

import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const SvetlanaPage = lazy(() => import('./pages/Svetlana.jsx'));
const CrmCabinet = lazy(() => import('./pages/CrmCabinet.jsx'));
const Clients = lazy(() => import('./pages/Clients.jsx'));
const Companies = lazy(() => import('./pages/Companies.jsx'));
const Leads = lazy(() => import('./pages/Leads.jsx'));
const Deals = lazy(() => import('./pages/Deals.jsx'));
const Projects = lazy(() => import('./pages/Projects.jsx'));
const Tasks = lazy(() => import('./pages/Tasks.jsx'));
const CalendarPage = lazy(() => import('./pages/Calendar.jsx'));
const Documents = lazy(() => import('./pages/Documents.jsx'));
const Contracts = lazy(() => import('./pages/Contracts.jsx'));
const Finance = lazy(() => import('./pages/Finance.jsx'));
const Taxes = lazy(() => import('./pages/Taxes.jsx'));
const Grants = lazy(() => import('./pages/Grants.jsx'));
const Marketplace = lazy(() => import('./pages/Marketplace.jsx'));
const Vacancies = lazy(() => import('./pages/Vacancies.jsx'));
const MyApplications = lazy(() => import('./pages/MyApplications.jsx'));
const Services = lazy(() => import('./pages/Services.jsx'));
const Portfolio = lazy(() => import('./pages/Portfolio.jsx'));
const Courses = lazy(() => import('./pages/Courses.jsx'));
const Experts = lazy(() => import('./pages/Experts.jsx'));
const Competitors = lazy(() => import('./pages/Competitors.jsx'));
const Analytics = lazy(() => import('./pages/Analytics.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));

const NAV = [
  { group: 'Главное', items: [
    { to: '/app', icon: '🏠', label: 'Сегодня', end: true },
    { to: '/app/crm', icon: '💼', label: 'CRM Светланы' },
    { to: '/app/svetlana', icon: '✨', label: 'Светлана' },
  ]},
  { group: 'Клиенты и дела', items: [
    { to: '/app/clients', icon: '👥', label: 'Клиенты' },
    { to: '/app/companies', icon: '🏢', label: 'Компании' },
    { to: '/app/leads', icon: '🎯', label: 'Заявки' },
    { to: '/app/deals', icon: '🤝', label: 'Сделки' },
    { to: '/app/projects', icon: '📁', label: 'Проекты' },
    { to: '/app/tasks', icon: '✅', label: 'Задачи' },
    { to: '/app/calendar', icon: '📅', label: 'Календарь' },
  ]},
  { group: 'Документы и деньги', items: [
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
    { to: '/app/services', icon: '🧰', label: 'Мои услуги' },
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
    { to: '/app/admin', icon: '🛡️', label: 'Администрирование', admin: true },
  ]},
];

function BackendBadge() {
  const [state, setState] = useState({ checking: true, ok: false, reason: '' });
  useEffect(() => {
    let alive = true;
    probeHealth().then((r) => { if (alive) setState({ checking: false, ok: r.ok, reason: r.reason ?? '' }); });
    return () => { alive = false; };
  }, []);
  if (state.checking) return <span className="badge">⏳ подключение…</span>;
  if (state.ok) return <span className="badge ok" title="Сервер отвечает">● На связи</span>;
  return <span className="badge err" title={state.reason}>● Нет связи с сервером</span>;
}

function PageLoading() {
  return <p className="muted" role="status" aria-live="polite">Загружаю раздел…</p>;
}

function WorkspaceLayout({ children }) {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  useEffect(() => { setOpen(false); }, [location.pathname]);

  const nav = useMemo(() => NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.admin || isAdmin) })), [isAdmin]);

  const title = useMemo(() => {
    for (const group of nav) {
      const hit = group.items.find((i) => i.end ? location.pathname === i.to : location.pathname.startsWith(i.to));
      if (hit) return hit.label;
    }
    return 'Личный кабинет';
  }, [location.pathname, nav]);

  useEffect(() => { document.title = `${title} — Мир Самозанятых`; }, [title]);

  return (
    <div className="app">
      <aside className={'sidebar ' + (open ? 'open' : '')} aria-label="Главное меню">
        <Link to="/app" className="brand"><SvetlanaAvatar emotion="IDLE" size={34} voiceControls={false} /><span>Мир Самозанятых<small>личный кабинет</small></span></Link>
        <nav className="nav">{nav.map((g) => <div key={g.group}><div className="nav-group">{g.group}</div>{g.items.map((i) => <NavLink key={i.to} to={i.to} end={i.end}><span className="emoji" aria-hidden="true">{i.icon}</span> {i.label}</NavLink>)}</div>)}</nav>
        <div className="sidebar-foot"><div className="row between"><span>{user?.email}</span><button className="btn btn-sm" onClick={() => { logout(); navigate('/login'); }}>Выйти</button></div></div>
      </aside>
      <div className="main">
        <header className="topbar"><button className="hamburger" onClick={() => setOpen((v) => !v)} aria-label="Меню" aria-expanded={open}>☰</button><h1>{title}</h1><span className="spacer" /><BackendBadge /><NavLink to="/app/svetlana" className="btn btn-primary btn-sm">✨ Светлана</NavLink></header>
        <main className="content"><Suspense fallback={<PageLoading />}>{children}</Suspense></main>
      </div>
    </div>
  );
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/app" replace /> : children;
}

function PublicRoute({ page }) {
  return <PublicLayout><PublicPages page={page} /></PublicLayout>;
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="content"><p className="muted">Проверка входа…</p></div>;
  return user ? <WorkspaceLayout>{children}</WorkspaceLayout> : <Navigate to="/login" replace />;
}

function NotFound() {
  useEffect(() => { document.title = 'Страница не найдена — Мир Самозанятых'; }, []);
  return (
    <section className="site-section">
      <div className="site-container" style={{ textAlign: 'center', padding: '48px 0' }}>
        <h1>Такой страницы нет</h1>
        <p className="muted">Возможно, ссылка устарела. Начните с главной или спросите Светлану.</p>
        <p><Link className="site-btn site-btn-primary" to="/">На главную</Link></p>
      </div>
    </section>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicLayout><HomePage /></PublicLayout>} />
      <Route path="/about" element={<PublicRoute page="about" />} />
      <Route path="/organization" element={<PublicLayout><OrganizationPage /></PublicLayout>} />
      <Route path="/cooperation" element={<PublicLayout><CooperationPage /></PublicLayout>} />
      <Route path="/privacy" element={<PublicLayout><PrivacyPolicyPage /></PublicLayout>} />
      <Route path="/terms" element={<PublicLayout><UserAgreementPage /></PublicLayout>} />
      <Route path="/cookies" element={<PublicLayout><CookiePolicyPage /></PublicLayout>} />
      <Route path="/calculator" element={<PublicLayout><NpdCalculator /></PublicLayout>} />
      <Route path="/marketplace" element={<PublicRoute page="marketplace" />} />
      <Route path="/jobs" element={<PublicLayout><RegionalHub /></PublicLayout>} />
      <Route path="/education" element={<PublicRoute page="education" />} />
      <Route path="/projects" element={<PublicRoute page="projects" />} />
      <Route path="/downloads" element={<PublicRoute page="downloads" />} />
      <Route path="/blog" element={<PublicRoute page="blog" />} />
      <Route path="/contacts" element={<PublicRoute page="contacts" />} />
      <Route path="/faq" element={<PublicRoute page="faq" />} />
      <Route path="/support" element={<PublicRoute page="support" />} />
      <Route path="/contracts" element={<PublicRoute page="contracts" />} />
      <Route path="/crm" element={<PublicRoute page="crm" />} />
      <Route path="/finance" element={<PublicRoute page="finance" />} />
      <Route path="/calendar" element={<PublicRoute page="calendar" />} />
      <Route path="/grants" element={<PublicRoute page="grants" />} />
      <Route path="/dashboard" element={<PublicRoute page="dashboard" />} />
      <Route path="/profile" element={<PublicRoute page="profile" />} />
      <Route path="/svetlana" element={<PublicRoute page="svetlana" />} />
      <Route path="/svetlana/capabilities" element={<PublicLayout><SvetlanaCapabilities /></PublicLayout>} />
      <Route path="/achievements" element={<PublicRoute page="achievements" />} />

      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />

      <Route path="/app" element={<Protected><Dashboard /></Protected>} />
      <Route path="/app/crm" element={<Protected><CrmCabinet /></Protected>} />
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

      <Route path="*" element={<PublicLayout><NotFound /></PublicLayout>} />
    </Routes>
  );
}
