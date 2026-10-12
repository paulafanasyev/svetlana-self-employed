/**
 * Синхронизация CRM Светланы с аккаунтом (сайт ↔ Windows ↔ Android).
 *
 * Работает поверх crmStore, не меняя его: следит за изменениями через
 * store.subscribe, сравнивая снимки записей, и копит очередь «что отправить»
 * в localStorage. Без интернета CRM продолжает работать, очередь уходит позже.
 *
 * Протокол: POST /api/v1/crm/sync { since, changes[] } → { cursor, hasMore, records[] }.
 * Конфликты: побеждает более поздняя правка (updatedAt, мс). Удаления — tombstone.
 */
import { storageKeyFor } from './crmStore.js';

export const SYNC_KINDS = ['contacts', 'deals', 'activities'];
export const SYNC_BATCH = 500;
const ID_RE = /^[a-z]_[a-z0-9]{4,40}$/;

export const SYNC_STATUS_TEXT = {
  idle: 'Синхронизация ещё не запускалась',
  syncing: 'Синхронизирую…',
  ok: 'Всё сохранено в аккаунте',
  pending: 'Есть изменения, ожидающие отправки',
  offline: 'Нет связи — изменения сохранены на устройстве и отправятся позже',
  error: 'Не удалось синхронизировать, повторю автоматически',
  auth: 'Войдите в аккаунт заново, чтобы синхронизировать CRM',
};

const keyOf = (kind, id) => `${kind}:${id}`;

function snapshotOf(data) {
  const snap = new Map();
  for (const kind of SYNC_KINDS) {
    for (const rec of data?.[kind] || []) snap.set(keyOf(kind, rec.id), JSON.stringify(rec));
  }
  return snap;
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function defaultStorage() {
  try { if (typeof localStorage !== 'undefined') return localStorage; } catch { /* запрет хранилища */ }
  return memoryStorage();
}

export function createCrmSync({
  store,
  owner,
  request,
  storage = defaultStorage(),
  clock = () => Date.now(),
  debounceMs = 1500,
  intervalMs = 30000,
  autoStart = true,
} = {}) {
  if (!store || typeof request !== 'function') throw new Error('createCrmSync: нужны store и request');
  const stateKey = `${storageKeyFor(owner)}:sync`;
  let state;
  try { state = JSON.parse(storage.getItem(stateKey) || 'null'); } catch { state = null; }
  if (!state || typeof state !== 'object') state = {};
  state = { cursor: Number(state.cursor) || 0, pending: state.pending && typeof state.pending === 'object' ? state.pending : {}, init: Boolean(state.init), lastSyncAt: Number(state.lastSyncAt) || 0 };

  let snapshot = snapshotOf(store.data);
  let applying = false;
  let running = null;
  let again = false;
  let stopped = false;
  let started = false;
  let debounceTimer = null;
  let intervalTimer = null;
  let status = { state: 'idle', pending: 0, lastSyncAt: state.lastSyncAt, message: SYNC_STATUS_TEXT.idle, localOnly: 0 };
  const listeners = new Set();

  const save = () => { try { storage.setItem(stateKey, JSON.stringify(state)); } catch { /* квота */ } };
  const pendingCount = () => Object.keys(state.pending).length;
  const setStatus = (s, extra = {}) => {
    status = { ...status, ...extra, state: s, pending: pendingCount(), lastSyncAt: state.lastSyncAt, message: extra.message || SYNC_STATUS_TEXT[s] };
    listeners.forEach((fn) => fn(status));
  };

  // Первый запуск на устройстве: всё, что уже есть локально, отправляем в аккаунт.
  if (!state.init) {
    for (const kind of SYNC_KINDS) {
      for (const rec of store.data[kind] || []) {
        state.pending[keyOf(kind, rec.id)] = Math.max(1, Number(rec.updatedAt) || Number(rec.createdAt) || clock());
      }
    }
    state.init = true;
    save();
  }

  function onLocalChange() {
    if (applying) return;
    const next = snapshotOf(store.data);
    const now = clock();
    let changed = false;
    for (const [k, v] of next) {
      if (snapshot.get(k) !== v) { state.pending[k] = now; changed = true; }
    }
    for (const k of snapshot.keys()) {
      if (!next.has(k)) { state.pending[k] = now; changed = true; }
    }
    snapshot = next;
    if (changed) { save(); setStatus(status.state === 'syncing' ? 'syncing' : 'pending'); schedule(); }
  }

  function applyRemote(records) {
    if (!records?.length) return 0;
    const data = { contacts: [...store.data.contacts], deals: [...store.data.deals], activities: [...store.data.activities] };
    let touched = 0;
    for (const r of records) {
      if (!SYNC_KINDS.includes(r.kind) || !r.id) continue;
      const k = keyOf(r.kind, r.id);
      const local = state.pending[k];
      if (local && local > r.updatedAt) continue; // наша правка новее — она уйдёт на сервер
      if (local) delete state.pending[k];
      const list = data[r.kind];
      const idx = list.findIndex((x) => x.id === r.id);
      if (r.deleted || !r.data) {
        if (idx >= 0) { list.splice(idx, 1); touched += 1; }
      } else {
        const rec = { ...r.data, id: r.id };
        if (idx >= 0) {
          if (JSON.stringify(list[idx]) !== JSON.stringify(rec)) { list[idx] = rec; touched += 1; }
        } else { list.push(rec); touched += 1; }
      }
    }
    if (touched) {
      applying = true;
      try { store.importJSON(JSON.stringify({ version: 1, ...data })); } finally { applying = false; }
      snapshot = snapshotOf(store.data);
    }
    return touched;
  }

  function buildChanges() {
    const changes = [];
    let localOnly = 0;
    const current = new Map();
    for (const kind of SYNC_KINDS) for (const rec of store.data[kind] || []) current.set(keyOf(kind, rec.id), rec);
    for (const [k, t] of Object.entries(state.pending)) {
      const i = k.indexOf(':');
      const kind = k.slice(0, i); const id = k.slice(i + 1);
      if (!SYNC_KINDS.includes(kind) || !ID_RE.test(id)) { localOnly += 1; continue; }
      if (changes.length >= SYNC_BATCH) continue;
      const rec = current.get(k);
      changes.push(rec ? { kind, id, updatedAt: Math.round(t), deleted: false, data: rec } : { kind, id, updatedAt: Math.round(t), deleted: true, data: null });
    }
    return { changes, localOnly };
  }

  async function runOnce() {
    let guard = 0;
    let localOnly = 0;
    for (;;) {
      guard += 1;
      if (guard > 50) break;
      const built = buildChanges();
      localOnly = built.localOnly;
      const sent = built.changes.map((c) => [keyOf(c.kind, c.id), state.pending[keyOf(c.kind, c.id)]]);
      const res = await request({ since: state.cursor, changes: built.changes });
      for (const [k, t] of sent) if (state.pending[k] === t) delete state.pending[k];
      applyRemote(res?.records || []);
      if (Number.isFinite(Number(res?.cursor))) state.cursor = Number(res.cursor);
      save();
      const more = res?.hasMore || buildChanges().changes.length > 0;
      if (!more) break;
    }
    state.lastSyncAt = clock();
    save();
    return localOnly;
  }

  async function syncNow() {
    if (stopped) return status;
    if (running) { again = true; return running; }
    clearTimeout(debounceTimer);
    setStatus('syncing');
    running = (async () => {
      try {
        const localOnly = await runOnce();
        setStatus(pendingCount() - localOnly > 0 ? 'pending' : 'ok', { localOnly });
      } catch (err) {
        const code = err?.status;
        const offline = code === 0 || (typeof navigator !== 'undefined' && navigator.onLine === false);
        setStatus(code === 401 || code === 403 ? 'auth' : offline ? 'offline' : 'error', { error: err?.message || String(err) });
      } finally {
        running = null;
      }
      if (again && !stopped) { again = false; return syncNow(); }
      return status;
    })();
    return running;
  }

  function schedule() {
    if (stopped || !started) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { syncNow(); }, debounceMs);
  }

  const onOnline = () => syncNow();
  const unsubscribe = store.subscribe(onLocalChange);

  function start() {
    started = true;
    if (intervalMs > 0 && !intervalTimer) intervalTimer = setInterval(() => { syncNow(); }, intervalMs);
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('online', onOnline);
    return syncNow();
  }

  function stop() {
    stopped = true;
    unsubscribe();
    clearTimeout(debounceTimer);
    clearInterval(intervalTimer);
    if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('online', onOnline);
  }

  const api = {
    get status() { return status; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    syncNow,
    start,
    stop,
    /** Для тестов и отладки. */
    get pending() { return { ...state.pending }; },
    get cursor() { return state.cursor; },
  };
  if (autoStart) start();
  return api;
}
