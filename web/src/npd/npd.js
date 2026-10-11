/**
 * Расчёт налога на профессиональный доход (422-ФЗ).
 *  - ставка 4% с доходов от физлиц, 6% — от ИП и организаций (ст. 10);
 *  - налоговый вычет 10 000 ₽ на всё время: уменьшает налог на 1% (физлица)
 *    и 2% (ИП/организации) от дохода, пока не израсходован (ст. 12);
 *  - лимит дохода 2 400 000 ₽ за календарный год (ст. 4).
 */
export const NPD = {
  rate: { person: 0.04, business: 0.06 },
  deductionRate: { person: 0.01, business: 0.02 },
  deductionTotal: 10000,
  yearLimit: 2400000,
};

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {{person?:number,business?:number,deductionLeft?:number,yearIncomeBefore?:number}} input
 */
export function calcNpd({ person = 0, business = 0, deductionLeft = NPD.deductionTotal, yearIncomeBefore = 0 } = {}) {
  const p0 = Math.max(0, Number(person) || 0);
  const b0 = Math.max(0, Number(business) || 0);
  const before = Math.max(0, Number(yearIncomeBefore) || 0);
  // НПД применяется только к доходу в пределах лимита года; превышение облагается по другому режиму.
  const room = Math.max(0, NPD.yearLimit - before);
  const k = p0 + b0 > room ? (p0 + b0 ? room / (p0 + b0) : 0) : 1;
  const p = p0 * k;
  const b = b0 * k;
  const left0 = Math.min(NPD.deductionTotal, Math.max(0, Number(deductionLeft) || 0));

  const taxPerson = p * NPD.rate.person;
  const taxBusiness = b * NPD.rate.business;
  let left = left0;
  const dedPerson = Math.min(left, p * NPD.deductionRate.person);
  left -= dedPerson;
  const dedBusiness = Math.min(left, b * NPD.deductionRate.business);
  left -= dedBusiness;

  const income = p0 + b0;
  const taxable = p + b;
  const yearTotal = before + income;
  const tax = taxPerson + taxBusiness - dedPerson - dedBusiness;
  return {
    income: r2(income),
    taxableNpd: r2(taxable),
    excess: r2(income - taxable),
    taxFull: r2(taxPerson + taxBusiness),
    deductionUsed: r2(dedPerson + dedBusiness),
    deductionLeft: r2(left),
    tax: r2(tax),
    net: r2(taxable - tax),
    effectiveRate: taxable ? tax / taxable : 0,
    yearTotal: r2(yearTotal),
    limitLeft: r2(Math.max(0, NPD.yearLimit - yearTotal)),
    overLimit: yearTotal > NPD.yearLimit,
    nearLimit: yearTotal > NPD.yearLimit * 0.9,
  };
}
