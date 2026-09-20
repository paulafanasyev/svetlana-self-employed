/**
 * Аналитика — сводные показатели рабочего пространства (§34).
 * Все цифры приходят из реальных API: выручка по оплаченным счетам
 * (текущий и предыдущий месяц), клиенты, сделки, задачи, баланс и
 * журнал действий ИИ. Ничего не выдумывается: если данных нет —
 * показываем честную пустоту, если эндпоинт не отдаёт стоимость —
 * так и пишем.
 */
import { crm, tasks, finance, ai } from '../api.js';
import { useResource, Badge, EmptyState, ErrorState, fmtMoney } from '../ui.jsx';

const monthStart = (y, m) => Math.floor(new Date(y, m, 1).getTime() / 1000);
const monthLabel = (y, m) => new Date(y, m, 1).toLocaleString('ru-RU', { month: 'long' });

/** Сумма оплаченных счетов ответа finance.revenue(), optionally одной валютой. */
function paidSum(res, currency) {
  return (res?.data ?? [])
    .filter((r) => r.status === 'paid' && (currency == null || r.currency === currency))
    .reduce((s, r) => s + Number(r.total ?? 0), 0);
}

export default function Analytics() {
  const now = new Date();
  const cur = { from: monthStart(now.getFullYear(), now.getMonth()), to: monthStart(now.getFullYear(), now.getMonth() + 1) };
  const prev = { from: monthStart(now.getFullYear(), now.getMonth() - 1), to: cur.from };

  const revCur = useResource(() => finance.revenue(cur.from, cur.to), []);
  const revPrev = useResource(() => finance.revenue(prev.from, prev.to), []);
  const clients = useResource(() => crm.clients(), []);
  const deals = useResource(() => crm.deals(), []);
  const taskList = useResource(() => tasks.list('?limit=100'), []);
  const overdue = useResource(() => tasks.overdue(), []);
  const balance = useResource(() => finance.balance(), []);
  const aiActions = useResource(() => ai.actions('?limit=100'), []);

  const dealRows = deals.data?.data ?? [];
  const dealSum = dealRows.reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const doneCount = (taskList.data?.data ?? []).filter((t) => t.status === 'done').length;
  const overdueCount = overdue.data?.count ?? (overdue.data?.data ?? []).length;

  // Валюта для столбчатой визуализации — первая валюта текущего месяца
  // (чаще всего RUB). Группы по другим валютам показаны ниже как есть.
  const groups = revCur.data?.data ?? [];
  const currency = groups[0]?.currency ?? 'RUB';
  const curPaid = paidSum(revCur.data, currency);
  const prevPaid = paidSum(revPrev.data, currency);
  const max = Math.max(curPaid, prevPaid, 1);
  const bars = [
    { label: monthLabel(now.getFullYear(), now.getMonth() - 1), value: prevPaid },
    { label: monthLabel(now.getFullYear(), now.getMonth()), value: curPaid },
  ];

  const actionRows = aiActions.data?.data ?? [];
  const hasCost = actionRows.some((a) => a.cost_rub != null || a.cost != null);

  return (
    <div className="stack">
      <div className="grid grid-3">
        <StatCard icon="👥" label="Клиентов" value={clients.data?.total ?? 0} loading={clients.loading} />
        <StatCard icon="🤝" label="Сделок" value={deals.data?.total ?? 0} sub={`сумма: ${fmtMoney(dealSum)}`} loading={deals.loading} />
        <StatCard icon="✅" label="Задач выполнено" value={doneCount}
          sub={`просрочено: ${overdueCount}`} loading={taskList.loading || overdue.loading} />
      </div>

      <Panel title="Выручка по оплаченным счетам"
        loading={revCur.loading || revPrev.loading}
        error={revCur.error || revPrev.error}
        onRetry={() => { revCur.reload(); revPrev.reload(); }}>
        {groups.length === 0 && (revPrev.data?.data ?? []).length === 0 ? (
          <EmptyState icon="💸" title="Нет данных о выручке"
            hint="Оплаченные счета появятся здесь, как только вы отметите счет как оплаченный" />
        ) : (
          <>
            <div className="row" style={{ alignItems: 'flex-end', gap: 28, flexWrap: 'wrap' }}>
              {bars.map((b) => (
                <div key={b.label} style={{ textAlign: 'center', flex: '0 0 128px' }}>
                  <div style={{ height: 140, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <div title={fmtMoney(b.value, currency)}
                      style={{ width: 64, height: Math.max(4, Math.round((b.value / max) * 128)),
                        background: 'var(--accent, #4f46e5)', borderRadius: '6px 6px 0 0' }} />
                  </div>
                  <div className="small" style={{ fontWeight: 600 }}>{fmtMoney(b.value, currency)}</div>
                  <div className="small muted">{b.label}</div>
                </div>
              ))}
            </div>
            <p className="small muted" style={{ margin: '12px 0 0' }}>
              Месяц подряд: {prevPaid > 0 ? `${Math.round((curPaid / prevPaid - 1) * 100)}%` : '—'}
              {' · '}в валюте {currency}
            </p>
            {groups.length > 0 && (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {groups.map((g) => (
                  <span key={`${g.status}-${g.currency}`} className="row" style={{ gap: 6, alignItems: 'center' }}>
                    <Badge status={g.status}>{g.status}</Badge>
                    <span className="small muted">{g.n} шт · {fmtMoney(Number(g.total ?? 0), g.currency)}</span>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </Panel>

      <div className="grid grid-2">
        <Panel title="Платежи и баланс" resource={balance}>
          {balance.data?.balance ? (
            <>
              <MoneyRow label="Доступно к выводу" value={balance.data.balance.available}
                currency={balance.data.balance.currency} />
              <MoneyRow label="В споре" value={balance.data.balance.in_dispute}
                currency={balance.data.balance.currency} />
              <MoneyRow label="Выплачено всего" value={balance.data.balance.paid_out}
                currency={balance.data.balance.currency} />
              <p className="small muted" style={{ margin: '10px 0 0' }}>
                Выплат в истории: {(balance.data?.payouts ?? []).length}
              </p>
            </>
          ) : (
            <EmptyState icon="💰" title="Баланс не сформирован"
              hint="Сюда попадают выплаты за заказы и услуги маркетплейса" />
          )}
        </Panel>

        <Panel title="Использование ИИ" resource={aiActions}>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <Metric label="Всего действий" value={actionRows.length} />
            <Metric label="Выполнено" value={actionRows.filter((a) => a.status === 'succeeded').length} />
            <Metric label="С ошибкой" value={actionRows.filter((a) => a.status === 'failed').length} />
            <Metric label="Проверено" value={actionRows.filter((a) => a.verified).length} />
          </div>
          {!hasCost && (
            <p className="small muted" style={{ margin: '12px 0 0' }}>
              Эндпоинт ai/actions не возвращает данных о стоимости запросов —
              показать расходы на ИИ невозможно.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, resource, loading, error, onRetry, children }) {
  const isLoading = resource ? resource.loading : loading;
  const err = resource ? resource.error : error;
  return (
    <div className="card">
      <h3 style={{ margin: '0 0 12px' }}>{title}</h3>
      {isLoading ? (
        <p className="muted">Загружаю…</p>
      ) : err ? (
        <ErrorState error={err} onRetry={resource ? resource.reload : onRetry} />
      ) : (
        children
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub, loading }) {
  return (
    <div className="card">
      <div className="ico" aria-hidden="true" style={{ fontSize: '1.5rem' }}>{icon}</div>
      <h3 style={{ margin: '6px 0 0' }}>{loading ? '…' : Number(value).toLocaleString('ru-RU')}</h3>
      <p className="muted small" style={{ margin: 0 }}>{label}</p>
      {sub ? <p className="muted small" style={{ margin: '2px 0 0' }}>{sub}</p> : null}
    </div>
  );
}

function MoneyRow({ label, value, currency }) {
  return (
    <div className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
      <span>{label}</span>
      <strong>{fmtMoney(Number(value ?? 0), currency)}</strong>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <div style={{ fontWeight: 700 }}>{Number(value).toLocaleString('ru-RU')}</div>
      <div className="muted small">{label}</div>
    </div>
  );
}
