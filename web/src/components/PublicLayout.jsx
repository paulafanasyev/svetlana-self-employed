import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { SvetlanaAvatar } from './SvetlanaAvatar.jsx';

const NAV = [
  ['/', 'Главная', true],
  ['/about', 'О проекте'],
  ['/calculator', 'Калькулятор'],
  ['/marketplace', 'Маркетплейс'],
  ['/jobs', 'Работа'],
  ['/education', 'Обучение'],
  ['/projects', 'Проекты Самозанятых'],
  ['/downloads', 'Приложение'],
  ['/svetlana/capabilities', 'Возможности Светланы'],
  ['/contacts', 'Контакты'],
];

const QUICK = ['Что такое НПД?', 'Что умеет Светлана?', 'Найти работу в моём городе', 'Найти обучение рядом'];

const ANSWERS = [
  { keys: ['нпд', 'налог', 'ставк'], text: 'По данным ФНС, для НПД применяются ставки 4% для доходов от физлиц и 6% для доходов от ИП и организаций. Налоговый вычет предоставляется в порядке, установленном законом. Для точного расчёта используйте раздел «Калькулятор» и проверяйте итог в «Моём налоге».' },
  { keys: ['зарегистр', 'начать', 'аккаунт'], text: 'Регистрация на платформе открывает личное рабочее пространство. Перейдите в «Регистрация», укажите email и пароль, после входа станут доступны CRM, документы, задачи, календарь и Светлана.' },
  { keys: ['светлана', 'ии', 'помощник'], text: 'Светлана — AI-оператор платформы. В рабочем пространстве она работает через единый backend, вызывает инструменты и показывает подтверждённый результат. Персональные действия доступны после входа.' },
  { keys: ['приложение', 'скачать', 'android'], text: 'Раздел «Приложение» содержит актуальную информацию о сборке Android и переходы к репозиторию и релизам. Публичная подписанная версия публикуется отдельно от CI-артефактов.' },
  { keys: ['маркетплейс', 'заказ', 'услуг'], text: 'Маркетплейс объединяет проекты, услуги и отклики. Реальные объявления доступны после входа; региональные возможности можно искать через раздел «Работа».' },
  { keys: ['работ', 'ваканс'], text: 'В разделе «Работа» можно выбрать свой город и увидеть вакансии «Мира Самозанятых» и вакансии из официальных открытых данных «Работы России».' },
  { keys: ['обучен', 'курс', 'центр'], text: 'Раздел «Работа» учитывает город: опубликованные курсы и учебные возможности привязываются к городу профиля учебного центра или эксперта.' },
  { keys: ['контак', 'поддерж', 'почт'], text: 'Для общих вопросов используйте страницу «Контакты» или адрес поддержки, указанный в футере сайта.' },
];

function answerFor(input) {
  const q = input.toLowerCase();
  const match = ANSWERS
    .map((item) => ({ item, score: item.keys.reduce((sum, key) => sum + (q.includes(key) ? key.length : 0), 0) }))
    .sort((a, b) => b.score - a.score)[0];
  if (match?.score) return match.item.text;
  return 'В демо-режиме я отвечаю на вопросы о НПД, регистрации, Светлане, приложении и возможностях платформы. Персональные действия выполняются после входа в рабочее пространство.';
}

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

function PublicChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([{ from: 'ai', text: 'Здравствуйте. Я Светлана. Это публичный демо-режим: могу рассказать о платформе и НПД.' }]);

  const send = (value) => {
    const text = value.trim();
    if (!text) return;
    setInput('');
    setMessages((prev) => [...prev, { from: 'user', text }, { from: 'ai', text: answerFor(text) }]);
  };

  return (
    <>
      {open && (
        <section className="site-chat" aria-label="Демо-чат со Светланой">
          <div className="site-chat-head">
            <SvetlanaAvatar emotion="HAPPY" size={42} />
            <div><strong>Светлана</strong><span>публичный демо-режим</span></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть чат">×</button>
          </div>
          <div className="site-chat-body">
            {messages.map((message, index) => (
              <div key={index} className={'site-chat-msg ' + (message.from === 'user' ? 'me' : 'ai')}>{message.text}</div>
            ))}
          </div>
          <div className="site-chat-quick">
            {QUICK.map((q) => <button key={q} type="button" onClick={() => send(q)}>{q}</button>)}
          </div>
          <form className="site-chat-compose" onSubmit={(event) => { event.preventDefault(); send(input); }}>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Спросите Светлану…" aria-label="Сообщение Светлане" />
            <button type="submit">→</button>
          </form>
        </section>
      )}
      <button className="site-chat-fab" type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? 'Закрыть Светлану' : 'Открыть Светлану'}>
        <SvetlanaAvatar emotion={open ? 'THINKING' : 'HAPPY'} size={58} />
      </button>
    </>
  );
}

export default function PublicLayout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const cta = useMemo(() => user ? '/app' : '/register', [user]);

  return (
    <div className="site-shell">
      <header className="site-nav">
        <div className="site-container site-nav-inner">
          <Link className="site-brand" to="/" aria-label="Мир Самозанятых">
            <span className="site-brand-mark"><img src={(import.meta.env.BASE_URL || '/') + 'logo-mir-samozanyatykh.svg'} alt="" /></span>
            <span><strong>Мир</strong> Самозанятых<small>рабочее пространство</small></span>
          </Link>

          <button className="site-mobile-button" type="button" onClick={() => setMobileOpen((value) => !value)} aria-label={mobileOpen ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={mobileOpen}>
            {mobileOpen ? '×' : '☰'}
          </button>

          <nav className={'site-links' + (mobileOpen ? ' is-open' : '')} aria-label="Основная навигация">
            {NAV.map(([to, label, end]) => (
              <NavLink key={to} to={to} end={Boolean(end)} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>
            ))}
            <NavLink to="/jobs">Работа</NavLink>
            <NavLink to="/app">Кабинет</NavLink>
            {user ? (
              <button className="site-btn site-btn-soft" type="button" onClick={() => navigate('/app')}>Мой кабинет</button>
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

      <main className="site-main">{children}</main>

      <footer className="site-footer">
        <div className="site-container site-footer-grid">
          <div>
            <Link className="site-footer-brand" to="/">Мир Самозанятых</Link>
            <p>Платформа для самозанятых, ИП и компаний: Светлана, CRM, документы, календарь, маркетплейс и обучение.</p>
          </div>
          <div><h4>Навигация</h4><Link to="/about">О проекте</Link><Link to="/projects">Проекты</Link><Link to="/education">Обучение</Link><Link to="/blog">Блог</Link></div>
          <div><h4>Сервисы</h4><Link to="/calculator">Калькулятор</Link><Link to="/marketplace">Маркетплейс</Link><Link to="/grants">Гранты</Link><Link to="/svetlana">Светлана</Link></div>
          <div><h4>Поддержка</h4><Link to="/contacts">Контакты</Link><Link to="/support">Поддержка</Link><Link to="/faq">FAQ</Link><Link to="/privacy">Конфиденциальность</Link></div>
        </div>
        <div className="site-container site-footer-bottom">
          <span>© {new Date().getFullYear()} Мир Самозанятых</span>
          <span>Единый web + Android продукт</span>
        </div>
      </footer>

      <PublicChat />
    </div>
  );
}
