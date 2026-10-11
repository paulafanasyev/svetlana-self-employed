import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { SvetlanaAvatar } from './SvetlanaAvatar.jsx';
import SvetlanaWelcome from './SvetlanaWelcome.jsx';
import { getVisitorName, openSvetlanaWelcome } from './welcomeText.js';
import { svetlanaVoice } from '../lib/svetlanaVoice.js';
import { answerFor } from './svetlanaAnswers.js';
import CookieConsent, { CookieSettingsButton } from './CookieConsent.jsx';
import './PublicLayout.css';

const NAV = [
  ['/', 'Главная', true],
  ['/jobs', 'Работа'],
  ['/calculator', 'Налог НПД'],
  ['/education', 'Обучение'],
  ['/svetlana', 'Светлана'],
  ['/organization', 'О центре'],
  ['/contacts', 'Контакты'],
];

const QUICK = ['Как стать самозанятым?', 'Сколько платить налога?', 'Найти работу в моём городе', 'Что умеет CRM?'];

function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('mir-theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  });

  useEffect(() => {
    document.body.classList.toggle('dark', theme === 'dark');
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('mir-theme', theme); } catch {}
  }, [theme]);

  return (
    <button
      className="site-theme-toggle"
      type="button"
      aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
      aria-pressed={theme === 'dark'}
      onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? '☀️' : '🌙'} <span>{theme === 'dark' ? 'Светлая' : 'Тёмная'}</span>
    </button>
  );
}

function hello(name) {
  return `Здравствуйте${name ? ', ' + name : ''}! Я Светлана. Спросите меня о работе, налоге НПД, чеках или о возможностях платформы.`;
}

function PublicChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState(() => [{ from: 'ai', text: hello(getVisitorName()) }]);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onName = (e) => setMessages((list) => (list.length === 1 ? [{ from: 'ai', text: hello(e.detail) }] : list));
    window.addEventListener('sv:open-chat', onOpen);
    window.addEventListener('sv:name', onName);
    return () => { window.removeEventListener('sv:open-chat', onOpen); window.removeEventListener('sv:name', onName); };
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);
  useEffect(() => { bodyRef.current?.scrollTo?.({ top: bodyRef.current.scrollHeight }); }, [messages, busy]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function send(value) {
    const text = String(value || '').trim();
    if (!text || busy) return;
    setInput('');
    const history = messages.slice(-10).map((m) => ({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text.slice(0, 4000) }));
    setMessages((prev) => [...prev, { from: 'user', text }]);
    setBusy(true);
    let answer = '';
    try {
      const name = getVisitorName();
      const result = await api.post('/public/chat', { message: (name ? `[Меня зовут ${name}] ` : '') + text.slice(0, 3900), history });
      answer = String(result?.content || '').trim();
    } catch { /* сервер недоступен — отвечаем проверенной справкой */ }
    if (!answer) answer = answerFor(text);
    setMessages((prev) => [...prev, { from: 'ai', text: answer }]);
    setBusy(false);
    svetlanaVoice.speak(answer);
  }

  return (
    <>
      {open && (
        <section className="site-chat" role="dialog" aria-label="Чат со Светланой">
          <div className="site-chat-head">
            <SvetlanaAvatar emotion={busy ? 'THINKING' : 'HAPPY'} size={42} />
            <div><strong>Светлана</strong><span>помощница «Мира Самозанятых»</span></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть чат">×</button>
          </div>
          <div className="site-chat-body" ref={bodyRef} role="log" aria-live="polite">
            {messages.map((message, index) => (
              <div key={index} className={'site-chat-msg ' + (message.from === 'user' ? 'me' : 'ai')}>{message.text}</div>
            ))}
            {busy && <div className="site-chat-msg ai" aria-label="Светлана печатает">Светлана печатает…</div>}
          </div>
          <div className="site-chat-quick">
            {QUICK.map((q) => <button key={q} type="button" onClick={() => send(q)} disabled={busy}>{q}</button>)}
          </div>
          <form className="site-chat-compose" onSubmit={(event) => { event.preventDefault(); send(input); }}>
            <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Спросите Светлану…" aria-label="Сообщение Светлане" maxLength={3900} />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Отправить">→</button>
          </form>
        </section>
      )}
      <button className="site-chat-fab" type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? 'Закрыть чат со Светланой' : 'Открыть чат со Светланой'} aria-expanded={open}>
        <SvetlanaAvatar emotion={open ? 'THINKING' : 'HAPPY'} size={58} voiceControls={false} />
      </button>
    </>
  );
}

export default function PublicLayout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => { window.scrollTo?.(0, 0); }, [location.pathname]);

  const cta = useMemo(() => user ? '/app' : '/register', [user]);

  return (
    <div className="site-shell">
      <a className="site-skip" href="#main">Перейти к содержанию</a>
      <header className="site-nav">
        <div className="site-container site-nav-inner">
          <Link className="site-brand" to="/" aria-label="Мир Самозанятых — на главную">
            <span className="site-brand-mark"><img src={(import.meta.env.BASE_URL || '/') + 'logo-mir-samozanyatykh.svg'} alt="" /></span>
            <span><strong>Мир</strong> Самозанятых<small>центр поддержки самозанятых</small></span>
          </Link>

          <button className="site-mobile-button" type="button" onClick={() => setMobileOpen((value) => !value)} aria-label={mobileOpen ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={mobileOpen} aria-controls="site-links">
            {mobileOpen ? '×' : '☰'}
          </button>

          <nav id="site-links" className={'site-links' + (mobileOpen ? ' is-open' : '')} aria-label="Основная навигация">
            {NAV.map(([to, label, end]) => (
              <NavLink key={to} to={to} end={Boolean(end)} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>
            ))}
            {user ? (
              <button className="site-btn site-btn-primary" type="button" onClick={() => navigate('/app')}>Мой кабинет</button>
            ) : (
              <>
                <NavLink to="/login">Войти</NavLink>
                <NavLink to={cta} className="site-btn site-btn-primary">Регистрация</NavLink>
              </>
            )}
          </nav>

          <ThemeToggle />
        </div>
      </header>

      <main className="site-main" id="main" tabIndex={-1}>{children}</main>

      <footer className="site-footer">
        <div className="site-container site-footer-grid">
          <div>
            <Link className="site-footer-brand" to="/">Мир Самозанятых</Link>
            <p>Помогаем самозанятым находить заказы, вести клиентов, разбираться с налогом НПД и развиваться. Светлана подскажет на каждом шаге.</p>
            <button type="button" className="site-btn site-btn-soft" onClick={openSvetlanaWelcome}>Познакомиться со Светланой</button>
          </div>
          <div><h4>Работа</h4><Link to="/jobs">Работа и вакансии</Link><Link to="/marketplace">Маркетплейс</Link><Link to="/projects">Проекты самозанятых</Link><Link to="/education">Обучение</Link><Link to="/grants">Гранты и поддержка</Link></div>
          <div><h4>Инструменты</h4><Link to="/calculator">Калькулятор НПД</Link><Link to="/crm">CRM Светланы</Link><Link to="/contracts">Договоры</Link><Link to="/svetlana">Светлана</Link><Link to="/downloads">Приложение</Link><Link to="/blog">Блог</Link></div>
          <div><h4>АНО ЦПС «Мир Самозанятых»</h4><Link to="/organization">О центре и реквизиты</Link><Link to="/cooperation">Сотрудничество</Link><Link to="/support">Поддержка</Link><Link to="/faq">Вопросы и ответы</Link><Link to="/privacy">Конфиденциальность</Link><Link to="/terms">Соглашение</Link><Link to="/cookies">Cookie</Link><a href="tel:+79199991336">+7 (919) 999-13-36</a><a href="mailto:mir.samozanyatyh@yandex.ru">mir.samozanyatyh@yandex.ru</a><CookieSettingsButton /></div>
        </div>
        <div className="site-container site-footer-bottom">
          <span>© {new Date().getFullYear()} АНО «Центр поддержки самозанятых «Мир Самозанятых» · ИНН 9724016805 · ОГРН 1207700247864</span>
          <span>Сайт и приложение для Android</span>
        </div>
      </footer>

      <PublicChat />
      <SvetlanaWelcome knownName={profile?.display_name ? String(profile.display_name).split(' ')[0] : ''} />
      <CookieConsent />
    </div>
  );
}
