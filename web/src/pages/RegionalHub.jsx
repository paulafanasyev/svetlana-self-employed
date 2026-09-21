import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicDiscovery } from '../api.js';
import { useResource } from '../ui.jsx';

const CITY_SUGGESTIONS = [
  'Москва', 'Санкт-Петербург', 'Казань', 'Екатеринбург', 'Новосибирск',
  'Нижний Новгород', 'Самара', 'Ростов-на-Дону', 'Краснодар', 'Воронеж',
  'Уфа', 'Пермь', 'Омск', 'Челябинск', 'Тюмень', 'Владивосток',
];

function money(value) {
  if (value == null) return '';
  return Number(value).toLocaleString('ru-RU') + ' ₽';
}

function saveCity(value) {
  try {
    localStorage.setItem('mir-city', value);
    window.dispatchEvent(new CustomEvent('mir-city-change', { detail: value }));
  } catch {}
}

function readCity() {
  try { return localStorage.getItem('mir-city') || ''; } catch { return ''; }
}

function LocationPicker({ city, region, setCity, setRegion }) {
  return (
    <section className="site-location-panel site-card" aria-label="География">
      <div>
        <span className="site-eyebrow">Ваш город и регион</span>
        <h2>Покажем возможности рядом с вами</h2>
        <p>Укажите город, чтобы искать работу и обучение рядом. Регион нужен для отбора региональных мер поддержки и грантов.</p>
      </div>
      <div className="site-location-form">
        <label>
          Город
          <input
            list="mir-city-suggestions"
            value={city}
            onChange={(event) => {
              const value = event.target.value;
              setCity(value);
              saveCity(value);
            }}
            placeholder="Например, Москва"
            autoComplete="address-level2"
          />
        </label>
        <label>
          Регион
          <input
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            placeholder="Например, Московская область"
            autoComplete="address-level1"
          />
        </label>
        <datalist id="mir-city-suggestions">
          {CITY_SUGGESTIONS.map((name) => <option key={name} value={name} />)}
        </datalist>
      </div>
    </section>
  );
}

function VacancyCard({ vacancy, external = false }) {
  return (
    <article className="site-card site-opportunity-card">
      <div className="site-source-chip">{external ? 'Работа России' : 'Мир Самозанятых'}</div>
      <h3>{vacancy.title}</h3>
      <p className="site-opportunity-meta">
        {vacancy.company ? vacancy.company + ' · ' : ''}
        {vacancy.city || vacancy.region || 'География уточняется'}
      </p>
      {vacancy.description && <p>{String(vacancy.description).slice(0, 240)}</p>}
      {(vacancy.salary_from || vacancy.salary_to) && (
        <p className="site-opportunity-salary">
          {vacancy.salary_from && vacancy.salary_to
            ? money(vacancy.salary_from) + ' – ' + money(vacancy.salary_to)
            : vacancy.salary_from
              ? 'от ' + money(vacancy.salary_from)
              : 'до ' + money(vacancy.salary_to)}
        </p>
      )}
      {external ? (
        <a className="site-inline-link" href={vacancy.url || 'https://trudvsem.ru/vacancy/search'} target="_blank" rel="noreferrer">
          Открыть источник →
        </a>
      ) : (
        <Link className="site-inline-link" to="/login">Войти, чтобы откликнуться →</Link>
      )}
    </article>
  );
}

function CourseCard({ course }) {
  return (
    <article className="site-card site-opportunity-card">
      <div className="site-source-chip">Обучение</div>
      <h3>{course.title}</h3>
      <p className="site-opportunity-meta">
        {course.author_kind === 'training_center' ? 'Учебный / профессиональный центр' : 'Эксперт'}
        {course.city ? ' · ' + course.city : ''}
      </p>
      {course.description && <p>{String(course.description).slice(0, 220)}</p>}
      <p className="site-opportunity-meta">
        {course.duration_hours ? course.duration_hours + ' ч' : 'Длительность уточняется'}
        {' · '}
        {Number(course.price || 0) > 0 ? money(course.price) : 'Бесплатно'}
      </p>
    </article>
  );
}

function GrantCard({ grant }) {
  return (
    <article className="site-card site-opportunity-card">
      <div className="site-source-chip">Поддержка</div>
      <h3>{grant.title}</h3>
      <p className="site-opportunity-meta">
        {grant.funder || grant.source_name || 'Государственная программа'}
        {grant.region ? ' · ' + grant.region : ' · Федеральная'}
      </p>
      {grant.description && <p>{String(grant.description).slice(0, 220)}</p>}
      <a className="site-inline-link" href={grant.url} target="_blank" rel="noreferrer">
        Открыть официальный источник →
      </a>
    </article>
  );
}

export default function RegionalHub() {
  const [city, setCity] = useState(readCity);
  const [region, setRegion] = useState('');
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useResource(
    () => publicDiscovery.geo({ city, region, q, limit: 8 }),
    [city, region, q],
  );

  useEffect(() => {
    const sync = (event) => setCity(event.detail ?? readCity());
    window.addEventListener('mir-city-change', sync);
    return () => window.removeEventListener('mir-city-change', sync);
  }, []);

  const localVacancies = data?.local_vacancies ?? [];
  const trud = data?.trud_russia?.data ?? [];
  const courses = data?.courses ?? [];
  const grants = data?.grants ?? [];

  return (
    <>
      <section className="site-page-intro">
        <div className="site-container">
          <span className="site-eyebrow">Работа · обучение · поддержка</span>
          <h1>{city ? 'Возможности для самозанятых в ' + city : 'Работа и возможности по вашему городу'}</h1>
          <p>
            Выберите город и, при необходимости, регион. Здесь собираются вакансии
            «Мира Самозанятых», открытые данные «Работы России», обучение и меры поддержки.
          </p>
          <div className="site-actions">
            <Link to="/register" className="site-btn site-btn-primary">Зарегистрироваться</Link>
            <Link to="/marketplace" className="site-btn site-btn-soft">Открыть маркетплейс</Link>
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-container">
          <LocationPicker city={city} region={region} setCity={setCity} setRegion={setRegion} />
          <form className="site-region-search" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="region-search">Поиск по возможностям</label>
            <div className="site-region-search-row">
              <input id="region-search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Например: бухгалтер, дизайн, обучение" />
              <button className="site-btn site-btn-primary" type="submit">Найти</button>
            </div>
          </form>

          {loading && <p className="site-muted-block">Загружаю актуальные данные по выбранной географии…</p>}
          {error && (
            <div className="site-notice site-notice-error">
              Не удалось загрузить региональные данные: {error.message || String(error)}
              <button className="site-btn site-btn-soft" type="button" onClick={reload}>Повторить</button>
            </div>
          )}

          <div className="site-opportunity-section">
            <div className="site-section-head site-section-head-left">
              <span className="site-eyebrow">Работа</span>
              <h2>Вакансии «Мира Самозанятых»</h2>
              <p>{city ? 'Показаны объявления для ' + city + ' и удалённые вакансии.' : 'Выберите город для точного локального отбора.'}</p>
            </div>
            {!loading && localVacancies.length === 0
              ? <div className="site-card"><p>Внутренних вакансий по выбранным условиям пока нет. Можно разместить свою вакансию после регистрации.</p><Link className="site-inline-link" to="/register">Разместить вакансию →</Link></div>
              : <div className="site-opportunity-grid">{localVacancies.map((v) => <VacancyCard key={v.id} vacancy={v} />)}</div>}
          </div>

          <div className="site-opportunity-section">
            <div className="site-section-head site-section-head-left">
              <span className="site-eyebrow">Федеральный источник</span>
              <h2>Другие вакансии — «Работа России»</h2>
              <p>Это отдельный источник, который помогает не ограничивать поиск вакансиями внутри нашей платформы.</p>
            </div>
            {data?.trud_russia?.unavailable
              ? <div className="site-notice">Официальный открытый API «Работы России» сейчас недоступен: {data.trud_russia.reason || 'причина не сообщена'}. <a className="site-inline-link" href="https://trudvsem.ru/" target="_blank" rel="noreferrer">Открыть «Работу России» напрямую →</a></div>
              : trud.length === 0
                ? <div className="site-card"><p>По текущему сочетанию города и запроса вакансии из открытого источника не найдены.</p><a className="site-inline-link" href="https://trudvsem.ru/" target="_blank" rel="noreferrer">Проверить «Работу России» →</a></div>
                : <div className="site-opportunity-grid">{trud.map((v) => <VacancyCard key={v.id} vacancy={v} external />)}</div>}
          </div>

          <div className="site-opportunity-section">
            <div className="site-section-head site-section-head-left">
              <span className="site-eyebrow">Обучение</span>
              <h2>Курсы и учебные центры рядом</h2>
              <p>Каталог учитывает город профиля автора курса. Для учебных и профессиональных центров можно указать свой город в рабочем профиле.</p>
            </div>
            {courses.length === 0
              ? <div className="site-card"><p>По выбранной географии опубликованных курсов пока нет.</p><Link className="site-inline-link" to="/register">Предложить обучение →</Link></div>
              : <div className="site-opportunity-grid">{courses.map((course) => <CourseCard key={course.id} course={course} />)}</div>}
          </div>

          <div className="site-opportunity-section">
            <div className="site-section-head site-section-head-left">
              <span className="site-eyebrow">Поддержка и гранты</span>
              <h2>Меры, которые зависят от региона</h2>
              <p>Региональные программы показываются вместе с федеральными возможностями. Всегда переходите к официальному источнику перед подачей заявки.</p>
            </div>
            {grants.length === 0
              ? <div className="site-card"><p>Для выбранного региона в текущей выдаче программ нет.</p><Link className="site-inline-link" to="/register">Открыть профиль и персонализировать подборку →</Link></div>
              : <div className="site-opportunity-grid">{grants.map((grant) => <GrantCard key={grant.id} grant={grant} />)}</div>}
          </div>

          <div className="site-region-note">
            <strong>Как это работает</strong>
            <span>Город используется для локальных объявлений и обучения, регион — для мер поддержки. Вакансии из «Работы России» помечены как внешний официальный источник; публикация вакансии туда остаётся отдельным интеграционным процессом и здесь не маскируется под уже выполненную отправку.</span>
          </div>
        </div>
      </section>
    </>
  );
}
