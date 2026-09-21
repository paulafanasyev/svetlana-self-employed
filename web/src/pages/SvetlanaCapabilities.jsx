import { Link } from 'react-router-dom';
import { SvetlanaAvatar } from '../components/SvetlanaAvatar.jsx';

const FAMILIES = [
  ['01','Базовый интеллект','Русский диалог, инструкции, переписывание, суммаризация, извлечение, классификация, планирование, декомпозиция, арифметика и структурированные ответы.'],
  ['02','Личная продуктивность','Задачи, напоминания, повторяющаяся работа, приоритеты, календарь, встречи, письма, сообщения, заметки, файлы и организация знаний.'],
  ['03','Жизненный цикл самозанятого','НПД, регистрация, чеки, услуги, упаковка, цены, загрузка, дедлайны, onboarding клиента, повторные услуги, оплаты и удержание.'],
  ['04','Продажи и поиск клиентов','ICP, сегментация, квалификация, поиск потенциальных клиентов, outreach, follow-up, возражения, переговоры, закрытие и аналитика воронки.'],
  ['05','Коммерческие предложения','Одностраничные и подробные КП, пакеты и тарифы, scope, deliverables, критерии приёмки, ROI, персонализация из CRM и версии документов.'],
  ['06','Договоры и юридические документы','Договоры оказания услуг, подряд, разработка, дизайн, маркетинг, консультации, NDA, лицензии, оферты, ТЗ, акты, счета, претензии и дополнительные соглашения.'],
  ['07','Работа и карьера','Поиск вакансий и проектов, фильтры, matching с профилем, анализ пробелов, резюме, ATS-варианты, сопроводительные письма, портфолио и подготовка отклика.'],
  ['08','Маркетинг','Позиционирование, USP, оффер, бренд-голос, лендинги, SEO, соцсети, рассылки, реклама, воронки, эксперименты и KPI.'],
  ['09','Рынок и конкуренты','Поиск конкурентов, сравнение продуктов и цен, публичные сигналы и отзывы, тренды, SWOT, точки дифференциации и исследовательские отчёты с источниками.'],
  ['10','Финансы и бухгалтерская поддержка','Доходы, расходы, платежи, прибыль, маржинальность, cash flow, бюджет, дебиторка, unit economics, break-even, прогнозы и анализ таблиц/CSV.'],
  ['11','CRM и бизнес-память','Клиенты, лиды, сделки, услуги, задачи, платежи, документы, события, заметки и взаимодействия; поиск, связи, история, next actions и аудит.'],
  ['12','Документы и данные','DOCX, PDF, XLSX, CSV, HTML, Markdown, JSON, таблицы, формулы, графики, очистка данных, извлечение, шаблоны, версии и проверка согласованности.'],
  ['13','Исследования и глобальный поиск','Декомпозиция вопроса, мультиисточниковый поиск, приоритет официальных источников, проверка свежести, сопоставление противоречий, доказательная выдача и ограничения.'],
  ['14','Управление телефоном и компьютером','Понимание экрана, элементы UI, приложения, браузер, файлы, tap/type/scroll/copy-paste, upload/download, почта, календарь и многошаговые workflows через Hands.'],
  ['15','Tool Calling и агентные workflows','Выбор инструмента, аргументы, порядок зависимостей, состояние, идемпотентность, обработка ошибок, повтор, policy-gate, подтверждение и post-action verification.'],
  ['16','Приватность и безопасность','Классификация данных, минимизация, редактирование/токенизация, защита секретов, безопасная маршрутизация провайдеров, аудит внешних вызовов и запрет утечки CRM в веса.'],
  ['17','Надёжность и безопасность действий','Неопределённость, противоречия, prompt injection, недоверенный внешний контент, проверка высокорисковых результатов, provenance, защита необратимых действий и безопасное восстановление.'],
  ['18','Бизнес-стратегия','Бизнес-модель, product-market fit, ценообразование, unit economics, диверсификация доходов, процессы, автоматизация, KPI/OKR, риски и сценарии роста.'],
  ['19','Техническая и AI-компетентность','Выбор моделей и провайдеров, prompts/policies, RAG, embeddings, chunking, agent orchestration, tool registries, local inference, quantization, APIs, webhooks, CI и debugging.'],
  ['20','Vision / Audio / Multimodal','Скриншоты, изображения, документы, OCR-assisted workflows, аудио и транскрипты, визуальное grounding и проверка состояния интерфейса после действий.'],
  ['21','Архитектура знаний','Веса модели — поведение и устойчивые навыки; RAG — текущие законы, официальные разъяснения, рынок и другие обновляемые сведения; CRM/память — только авторизованные пользовательские данные.'],
  ['22','Обучение и оценка','Успешные и неуспешные трассы, recovery, confirmation, verification, privacy cases, held-out evaluation, regression-наборы и проверка реального tool/device runtime.'],
];

const PIPELINE = [
  ['UNDERSTAND','Понять запрос и контекст'],
  ['PLAN','Разбить задачу на шаги'],
  ['OBSERVE','Получить экран, документ или доступный контекст'],
  ['GROUND','Связать намерение с реальными объектами'],
  ['POLICY','Проверить права, риск и необходимость подтверждения'],
  ['ACT','Вызвать разрешённый инструмент'],
  ['VERIFY','Проверить фактический результат'],
  ['REFLECT','Разобрать ошибку и при необходимости перепланировать'],
  ['COMPLETE','Сообщить проверенный результат или эскалировать'],
];

const LAYERS = [
  ['Веса модели','Поведение, reasoning, tool-calling паттерны, стиль и устойчивые рабочие навыки.'],
  ['RAG / внешние знания','Актуальные законы, официальные разъяснения, рынок, вакансии, конкуренты и другие обновляемые сведения.'],
  ['CRM / память','Персональные клиенты, документы, платежи, задачи и история только через авторизованные инструменты.'],
];

export default function SvetlanaCapabilities() {
  return (
    <div className="sv-cap-page">
      <section className="sv-cap-hero">
        <div className="site-container sv-cap-hero-grid">
          <div>
            <span className="site-eyebrow">Svetlana 2.0 · карта возможностей</span>
            <h1>Что мы учим Светлану понимать, планировать и выполнять</h1>
            <p>Целевой контур агента: 22 семейства навыков от НПД и CRM до исследований, документов, маркетинга, Hands, privacy и verification. Статус каждого навыка определяется отдельно и не выводится из одного только текста модели.</p>
            <div className="site-actions">
              <Link className="site-btn site-btn-primary site-btn-lg" to="/register">Открыть рабочее пространство →</Link>
              <Link className="site-btn site-btn-soft site-btn-lg" to="/svetlana">О Светлане</Link>
            </div>
          </div>
          <div className="sv-cap-avatar"><SvetlanaAvatar emotion="HAPPY" size={240} /><strong>Светлана</strong><span>AI-оператор самозанятого, фрилансера и малого бизнеса</span></div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-container">
          <div className="site-section-head"><span className="site-eyebrow">22 направления</span><h2>Полная карта навыков агента</h2><p>Состав основан на Capability Map и Master Training Scope Svetlana 2.0. Детские сценарии, «Я‑Зарядка» и несвязанные проекты сюда не включены.</p></div>
          <div className="sv-cap-grid">
            {FAMILIES.map(([num,title,text]) => <article className="sv-cap-card" id={'cap-' + num} key={num}><div className="sv-cap-num">{num}</div><h3>{title}</h3><p>{text}</p></article>)}
          </div>
        </div>
      </section>

      <section className="site-section site-section-muted">
        <div className="site-container">
          <div className="site-section-head"><span className="site-eyebrow">Агентный цикл</span><h2>От запроса до проверенного действия</h2><p>Текстовый ответ модели сам по себе не является доказательством того, что инструмент или устройство реально выполнили действие.</p></div>
          <div className="sv-pipeline">
            {PIPELINE.map(([name,detail],i)=><article className="sv-pipeline-step" key={name}><span>{String(i+1).padStart(2,'0')}</span><div><strong>{name}</strong><p>{detail}</p></div>{i < PIPELINE.length-1 && <b>→</b>}</article>)}
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-container sv-cap-columns">
          <div className="site-card">
            <span className="site-eyebrow">Архитектура знаний</span><h2>Что учим в модели, а что держим снаружи</h2>
            <div className="sv-data-layers">{LAYERS.map(([name,detail])=><div key={name}><strong>{name}</strong><span>{detail}</span></div>)}</div>
          </div>
          <div className="site-card">
            <span className="site-eyebrow">Контроль качества</span><h2>Как отделяем навык от предположения</h2>
            <div className="sv-data-layers">
              <div><strong>VERIFIED</strong><span>Есть подтверждающие evidence: тест, CI, интеграционный или runtime-результат.</span></div>
              <div><strong>NOT PROVEN</strong><span>Код или архитектура присутствуют, но нужный реальный сценарий ещё не доказан.</span></div>
              <div><strong>PENDING</strong><span>Навык или модуль входит в целевой план и требует реализации/проверки.</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="site-section site-section-cta">
        <div className="site-container site-cta-box sv-governance">
          <div><span className="site-eyebrow">Svetlana 2.0</span><h2>Единая карта для web, Android и будущих Hands</h2><p>Публичный сайт показывает полный замысел агента. Рабочее пространство использует только те функции, которые реально подключены к backend и соответствующим инструментам.</p></div>
          <Link className="site-btn site-btn-primary" to="/app/svetlana">Перейти к Светлане</Link>
        </div>
      </section>
    </div>
  );
}
