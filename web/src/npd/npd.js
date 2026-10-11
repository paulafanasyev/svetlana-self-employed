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
  const p = Math.max(0, Number(person) || 0);
  const b = Math.max(0, Number(business) || 0);
  const left0 = Math.min(NPD.deductionTotal, Math.max(0, Number(deductionLeft) || 0));
  const before = Math.max(0, Number(yearIncomeBefore) || 0);

  const taxPerson = p * NPD.rate.person;
  const taxBusiness = b * NPD.rate.business;
  let left = left0;
  const dedPerson = Math.min(left, p * NPD.deductionRate.person);
  left -= dedPerson;
  const dedBusiness = Math.min(left, b * NPD.deductionRate.business);
  left -= dedBusiness;

  const income = p + b;
  const yearTotal = before + income;
  return {
    income: r2(income),
    taxFull: r2(taxPerson + taxBusiness),
    deductionUsed: r2(dedPerson + dedBusiness),
    deductionLeft: r2(left),
    tax: r2(taxPerson + taxBusiness - dedPerson - dedBusiness),
    net: r2(income - (taxPerson + taxBusiness - dedPerson - dedBusiness)),
    effectiveRate: income ? (taxPerson + taxBusiness - dedPerson - dedBusiness) / income : 0,
    yearTotal: r2(yearTotal),
    limitLeft: r2(Math.max(0, NPD.yearLimit - yearTotal)),
    overLimit: yearTotal > NPD.yearLimit,
    nearLimit: yearTotal > NPD.yearLimit * 0.9,
  };
}
