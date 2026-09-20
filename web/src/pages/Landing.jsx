/**
 * Публичный landing (§35): объясняет продукт, потом отправляет в настоящее
 * рабочее пространство. SEO-Canonical указывает на основной домен (§5).
 */
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { SvetlanaAvatar } from '../components/SvetlanaAvatar.jsx';

const FEATURES = [
  { icon: '✨', title: 'Светлана — AI-оператор', text: 'Заведёт клиента, поставит задачу, подготовит договор и найдёт гранты. Каждое действие подтверждено доказательством — без выдумок.' },
  { icon: '👥', title: 'CRM для самозанятых', text: 'Клиенты, компании, контакты, лиды, сделки, задачи и календарь в одном месте.' },
  { icon: '🔍', title: 'Поиск клиентов', text: 'Маркетплейс заказов и вакансии с умным сопоставлением профиля и требований заказчика.' },
  { icon: '📄', title: 'Документы', text: 'Договор, акт, счёт, КП, NDA, оферта, ТЗ — по шагам, с предпросмотром и утверждением.' },
  { icon: '🧾', title: 'Налоги и ФНС', text: 'Ответы по НПД и ИП со ссылками на официальные источники — через RAG, а не наугад.' },
  { icon: '🎁', title: 'Гранты и поддержка', text: 'Персонализированная подборка грантов, субсидий и социальных контрактов.' },
  { icon: '🎓', title: 'Обучение', text: 'Курсы, консультации и вебинары от экспертов с прогрессом и сертификатами.' },
  { icon: '📊', title: 'Аналитика', text: 'Доходы, пайплайн сделок и конкурентная разведка на основе ваших данных.' },
];

const FAQ = [
  { q: 'Светлана — это реальный AI?', a: 'Светлана — AI-оператор поверх единого backend: разбирает запрос, планирует действия, вызывает инструменты и проверяет результат. Если действие нельзя подтвердить, она прямо сообщит статус NOT PROVEN, а не будет утверждать, что всё сделано.' },
  { q: 'Это отдельно от мобильного приложения?', a: 'Нет. Web и Android — это клиенты одного продукта с общим backend, общей базой данных и одним набором ваших данных. Задача, созданная с телефона, видна на сайте.' },
  { q: 'Нужно ли платить?', a: 'Базовый функционал — CRM, документы, Светлана, поиск клиентов — бесплатный. Платные — курсы и дополнительные сервисы маркетплейса.' },
  { q: 'Куда делись мои данные?', a: 'У вас есть консент-реестр, экспорт данных и удаление аккаунта в настройках. Внешним AI передаётся минимум, необходимый для ответа.' },
];

export default function Landing() {
  const { user } = useAuth();
  const cta = user ? '/app' : '/register';

  return (
    <>
      <section className="hero">
        <div className="row" style={{ gap: 28, alignItems: 'center' }}>
          <div style={{ flex: '1 1 320px' }}>
            <h1>Мир Самозанятых</h1>
            <p className="lead">
              Единая платформа для самозанятых и ИП: AI-оператор Светлана берёт рутину на себя —
              клиентов, документы, налоги, гранты и поиск заказов.
            </p>
            <div className="cta">
              <Link to={cta} className="btn btn-primary">{user ? 'Войти в рабочее пространство' : 'Начать бесплатно'}</Link>
              <Link to="/login" className="btn btn-outline">У меня уже есть аккаунт</Link>
            </div>
          </div>
          <div style={{ flex: '0 0 auto' }} className="svetlana-large">
            <SvetlanaAvatar emotion="HAPPY" size={180} />
          </div>
        </div>
      </section>

      <div className="content" style={{ maxWidth: 1080 }}>
        <section className="section">
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <div className="feature" key={f.title}>
                <div className="ico" aria-hidden="true">{f.icon}</div>
                <h3>{f.title}</h3>
                <p className="muted small">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <h2>Как это работает</h2>
          <div className="grid grid-3">
            {[
              { n: '1', t: 'Опишите задачу', d: '«Создай клиента ООО Вектор и подготовь договор» — Светлана разбирает намерение.' },
              { n: '2', t: 'Действует по плану', d: 'Планировщик, политика безопасности и реестр инструментов: CRM, документы, поиск.' },
              { n: '3', t: 'Подтверждает результат', d: 'Каждое действие сохраняется с доказательством. Вы видите верифицированный итог.' },
            ].map((s) => (
              <div className="card" key={s.n}>
                <div className="badge">{s.n}</div>
                <h3>{s.t}</h3>
                <p className="muted small">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section faq">
          <h2>Частые вопросы</h2>
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </section>

        <section className="section" style={{ textAlign: 'center' }}>
          <h2>Готовы начать?</h2>
          <p className="muted">Регистрация занимает минуту — и вы попадаете в настоящее рабочее пространство.</p>
          <Link to={cta} className="btn btn-primary" style={{ padding: '12px 28px', fontSize: '1.05rem' }}>
            {user ? 'Открыть рабочее пространство' : 'Создать аккаунт'}
          </Link>
        </section>

        <footer className="site">
          <div className="row between">
            <span>© {new Date().getFullYear()} Мир Самозанятых</span>
            <span>
              <Link to="/">мир-самозанятых.рф</Link> · единый продукт: web + Android
            </span>
          </div>
        </footer>
      </div>
    </>
  );
}
