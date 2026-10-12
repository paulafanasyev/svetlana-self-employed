import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { calcNpd, NPD } from '../npd/npd.js';
import './HomePage.css';

const fmt = (n) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(n || 0);
const num = (v) => Number(String(v).replace(/\s/g, '').replace(',', '.')) || 0;

function MoneyField({ id, label, hint, value, onChange }) {
  return (
    <div className="npd-field">
      <label htmlFor={id}>{label}</label>
      <div className="npd-input-wrap">
        <input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d\s,.]/g, ''))} placeholder="0" aria-describedby={hint ? id + '-hint' : undefined} />
        <span aria-hidden="true">₽</span>
      </div>
      {hint && <small id={id + '-hint'}>{hint}</small>}
    </div>
  );
}

export default function NpdCalculator() {
  const [person, setPerson] = useState('50 000');
  const [business, setBusiness] = useState('');
  const [deduction, setDeduction] = useState('10 000');
  const [yearBefore, setYearBefore] = useState('');
  const r = useMemo(() => calcNpd({ person: num(person), business: num(business), deductionLeft: num(deduction), yearIncomeBefore: num(yearBefore) }), [person, business, deduction, yearBefore]);
  const share = Math.min(1, r.yearTotal / NPD.yearLimit);

  useEffect(() => { document.title = 'Калькулятор НПД — налог самозанятого 4% и 6% | Мир Самозанятых'; }, []);

  return (
    <div className="mh">
      <section className="mh-section mh-alt">
        <div className="mh-container">
          <span className="mh-eyebrow">Калькулятор налога самозанятого</span>
          <h1 style={{ fontSize: 'clamp(30px,4.4vw,46px)' }}>Сколько заплатить налога на НПД</h1>
          <p className="mh-lead">Введите доход за месяц (или за любой период, за который считаете). Ставки — 4% с физлиц и 6% с ИП и организаций. Вычет 10 000 ₽ снижает ставки до 3% и 4%, пока не израсходован.</p>

          <div className="npd-grid">
            <form className="mh-card npd-form" onSubmit={(e) => e.preventDefault()} aria-label="Данные для расчёта">
              <MoneyField id="npd-person" label="Доход от физлиц" hint="Клиенты — обычные люди" value={person} onChange={setPerson} />
              <MoneyField id="npd-business" label="Доход от ИП и организаций" hint="Клиенты — компании и ИП" value={business} onChange={setBusiness} />
              <MoneyField id="npd-deduction" label="Остаток налогового вычета" hint="Смотрите в «Мой налог». Новый самозанятый — 10 000 ₽" value={deduction} onChange={setDeduction} />
              <MoneyField id="npd-year" label="Доход с начала года до этого периода" hint="Нужно, чтобы проверить лимит 2,4 млн ₽" value={yearBefore} onChange={setYearBefore} />
            </form>

            <section className="mh-card npd-result" aria-live="polite" aria-label="Результат">
              <span className="npd-cap">{r.excess > 0 ? 'НПД к уплате (в пределах лимита)' : 'Налог к уплате'}</span>
              <strong className="npd-big">{fmt(r.tax)}</strong>
              <dl className="mh-req">
                <div><dt>Доход</dt><dd>{fmt(r.income)}</dd></div>
                {r.excess > 0 && <div><dt>Сверх лимита</dt><dd>{fmt(r.excess)} — НПД не применяется</dd></div>}
                <div><dt>Без вычета</dt><dd>{fmt(r.taxFull)}</dd></div>
                <div><dt>Вычет</dt><dd>−{fmt(r.deductionUsed)} (останется {fmt(r.deductionLeft)})</dd></div>
                <div><dt>{r.excess > 0 ? 'На руки (в пределах лимита)' : 'На руки'}</dt><dd>{fmt(r.net)}</dd></div>
                <div><dt>Ставка</dt><dd>{(r.effectiveRate * 100).toFixed(2).replace('.', ',')}%</dd></div>
              </dl>
              <div className="npd-limit">
                <div className="npd-bar"><i style={{ width: share * 100 + '%' }} className={r.nearLimit ? 'is-warn' : ''} /></div>
                <small>Доход за год: {fmt(r.yearTotal)} из {fmt(NPD.yearLimit)}. До лимита: {fmt(r.limitLeft)}.</small>
              </div>
              {r.overLimit && <p className="npd-alert" role="alert">Лимит НПД превышен. Калькулятор считает НПД только с дохода в пределах 2,4 млн ₽ и не рассчитывает налог после утраты права на НПД. Если доход шёл и от физлиц, и от компаний, точную сумму определит «Мой налог» по датам чеков. ИП может в течение 20 дней перейти на УСН; условия для вашего случая уточните на сайте ФНС.</p>}
              {!r.overLimit && r.nearLimit && <p className="npd-alert npd-alert-soft" role="status">До лимита НПД осталось меньше 10%. Спланируйте, что делать, если доход превысит 2,4 млн ₽.</p>}
            </section>
          </div>

          <div className="mh-steps npd-steps">
            <div className="mh-card"><span className="mh-step-n">1</span><h3>Получили оплату</h3><p>Сразу сформируйте чек в «Мой налог». От компаний при безналичной оплате — не позднее 9 числа следующего месяца.</p></div>
            <div className="mh-card"><span className="mh-step-n">2</span><h3>До 12 числа</h3><p>ФНС присылает в «Мой налог» сумму налога за прошлый месяц. Если сумма не превышает 100 ₽, она переносится на следующий месяц.</p></div>
            <div className="mh-card"><span className="mh-step-n">3</span><h3>До 28 числа</h3><p>Оплатите налог в приложении или подключите автоплатёж в банке.</p></div>
          </div>
          <p className="mh-note">Расчёт ориентировочный. Точная сумма — в приложении <a href="https://lknpd.nalog.ru/" target="_blank" rel="noopener noreferrer">«Мой налог»</a>. Источник ставок и лимита: <a href="https://www.nalog.gov.ru/rn77/npd/" target="_blank" rel="noopener noreferrer">ФНС России</a>, 422-ФЗ.</p>
          <div className="mh-actions"><Link className="mh-btn mh-btn-primary" to="/register">Вести доходы и чеки в CRM</Link><Link className="mh-btn" to="/">На главную</Link></div>
        </div>
      </section>
    </div>
  );
}
