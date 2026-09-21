import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SvetlanaAvatar } from '../components/SvetlanaAvatar.jsx';

const FEATURES = [
  ['✨', 'Светлана', 'AI-оператор для задач, документов, поиска и навигации по рабочему пространству.'],
  ['👥', 'CRM', 'Клиенты, компании, лиды, сделки, проекты и задачи в одной системе.'],
  ['📄', 'Документы', 'Договоры, акты и другие рабочие документы с предпросмотром и подтверждением.'],
  ['📅', 'Календарь', 'Встречи, напоминания и сроки рядом с задачами и клиентами.'],
  ['🧾', 'НПД и финансы', 'Инструменты для расчётов и контроля финансовых операций.'],
  ['🛒', 'Маркетплейс', 'Проекты, услуги, отклики и взаимодействие с заказчиками.'],
  ['🎓', 'Обучение', 'Курсы, эксперты и материалы для развития компетенций.'],
  ['🎁', 'Гранты', 'Подборки возможностей поддержки и финансирования.'],
];

function PageIntro({ eyebrow, title, text, actions = [] }) {
  return (
    <section className="site-page-intro">
      <div className="site-container">
        {eyebrow && <span className="site-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
        {actions.length > 0 && <div className="site-actions">{actions.map(([label, to, kind = 'primary']) => <Link key={label} to={to} className={'site-btn site-btn-' + kind}>{label}</Link>)}</div>}
      </div>
    </section>
  );
}

function Home() {
  return (
    <>
      <section className="site-hero">
        <div className="site-container site-hero-grid">
          <div className="site-hero-copy">
            <span className="site-eyebrow">✦ Мир Самозанятых</span>
            <h1>Рабочее пространство, где Светлана рядом.</h1>
            <p>Клиенты, документы, CRM, календарь, обучение, финансы и возможности — в одном месте. Светлана помогает разобраться в задаче и пройти путь до проверяемого результата.</p>
            <div className="site-actions">
              <Link className="site-btn site-btn-primary site-btn-lg" to="/register">Начать бесплатно →</Link>
              <Link className="site-btn site-btn-soft site-btn-lg" to="/svetlana/capabilities">Посмотреть возможности</Link>
            </div>
            <div className="site-trust-row"><span>✓ Web + Android</span><span>✓ Единый аккаунт</span><span>✓ Проверяемые действия</span></div>
          </div>
          <div className="site-hero-stage site-hero-welcome">
            <div className="site-hero-media-fallback" aria-label="Светлана">
              <SvetlanaAvatar emotion="HAPPY" size={360} />
              <span>Светлана · AI-оператор «Мира Самозанятых»</span>
            </div>
            <video className="site-hero-video" autoPlay muted loop playsInline preload="metadata" poster={(import.meta.env.BASE_URL || '/') + 'svetlana-photo.jpg'} aria-label="Светлана приветствует посетителей" onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.closest('.site-hero-welcome')?.classList.add('is-fallback'); }}>
              <source src={(import.meta.env.BASE_URL || '/') + 'svetlana-welcome.mp4'} type="video/mp4" />
            </video>
            <div className="site-hero-video-shade" aria-hidden="true" />
            <div className="site-hero-welcome-card">
              <span className="site-live-dot">● Сейчас здесь</span>
              <strong>Здравствуйте.<br />Рада видеть вас в «Мире Самозанятых».</strong>
              <span>Светлана — ваш AI-оператор для рабочих задач.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-container">
          <div className="site-section-head"><span className="site-eyebrow">Возможности</span><h2>Рабочее пространство в одном месте</h2><p>Публичный сайт объясняет продукт, а после регистрации открывается реальное рабочее пространство.</p></div>
          <div className="site-feature-grid">{FEATURES.map(([icon, title, text]) => <article key={title} className="site-card site-feature-card"><div className="site-feature-icon">{icon}</div><h3>{title}</h3><p>{text}</p></article>)}</div>
          <div className="site-home-opportunities"><div><span className="site-eyebrow">География</span><h2>Работа, обучение и поддержка в вашем городе</h2><p>Выберите город — и сайт покажет локальные вакансии, обучение и меры поддержки. Отдельно подключается поиск вакансий из «Работы России».</p></div><Link className="site-btn site-btn-primary" to="/jobs">Выбрать город →</Link></div>
        </div>
      </section>

      <section className="site-section site-section-muted">
        <div className="site-container site-two-col">
          <div><span className="site-eyebrow">Как это работает</span><h2>От запроса до подтверждённого результата</h2><p>Светлана разбирает запрос, формирует план, вызывает доступные инструменты и показывает результат с понятным статусом.</p></div>
          <div className="site-steps">
            {[
              ['01', 'Опишите задачу', 'Например: «добавь клиента и поставь задачу на завтра».'],
              ['02', 'Подтвердите действие', 'Чувствительные операции требуют явного подтверждения.'],
              ['03', 'Проверьте результат', 'В интерфейсе отображается фактически выполненный результат.'],
            ].map(([n, t, d]) => <article className="site-step" key={n}><span>{n}</span><div><h3>{t}</h3><p>{d}</p></div></article>)}
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-container site-dashboard-preview">
          <div><span className="site-eyebrow">Личный кабинет</span><h2>Один вход — все рабочие инструменты</h2><p>После авторизации доступны CRM, документы, финансы, налоги, задачи, календарь, рынок и Светлана. Публичная часть не подменяет эти разделы демонстрационными данными.</p><Link to="/register" className="site-btn site-btn-primary">Создать рабочее пространство</Link></div>
          <div className="site-dashboard-mock"><div className="site-dashboard-bar"><span /><span /><span /></div><div className="site-dashboard-body"><div className="site-metric"><small>Клиенты</small><strong>CRM</strong><span>реальные данные аккаунта</span></div><div className="site-metric"><small>Задачи</small><strong>План</strong><span>сроки и напоминания</span></div><div className="site-metric"><small>Светлана</small><strong>AI</strong><span>инструменты и проверка</span></div></div></div>
        </div>
      </section>

      <section className="site-section site-section-cta">
        <div className="site-container site-cta-box"><div><span className="site-eyebrow">Начните без лишних экранов</span><h2>Откройте рабочее пространство</h2><p>Регистрация бесплатна. После входа сайт и приложение работают с одним backend и аккаунтом.</p></div><Link className="site-btn site-btn-primary site-btn-lg" to="/register">Создать аккаунт</Link></div>
      </section>
    </>
  );
}

function Calculator() {
  const [income, setIncome] = useState('');
  const [type, setType] = useState('individual');
  const result = useMemo(() => {
    const amount = Math.max(0, Number(String(income).replace(',', '.')) || 0);
    const rate = type === 'individual' ? 0.04 : 0.06;
    const deductionRate = type === 'individual' ? 0.01 : 0.02;
    const grossTax = amount * rate;
    const availableDeduction = Math.min(10000, amount * deductionRate);
    return { amount, rate: rate * 100, grossTax, deduction: availableDeduction, tax: Math.max(0, grossTax - availableDeduction) };
  }, [income, type]);

  return (
    <>
      <PageIntro eyebrow="Калькулятор" title="Ориентировочный расчёт НПД" text="Ставки для НПД: 4% с доходов от физлиц и 6% с доходов от ИП и организаций. Расчёт ниже учитывает стандартную механику вычета в пределах доступного лимита, но не заменяет расчёт в «Моём налоге»." />
      <section className="site-section"><div className="site-container site-two-col">
        <form className="site-card site-form" onSubmit={(event) => event.preventDefault()}>
          <label>Доход, ₽<input inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="Например, 100000" /></label>
          <label>Источник дохода<select value={type} onChange={(e) => setType(e.target.value)}><option value="individual">Физическое лицо</option><option value="legal">ИП или организация</option></select></label>
          <div className="site-notice">Для фактической суммы налога учитываются данные налогового периода и оставшийся вычет.</div>
        </form>
        <div className="site-card site-result"><span className="site-eyebrow">Результат</span><div className="site-result-grid"><div><small>Ставка</small><strong>{result.rate}%</strong></div><div><small>Начислено</small><strong>{result.grossTax.toLocaleString('ru-RU', {maximumFractionDigits: 2})} ₽</strong></div><div><small>Учтённый вычет</small><strong>{result.deduction.toLocaleString('ru-RU', {maximumFractionDigits: 2})} ₽</strong></div><div><small>Ориентировочно</small><strong>{result.tax.toLocaleString('ru-RU', {maximumFractionDigits: 2})} ₽</strong></div></div><a className="site-inline-link" href="https://www.nalog.gov.ru/" target="_blank" rel="noreferrer">Проверить правила на сайте ФНС →</a></div>
      </div></section>
    </>
  );
}



function AboutProjectPage() {
  const capabilities = [
    ['🧾', 'НПД и работа с правилами', 'Помогает разбираться с регистрацией, чеками, налоговыми вопросами и искать официальные источники перед принятием решения.'],
    ['👥', 'Клиенты и CRM', 'Помогает создавать карточки клиентов, вести лиды, сделки, проекты и задачи в одном рабочем контексте.'],
    ['📄', 'Документы', 'Помогает собрать данные для договора, акта и других документов, показывает предпросмотр и требует подтверждения там, где действие чувствительное.'],
    ['📅', 'Планирование', 'Связывает задачи, календарь и напоминания, чтобы рабочие сроки не жили в разных приложениях.'],
    ['💼', 'Работа и маркетплейс', 'Помогает искать заказы, услуги, вакансии и специалистов, а также готовить отклики и объявления.'],
    ['🎓', 'Обучение', 'Помогает найти курсы, экспертов и профессиональные центры с учётом города пользователя.'],
    ['🎁', 'Поддержка и гранты', 'Помогает искать федеральные и региональные меры поддержки; перед подачей заявки пользователь переходит к официальному источнику.'],
    ['📍', 'География', 'Город и регион становятся частью рабочего контекста: поиск работы, обучение, проекты и меры поддержки показываются с учётом территории.'],
    ['✅', 'Проверка результата', 'Для инструментальных действий в кабинете предусмотрен принцип: не считать действие выполненным только потому, что модель сформировала ответ.'],
  ];

  return (
    <>
      <PageIntro
        eyebrow="О проекте"
        title="Мы обучили Светлану работать вокруг реальных задач самозанятого"
        text="«Мир Самозанятых» создаётся как рабочая экосистема: знания, документы, CRM, рынок, обучение, поддержка и AI-оператор Светлана должны помогать человеку работать, а не добавлять ещё один отдельный сервис."
        actions={[
          ['Посмотреть возможности Светланы', '/svetlana/capabilities', 'primary'],
          ['Найти работу и обучение', '/jobs', 'soft'],
        ]}
      />
      <section className="site-section">
        <div className="site-container">
          <div className="site-section-head site-section-head-left">
            <span className="site-eyebrow">Чему обучена Светлана</span>
            <h2>От вопроса к рабочему действию</h2>
            <p>Светлана проектируется не как чат ради чата. Её задача — понимать рабочий контекст пользователя, предложить понятный следующий шаг и не выдавать неподтверждённый результат за выполненный.</p>
          </div>
          <div className="site-feature-grid site-feature-grid-3">
            {capabilities.map(([icon, title, text]) => (
              <article className="site-card site-feature-card site-capability-card" key={title}>
                <div className="site-feature-icon">{icon}</div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="site-section site-section-muted">
        <div className="site-container site-two-col">
          <div>
            <span className="site-eyebrow">Как устроен подход</span>
            <h2>Светлана помогает самозанятому увидеть весь путь целиком</h2>
            <p>От первого обращения клиента до документа, оплаты, задачи и следующего шага. При необходимости пользователь сам выполняет действие, а Светлана помогает подготовить данные и навигацию.</p>
          </div>
          <div className="site-stack">
            {[
              ['01', 'Контекст', 'Профиль, город, специализация и текущие задачи формируют рабочий контекст.'],
              ['02', 'План', 'Светлана раскладывает запрос на понятные шаги и показывает, какие инструменты доступны.'],
              ['03', 'Действие', 'Чувствительные операции требуют подтверждения пользователя.'],
              ['04', 'Проверка', 'После действия интерфейс должен показывать фактический статус, а не предположение модели.'],
            ].map(([n, t, d]) => (
              <article className="site-step" key={n}><span>{n}</span><div><h3>{t}</h3><p>{d}</p></div></article>
            ))}
          </div>
        </div>
      </section>
      <section className="site-section">
        <div className="site-container site-cta-box">
          <div><span className="site-eyebrow">Для самозанятых России</span><h2>Один сайт для работы, развития и поиска возможностей</h2><p>Выберите город, найдите работу или обучение, посмотрите поддержку и при необходимости переходите в рабочее пространство.</p></div>
          <Link to="/jobs" className="site-btn site-btn-primary site-btn-lg">Выбрать город →</Link>
        </div>
      </section>
    </>
  );
}

function ProjectsSelfEmployedPage() {
  const projects = [
    {
      tag: 'AI · здоровье · SMART-гимнастика',
      title: 'Я-Зарядка AI',
      text: 'Цифровой проект регулярной физической активности и цифровых сервисов вокруг здорового рабочего ритма.',
      href: 'https://я-зарядка.рф/',
      action: 'Открыть проект ↗',
    },
    {
      tag: 'В РАЗРАБОТКЕ',
      title: 'Bridge / «Два Сердца»',
      text: 'Кросс-культурный проект между Китаем и Россией с голосовым переводом и цифровыми сервисами взаимодействия.',
    },
    {
      tag: 'В РАЗРАБОТКЕ',
      title: 'AI English & Math Teacher',
      text: 'Образовательный проект с AI-инструментами, языковым обучением, математикой и цифровыми аватарами.',
    },
  ];

  return (
    <>
      <PageIntro
        eyebrow="IT-Laboratory · поддержка проектов"
        title="Проекты Самозанятых"
        text="Мы ищем талантливых самозанятых с собственными проектами и помогаем доводить идеи до внедрения, первых продаж и масштабирования."
      />
      <section className="site-section">
        <div className="site-container site-feature-grid">
          {projects.map((project) => (
            <article className="site-card project-card" key={project.title}>
              <span className="site-eyebrow">{project.tag}</span>
              <h2>{project.title}</h2>
              <p>{project.text}</p>
              {project.href ? (
                <a className="site-btn site-btn-primary" href={project.href} target="_blank" rel="noreferrer">{project.action}</a>
              ) : (
                <span className="site-btn site-btn-soft" aria-disabled="true">В разработке</span>
              )}
            </article>
          ))}
        </div>
      </section>
      <section className="site-section site-section-muted">
        <div className="site-container site-two-col">
          <article className="site-card"><div className="site-feature-icon">💡</div><h2>Кого мы ищем</h2><p>Самозанятых разработчиков, дизайнеров, AI-специалистов, маркетологов, авторов, преподавателей и экспертов, у которых уже есть собственный проект или сильная идея.</p></article>
          <article className="site-card"><div className="site-feature-icon">🚀</div><h2>Что можем сделать вместе</h2><p>Аудит и упаковка продукта, UX/UI, прототипирование, техническое внедрение, AI-инструменты, контент и продвижение, поиск партнёров и клиентов, презентации, гранты и выход проекта на рынок.</p></article>
        </div>
      </section>
      <section className="site-section">
        <div className="site-container">
          <div className="site-cta-box project-submit">
            <div>
              <span className="site-eyebrow">Приглашение для самозанятых</span>
              <h2>Предложите свой проект</h2>
              <p>Опишите идею, текущий результат и какую поддержку вы ищете: внедрение, продвижение, партнёры, инвестиции, грант или субсидию.</p>
            </div>
            <a className="site-btn site-btn-primary site-btn-lg" href="mailto:it-laboratory@bk.ru?subject=Проект самозанятого">Отправить проект →</a>
          </div>
        </div>
      </section>
    </>
  );
}

function InfoPage({ kind }) {
  const pages = {
    about: { eyebrow: 'О проекте', title: 'Мир Самозанятых — единое рабочее пространство', text: 'Платформа объединяет инструменты, которые обычно находятся в разных сервисах: CRM, документы, задачи, календарь, финансы, поиск возможностей, обучение и AI-оператор Светлана.', sections: [['Принцип продукта', 'Пользователь сначала видит задачу и результат, а интерфейс помогает пройти путь без лишней сложности.'], ['Светлана', 'В рабочем пространстве Светлана использует общий API, реестр инструментов и проверки результата. Для чувствительных операций предусмотрено подтверждение.'], ['Данные', 'Персональные данные и рабочие записи должны обрабатываться через backend продукта; публичный сайт не показывает чужие аккаунты или записи.']] },
    projects: { eyebrow: 'Проекты', title: 'Проекты и развитие экосистемы', text: 'Мир Самозанятых развивается как единый продукт для web и Android. Публичный сайт служит точкой входа и каталогом возможностей.', sections: [['Мобильное приложение', 'Android-клиент использует тот же backend и тот же доменный набор функций.'], ['AI-оператор', 'Светлана связывает запрос пользователя с доступными инструментами, а чувствительные действия требуют явного подтверждения.'], ['Инструменты для работы', 'CRM, документы, финансы, календарь, маркетплейс и обучение собраны вокруг единого рабочего пространства.']] },
    education: { eyebrow: 'Обучение', title: 'Обучение и эксперты', text: 'Раздел для курсов, консультаций и практических материалов. После входа прогресс и записи могут храниться в аккаунте.', sections: [['Курсы', 'Структурированные материалы с прогрессом обучения.'], ['Эксперты', 'Каталог экспертов и консультационных возможностей.'], ['Практика', 'Материалы ориентированы на реальные задачи самозанятого: клиенты, документы, финансы и продвижение.']] },
    marketplace: { eyebrow: 'Маркетплейс', title: 'Проекты и услуги', text: 'Публичная часть знакомит с возможностями площадки. Реальные объявления, заявки и отклики открываются внутри рабочего пространства.', sections: [['Для исполнителя', 'Поиск проектов и услуг с фильтрами и личными откликами.'], ['Для заказчика', 'Создание проекта и работа с поступившими откликами.'], ['Без подмены данных', 'На публичной странице не показываются вымышленные заказы и пользователи.']] },
    downloads: { eyebrow: 'Приложение', title: 'Мир Самозанятых на Android', text: 'Web и Android используют единый API. Сборки проходят через GitHub Actions; подписанная production-версия зависит от release signing.', sections: [['Репозиторий', 'Исходный код и процесс сборки доступны в GitHub.'], ['CI-артефакты', 'Сборка и тесты выполняются автоматизированно. CI-артефакт без release-подписи не является публикацией Google Play.'], ['Сайт', 'Web-версия развёртывается на GitHub Pages как публичная точка входа.']] },
    contacts: { eyebrow: 'Контакты', title: 'Связаться с проектом', text: 'Для общих вопросов, предложений и сообщений об ошибках используйте указанный канал связи.', sections: [['Поддержка', 'it-laboratory@bk.ru'], ['Репозиторий', 'GitHub: github.com/paulafanasyev/svetlana-self-employed'], ['Публичные страницы', 'Основная навигация и юридическая информация доступны из футера.']] },
    faq: { eyebrow: 'FAQ', title: 'Частые вопросы', text: 'Ответы на основные вопросы о сайте и рабочем пространстве.', sections: [['Нужен ли аккаунт?', 'Для просмотра публичного сайта — нет. Для персональных данных, CRM и действий Светланы — да.'], ['Это отдельный продукт от Android?', 'Нет. Web и Android рассчитаны на общий backend и один аккаунт.'], ['Что происходит при недоступности API?', 'Интерфейс не должен выдумывать результат: ошибка показывается как ошибка, а backend status не маскируется под успешное действие.']] },
    support: { eyebrow: 'Поддержка', title: 'Помощь по платформе', text: 'На публичном сайте можно прочитать о функциях, а технические и персональные вопросы решаются через поддержку.', sections: [['Не открывается кабинет', 'Проверьте доступность backend и повторите вход. Публичный сайт отдельно показывает состояние сервисов только там, где это действительно проверено.'], ['Проблемы с документами', 'Используйте рабочее пространство и сохраните текст ошибки перед обращением в поддержку.'], ['Сообщить об ошибке', 'Укажите страницу, шаги воспроизведения и время ошибки. Не отправляйте пароли и токены.']] },
    privacy: { eyebrow: 'Юридическая информация', title: 'Конфиденциальность', text: 'Страница содержит базовую навигационную информацию. Политика обработки данных определяется актуальной редакцией документа и настройками backend.', sections: [['Минимизация', 'Внешним AI должен передаваться только объём данных, необходимый для выполнения конкретного запроса.'], ['Контроль пользователя', 'Для рабочего пространства предусматриваются экспорт и удаление аккаунта.'], ['Безопасность', 'Секреты и credentials не должны храниться в клиентском коде или публичном репозитории.']] },
    terms: { eyebrow: 'Юридическая информация', title: 'Условия использования', text: 'Пользователь получает доступ к публичному сайту и, после регистрации, к рабочему пространству в соответствии с действующими условиями сервиса.', sections: [['Аккаунт', 'Пользователь отвечает за сохранность своих учетных данных.'], ['Контент', 'Пользователь не должен загружать данные, на обработку которых у него нет соответствующих прав.'], ['Сервисы', 'Отдельные функции могут зависеть от доступности backend, внешних провайдеров и конфигурации аккаунта.']] }, 
    dashboard: { eyebrow: 'Личный кабинет', title: 'Рабочее пространство самозанятого', text: 'Публичный обзор показывает структуру кабинета. Реальные показатели, клиенты и задачи доступны только владельцу аккаунта после входа.', sections: [['Обзор', 'Сводка по задачам, клиентам и рабочим действиям.'], ['Рабочие разделы', 'CRM, документы, финансы, календарь, рынок и обучение доступны из единого меню.'], ['Достоверность', 'Публичный сайт не подставляет вымышленные записи вместо данных пользователя.']] },
    profile: { eyebrow: 'Профиль', title: 'Профиль и настройки аккаунта', text: 'Персональные данные и настройки хранятся в рабочем пространстве и не публикуются на маркетинговых страницах.', sections: [['Профиль', 'Имя, контакты и рабочая информация пользователя.'], ['Безопасность', 'Управление доступом и настройками выполняется после авторизации.'], ['Данные', 'Для аккаунта предусмотрены экспорт и удаление в соответствии с реализованным API.']] },
    svetlana: { eyebrow: 'Светлана', title: 'AI-оператор внутри платформы', text: 'Светлана помогает разбирать задачи и использовать инструменты рабочего пространства. Публичный чат на сайте предназначен для ознакомления; персональные действия выполняются после входа.', sections: [['Публичный демо-режим', 'На маркетинговом сайте Светлана отвечает на базовые вопросы о продукте и НПД.'], ['Рабочий режим', 'В кабинете чат связан с реальным backend и журналом действий.'], ['Подтверждение', 'Чувствительные действия не должны выполняться без явного подтверждения пользователя.']] },
    achievements: { eyebrow: 'Достижения', title: 'Достижения и результаты', text: 'Раздел для публичных материалов о развитии проекта и для персональной системы достижений в рабочем пространстве.', sections: [['Публичные результаты', 'Здесь можно размещать подтверждённые новости, релизы и достижения проекта.'], ['Личные достижения', 'Персональные очки и достижения доступны только в авторизованном аккаунте.'], ['Без выдумок', 'На публичной странице не отображаются несуществующие рейтинги или результаты пользователей.']] },
  };
  const data = pages[kind];
  return (
    <>
      <PageIntro eyebrow={data.eyebrow} title={data.title} text={data.text} />
      <section className="site-section"><div className="site-container site-stack">{data.sections.map(([title, text]) => <article key={title} className="site-card"><h2>{title}</h2><p>{text}</p></article>)}</div></section>
    </>
  );
}

function Blog() {
  const posts = [
    ['НПД без лишней рутины', 'Как устроены ставки НПД и где проверять итоговый расчёт.', '/calculator'],
    ['Светлана внутри рабочего пространства', 'Зачем AI-оператору нужен реестр инструментов и подтверждение чувствительных действий.', '/svetlana'],
    ['Один аккаунт для web и Android', 'Как единый backend связывает сайт и мобильное приложение.', '/downloads'],
  ];
  return <><PageIntro eyebrow="Блог" title="Практические материалы" text="Публичные статьи проекта о работе самозанятого и возможностях платформы." /><section className="site-section"><div className="site-container site-feature-grid">{posts.map(([title, text, to]) => <article className="site-card" key={title}><span className="site-eyebrow">Материал</span><h2>{title}</h2><p>{text}</p><Link to={to} className="site-inline-link">Открыть →</Link></article>)}</div></section></>;
}

function ServicePage({ title, text, items, action = '/register' }) {
  return <><PageIntro eyebrow="Сервис" title={title} text={text} actions={[['Открыть рабочее пространство', action, 'primary'], ['Вернуться на главную', '/', 'soft']]} /><section className="site-section"><div className="site-container site-feature-grid">{items.map(([h, d, icon]) => <article className="site-card" key={h}><div className="site-feature-icon">{icon}</div><h2>{h}</h2><p>{d}</p></article>)}</div></section></>;
}

export default function PublicPages({ page = 'home' }) {
  if (page === 'home') return <Home />;
  if (page === 'calculator') return <Calculator />;
  if (page === 'about') return <AboutProjectPage />;
  if (page === 'projects') return <ProjectsSelfEmployedPage />;
  if (page === 'blog') return <Blog />;
  if (['education','marketplace','downloads','contacts','faq','support','privacy','terms','dashboard','profile','svetlana','achievements'].includes(page)) return <InfoPage kind={page} />;
  if (page === 'contracts') return <ServicePage title="Договоры и документы" text="Рабочий раздел для создания и согласования документов на основе данных сделки." items={[['Шаблоны', 'Создание документа из структурированных данных рабочего пространства.', '📄'], ['Предпросмотр', 'Проверка перед утверждением и отправкой.', '🔎'], ['Статусы', 'Понимание, что реально создано и что требует действия пользователя.', '✓']]} />;
  if (page === 'crm') return <ServicePage title="CRM для самозанятого" text="Клиенты, компании, лиды, сделки, проекты и задачи собраны в одном рабочем пространстве." items={[['Клиенты', 'Карточки клиентов и контакты.', '👥'], ['Сделки', 'Статусы и суммы без дублирования информации.', '🤝'], ['Задачи', 'Связанные действия и сроки.', '✅']]} />;
  if (page === 'finance') return <ServicePage title="Финансы" text="Рабочие инструменты для счетов, поступлений и финансовых операций." items={[['Счета', 'Создание и контроль инвойсов.', '💳'], ['Доходы', 'Аналитика на базе реальных записей аккаунта.', '📈'], ['Платежи', 'Статусы и провайдеры отображаются только из backend.', '✓']]} />;
  if (page === 'calendar') return <ServicePage title="Календарь" text="Встречи, задачи и напоминания в едином контексте." items={[['События', 'Создание и редактирование календарных событий.', '📅'], ['Напоминания', 'Контроль важных сроков.', '⏰'], ['Связи', 'Задачи и документы рядом с событием.', '🔗']]} />;
  if (page === 'grants') return <ServicePage title="Гранты и поддержка" text="Раздел с подборками возможностей поддержки и персонализированными результатами после входа." items={[['Каталог', 'Доступные возможности поддержки.', '🎁'], ['Персонализация', 'Подборка на основе профиля пользователя через backend.', '🎯'], ['Контроль статуса', 'Рабочие записи сохраняются в аккаунте.', '✓']]} />;
  return <Home />;
}
