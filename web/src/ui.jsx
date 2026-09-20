/**
 * Shared UI primitives + data hooks.
 *
 * Everything here is deliberately boring and reusable so that the ~25 pages of
 * the workspace (§34) stay consistent and small. No mock data anywhere: every
 * hook talks to the real backend, and errors surface honestly to the user.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api.js';

/** Status badge colour map for CRM-ish entities. */
const STATUS_TONE = {
  // generic
  ok: 'ok', done: 'ok', completed: 'ok', succeeded: 'ok', verified: 'ok', approved: 'ok',
  paid: 'ok', published: 'ok', active: 'ok', confirmed: 'ok', accepted: 'ok', won: 'ok',
  warn: 'warn', pending: 'warn', waiting: 'warn', preview: 'warn', draft: 'warn',
  new: 'info', lead: 'info', info: 'info', sent: 'info', submitted: 'info', applied: 'info',
  err: 'err', failed: 'err', rejected: 'err', cancelled: 'err', overdue: 'err',
  blocked: 'err', declined: 'err', lost: 'err', error: 'err',
};

export function Badge({ status, children }) {
  const tone = STATUS_TONE[String(status ?? '').toLowerCase()] ?? '';
  return <span className={`badge ${tone}`}>{children ?? status}</span>;
}

export function Spinner({ label = 'Загрузка…' }) {
  return (
    <div className="empty" role="status" aria-live="polite">
      <span className="spin" aria-hidden="true" /> <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon = '✨', title = 'Пока пусто', hint, action }) {
  return (
    <div className="empty">
      <div className="ico" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {hint && <p className="muted">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const msg = error instanceof ApiError ? error.message : String(error?.message ?? error);
  return (
    <div className="alert err" role="alert">
      <strong>Не удалось загрузить данные.</strong> {msg}
      {onRetry && (
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-sm" onClick={onRetry}>Повторить</button>
        </div>
      )}
    </div>
  );
}

/**
 * Fetch + refetch an API resource with loading/error state.
 * `fetcher` may be either a path string or an async function.
 */
export function useResource(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const alive = useRef(true);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const value = typeof fetcher === 'function' ? await fetcher() : await api.get(fetcher);
      if (alive.current) setData(value);
    } catch (err) {
      if (alive.current) setError(err);
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    alive.current = true;
    run();
    return () => { alive.current = false; };
  }, [run]);

  return { data, loading, error, reload: run, setData };
}

/** Format a unix timestamp (seconds) or ISO string as a readable date. */
export function fmtDate(value, opts) {
  if (!value) return '—';
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', opts ?? { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtMoney(value, currency = 'RUB') {
  const n = Number(value ?? 0);
  return n.toLocaleString('ru-RU', { style: 'currency', currency, maximumFractionDigits: 2 });
}

/** Tiny pluralizer for Russian nouns: plural(1, 'клиент','клиента','клиентов'). */
export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** Confirm an action via the platform dialog (used before destructive ops). */
export function confirmAction(message) {
  return window.confirm(message);
}
