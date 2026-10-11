/**
 * Главная «Мира Самозанятых»: сначала польза для самозанятого, потом детали.
 * Факты о НПД сверены с ФНС (nalog.gov.ru/rn77/npd) — 422-ФЗ.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { SvetlanaAvatar } from '../components/SvetlanaAvatar.jsx';
import { openSvetlanaChat, openSvetlanaWelcome, getVisitorName } from '../components/welcomeText.js';
import './HomePage.css';

const SCENARIOS = [
  { icon: '🔎', title: 'Найти заказы и работу', text: 'Вакансии и проекты в вашем городе, включая официальные данные «Работы России».', to: '/jobs', cta: 'Смотреть работу' },
  { icon: '👥', title: 'Вести клиентов', text: 'CRM Светланы: клиенты, сделки, напоминания и история общения в одном месте.', to: '/register', cta: 'Открыть CRM', auth: '/app/crm' },
  { icon: '🧮', title: 'Посчитать налог', text: 'Сколько заплатить с дохода от физлиц (4%) и компаний (6%), с учётом вычета и лимита.', to: '/calculator', cta: 'Посчитать НПД' },
  { icon: '📄', title: 'Договор и документы', text: 'Договор, акт и счёт по шаблону: заполните поля — получите готовый файл.', to: '/contracts', cta: 'Подготовить договор' },
  { icon: '🎓', title: 'Учиться и расти', text: 'Курсы и программы по городам, эксперты и учебные центры.', to: '/education', cta: 'Найти обучение' },
  { icon: '🤝', title: 'Получить поддержку', text: 'Меры поддержки и гранты для самозанятых, связь с центром поддержки «Мир Самозанятых».', to: '/support', cta: 'Узнать о поддержке' },
];

const STEPS = [
  ['Зарегистрируйтесь бесплатно', 'Почта и пароль — и у вас личный кабинет. Карта не нужна.'],
  ['Расскажите Светлане, чем занимаетесь', 'Она подскажет, где искать клиентов, и поможет настроить кабинет под вашу работу.'],
  ['Работайте в одном окне', 'Клиенты, сделки, договоры, напоминания и налог — без таблиц и блокнотов.'],
];

const FACTS = [
  ['4%', 'с доходов от физлиц'],
  ['6%', 'с доходов от ИП и организаций'],
  ['10 000 ₽', 'налоговый вычет: ставки снижаются до 3% и 4%, пока он не израсходован'],
  ['2,4 млн ₽', 'лимит дохода за календарный год'],
  ['до 28 числа', 'следующего месяца — срок уплаты налога'],
  ['чек', 'формируется в «Мой налог» на каждую оплату'],
];

const FAQ = [
  ['Это бесплатно?', 'Да. Регистрация, CRM, задачи и калькулятор НПД бесплатны. Платных подписок для этих функций нет.'],
  ['Кто стоит за платформой?', 'АНО «Центр поддержки самозанятых «Мир Самозанятых» — некоммерческая организация из Москвы. Реквизиты указаны ниже и на странице «О центре».'],
  ['Светлана заменяет налоговую?', 'Нет. Светлана помогает разобраться и ничего не отправляет в ФНС за вас. Налог и чеки — в официальном приложении «Мой налог».'],
  ['Где хранятся мои клиенты?', 'Данные CRM хранятся на вашем устройстве. Вы можете сделать резервную копию одним файлом или перенести клиентов в свой аккаунт.'],
];

function CrmPreview() {
  return (
    <div className="mh-crm" aria-hidden="true">
      <div className="mh-crm-tabs"><b>Контакты 12</b><span>Сделки 4</span><span>Задачи 3</span><span>Сводка</span></div>
      <div className="mh-crm-cols">
        <div><i>Новая</i><p>Маникюр · 2 500 ₽</p><p>Фотосессия · 8 000 ₽</p></div>
        <div><i>Переговоры</i><p>Сайт для ИП · 45 000 ₽</p></div>
        <div className="won"><i>Выиграна</i><p>Репетитор · 6 000 ₽<small>✓ чек</small></p></div>
      </div>
      <div className="mh-crm-say"><span>Светлана:</span> «Напомнить завтра выставить счёт Анне?»</div>
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const [name, setName] = useState(getVisitorName);

  useEffect(() => {
    const onName = (e) => setName(e.detail || '');
    window.addEventListener('sv:name', onName);
    document.title = 'Мир Самозанятых — заказы, клиенты, налог НПД и Светлана в одном месте';
    return () => window.removeEventListener('sv:name', onName);
  }, []);

  const start = user ? '/app' : '/register';

  return (
    <div className="mh">
      <section className="mh-hero">
        <div className="mh-container mh-hero-grid">
          <div className="mh-hero-text">
            <span className="mh-eyebrow">Для самозанятых · бесплатно</span>
            <h1>Работайте на себя спокойно — от первого клиента до оплаты</h1>
            <p className="mh-lead">«Мир Самозанятых» помогает найти заказ, договориться с клиентом, подготовить документы и не забыть про налог. Светлана подскажет следующий шаг и покажет, что сделано.</p>
            <div className="mh-actions">
              <Link className="mh-btn mh-btn-primary" to={start}>{user ? 'Перейти в кабинет' : 'Начать бесплатно'}</Link>
              <Link className="mh-btn" to="/calculator">Посчитать налог</Link>
            </div>
            <ul className="mh-trust-chips">
              <li>✓ Некоммерческий центр поддержки</li>
              <li>✓ Без выдуманных цифр</li>
              <li>✓ Факты НПД — по данным ФНС</li>
            </ul>
          </div>

          <aside className="mh-sv-card" aria-label="Светлана">
            <SvetlanaAvatar live fullHead size={210} emotion="IDLE" />
            <div>
              <strong className="mh-sv-name">{name ? `${name}, я Светлана` : 'Я Светлана'}</strong>
              <p>Ваша помощница по работе и НПД. Отвечаю голосом и текстом, веду вашу CRM по команде.</p>
              <div className="mh-actions mh-actions-tight">
                <button type="button" className="mh-btn mh-btn-primary" onClick={openSvetlanaChat}>Спросить Светлану</button>
                <button type="button" className="mh-btn mh-btn-soft" onClick={openSvetlanaWelcome}>{name ? 'Поздороваться' : 'Познакомиться'}</button>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="mh-section" aria-labelledby="mh-tasks">
        <div className="mh-container">
          <h2 id="mh-tasks">С чего начнём?</h2>
          <div className="mh-grid3">
            {SCENARIOS.map((s) => (
              <Link key={s.title} className="mh-card mh-scenario" to={user && s.auth ? s.auth : s.to}>
                <span className="mh-ico" aria-hidden="true">{s.icon}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <span className="mh-more">{s.cta} →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mh-section mh-alt" aria-labelledby="mh-crm-title">
        <div className="mh-container mh-split">
          <div>
            <span className="mh-eyebrow">CRM Светланы в личном кабинете</span>
            <h2 id="mh-crm-title">Клиенты, сделки и напоминания — без таблиц</h2>
            <ul className="mh-checks">
              <li>Карточка клиента: телефоны в одно касание, история звонков и встреч</li>
              <li>Воронка сделок: от первой заявки до оплаты</li>
              <li>Отметка «чек сформирован» и оценка налога 4% / 6% по каждой оплате</li>
              <li>Контроль лимита НПД 2,4 млн ₽ в год</li>
              <li>Команды голосом: «добавь клиента Анна», «напомни завтра выставить счёт»</li>
              <li>Работает на телефоне, данные — на вашем устройстве, копия одним файлом</li>
            </ul>
            <Link className="mh-btn mh-btn-primary" to={user ? '/app/crm' : '/register'}>{user ? 'Открыть CRM' : 'Попробовать CRM бесплатно'}</Link>
          </div>
          <CrmPreview />
        </div>
      </section>

      <section className="mh-section" aria-labelledby="mh-how">
        <div className="mh-container">
          <h2 id="mh-how">Как это работает</h2>
          <ol className="mh-steps">
            {STEPS.map(([t, d], i) => <li key={t} className="mh-card"><span className="mh-step-n">{i + 1}</span><h3>{t}</h3><p>{d}</p></li>)}
          </ol>
        </div>
      </section>

      <section className="mh-section mh-alt" aria-labelledby="mh-npd">
        <div className="mh-container">
          <h2 id="mh-npd">НПД коротко: главное, что нужно знать</h2>
          <div className="mh-facts">
            {FACTS.map(([v, t]) => <div key={v} className="mh-fact"><strong>{v}</strong><span>{t}</span></div>)}
          </div>
          <p className="mh-note">Источник: <a href="https://www.nalog.gov.ru/rn77/npd/" target="_blank" rel="noopener noreferrer">ФНС России, раздел «Налог на профессиональный доход»</a>. Регистрация, чеки и уплата налога — в приложении <a href="https://lknpd.nalog.ru/" target="_blank" rel="noopener noreferrer">«Мой налог»</a>.</p>
          <div className="mh-actions"><Link className="mh-btn" to="/calculator">Посчитать свой налог</Link><Link className="mh-btn mh-btn-ghost" to="/faq">Частые вопросы о НПД</Link></div>
        </div>
      </section>

      <section className="mh-section" aria-labelledby="mh-who">
        <div className="mh-container">
          <div className="mh-card mh-org">
            <div>
              <span className="mh-eyebrow">Кто отвечает за платформу</span>
              <h2 id="mh-who">АНО «Центр поддержки самозанятых «Мир Самозанятых»</h2>
              <p>Некоммерческая организация, которая помогает самозанятым работать легально, находить заказы и развиваться.</p>
              <Link className="mh-more" to="/organization">Реквизиты и документы →</Link>
            </div>
            <dl className="mh-req">
              <div><dt>ИНН</dt><dd>9724016805</dd></div>
              <div><dt>ОГРН</dt><dd>1207700247864</dd></div>
              <div><dt>Адрес</dt><dd>Москва, Варшавское шоссе, 76 к2, Коворкинг Центр НКО ЮАО</dd></div>
              <div><dt>Телефон</dt><dd><a href="tel:+79199991336">+7 (919) 999-13-36</a></dd></div>
              <div><dt>Почта</dt><dd><a href="mailto:mir.samozanyatyh@yandex.ru">mir.samozanyatyh@yandex.ru</a></dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="mh-section mh-alt" aria-labelledby="mh-faq">
        <div className="mh-container mh-narrow">
          <h2 id="mh-faq">Вопросы</h2>
          {FAQ.map(([q, a]) => <details key={q} className="mh-faq"><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </section>

      <section className="mh-section">
        <div className="mh-container">
          <div className="mh-final">
            <h2>{name ? `${name}, начнём?` : 'Начнём?'}</h2>
            <p>Кабинет создаётся за минуту. Светлана поможет на каждом шаге.</p>
            <div className="mh-actions mh-center">
              <Link className="mh-btn mh-btn-light" to={start}>{user ? 'Перейти в кабинет' : 'Создать кабинет бесплатно'}</Link>
              <button type="button" className="mh-btn mh-btn-outline-light" onClick={openSvetlanaChat}>Сначала спросить Светлану</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
