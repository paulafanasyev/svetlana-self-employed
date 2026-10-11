/**
 * CRM Светланы — локальное хранилище (local-first), совместимое по формату
 * с CRM из Svetlana 2.0 (ключ `svetlana_crm_v1`, версия данных 1).
 *
 * Данные живут на устройстве пользователя: работают без сервера, переживают
 * перезапуск демо-сервера и переносятся резервной копией между Svetlana 2.0
 * и сайтом. Модуль не зависит от React и DOM — его покрывают unit-тесты.
 */

export const STORAGE_KEY = 'svetlana_crm_v1';
export const DATA_VERSION = 1;

export const CONTACT_STATUSES = {
  lead: 'Лид',
  client: 'Клиент',
  partner: 'Партнёр',
  other: 'Другое',
};

export const CONTACT_SOURCES = ['manual', 'phone', 'import', 'chat', 'site'];

export const DEAL_STAGES = [
  ['new', 'Новая'],
  ['qualified', 'Квалификация'],
  ['proposal', 'Предложение'],
  ['negotiation', 'Переговоры'],
  ['won', 'Выиграна'],
  ['lost', 'Проиграна'],
];
export const STAGE_LABELS = Object.fromEntries(DEAL_STAGES);
const STAGE_IDS = DEAL_STAGES.map(([id]) => id);
const CLOSED = new Set(['won', 'lost']);

/** Кто платит по сделке — от этого зависит ставка НПД (4% / 6%). */
export const PAYERS = {
  person: 'Физлицо',
  business: 'ИП или организация',
};
export const NPD_RATE = { person: 0.04, business: 0.06 };
/** Лимит дохода на НПД за календарный год (422-ФЗ, ст. 4). */
export const NPD_YEAR_LIMIT = 2_400_000;

export const ACTIVITY_TYPES = {
  note: 'Заметка',
  call: 'Звонок',
  meeting: 'Встреча',
  message: 'Сообщение',
  task: 'Задача',
};
const TOUCH_TYPES = new Set(['call', 'meeting', 'message']);

export const LIMITS = { csvBytes: 5 * 1024 * 1024, backupBytes: 20 * 1024 * 1024, listCap: 300 };

// ───────────────────────── helpers ─────────────────────────

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const uniq = (list) => [...new Set(list)];

export function splitList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v ?? '').trim()).filter(Boolean);
  return String(value ?? '').split(/[,;]/).map((v) => v.trim()).filter(Boolean);
}

/** Последние 10 цифр: +7 (912) 345-67-89 и 89123456789 совпадают. */
export function phoneKey(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function money(amount, currency = 'RUB') {
  try {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount) || 0);
  } catch {
    return `${Math.round(Number(amount) || 0)} ${currency}`;
  }
}

function makeId(prefix, clock) {
  return prefix + '_' + clock().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Защита от формул при открытии CSV в Excel / Google Таблицах. */
export function csvSafe(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const sep = (src.split('\n')[0].match(/;/g) || []).length > (src.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const CSV_HEADERS = {
  name: ['имя', 'фио', 'name', 'full name', 'контакт'],
  phones: ['телефон', 'телефоны', 'phone', 'phones', 'мобильный'],
  emails: ['e-mail', 'email', 'почта', 'emails'],
  company: ['компания', 'company', 'organization', 'организация'],
  position: ['должность', 'position', 'title'],
  status: ['статус', 'status'],
  tags: ['теги', 'tags'],
  notes: ['заметки', 'notes', 'комментарий'],
};

// ───────────────────────── sanitizers ─────────────────────────

function sanitizeContact(c) {
  if (!c || typeof c !== 'object' || !c.id || !str(c.name, 300)) return null;
  return {
    id: String(c.id),
    name: str(c.name, 300),
    phones: uniq(splitList(c.phones).map((p) => p.slice(0, 40))).slice(0, 20),
    emails: uniq(splitList(c.emails).map((e) => e.toLowerCase().slice(0, 200))).slice(0, 20),
    company: str(c.company, 300),
    position: str(c.position, 200),
    status: CONTACT_STATUSES[c.status] ? c.status : 'other',
    tags: uniq(splitList(c.tags).map((t) => t.slice(0, 60))).slice(0, 50),
    source: CONTACT_SOURCES.includes(c.source) ? c.source : 'manual',
    notes: String(c.notes ?? '').slice(0, 10000),
    ...(c.phoneContactId ? { phoneContactId: String(c.phoneContactId) } : {}),
    ...(c.serverId ? { serverId: String(c.serverId) } : {}),
    createdAt: Number(c.createdAt) || 0,
    updatedAt: Number(c.updatedAt) || Number(c.createdAt) || 0,
    ...(Number(c.lastContactAt) ? { lastContactAt: Number(c.lastContactAt) } : {}),
  };
}

function sanitizeDeal(d) {
  if (!d || typeof d !== 'object' || !d.id || !str(d.title, 300)) return null;
  const amount = Number(d.amount);
  const stage = STAGE_IDS.includes(d.stage) ? d.stage : 'new';
  return {
    id: String(d.id),
    title: str(d.title, 300),
    ...(d.contactId ? { contactId: String(d.contactId) } : {}),
    amount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
    currency: /^[A-Z]{3}$/.test(String(d.currency ?? '')) ? d.currency : 'RUB',
    stage,
    payer: PAYERS[d.payer] ? d.payer : 'person',
    receipt: Boolean(d.receipt),
    ...(Number(d.expectedClose) ? { expectedClose: Number(d.expectedClose) } : {}),
    createdAt: Number(d.createdAt) || 0,
    updatedAt: Number(d.updatedAt) || Number(d.createdAt) || 0,
    ...(CLOSED.has(stage) && Number(d.closedAt) ? { closedAt: Number(d.closedAt) } : {}),
  };
}

function sanitizeActivity(a) {
  if (!a || typeof a !== 'object' || !a.id || !str(a.text, 10000)) return null;
  return {
    id: String(a.id),
    type: ACTIVITY_TYPES[a.type] ? a.type : 'note',
    text: str(a.text, 10000),
    ...(a.contactId ? { contactId: String(a.contactId) } : {}),
    ...(a.dealId ? { dealId: String(a.dealId) } : {}),
    ...(Number(a.dueAt) ? { dueAt: Number(a.dueAt) } : {}),
    done: Boolean(a.done),
    createdAt: Number(a.createdAt) || 0,
    ...(a.done && Number(a.completedAt) ? { completedAt: Number(a.completedAt) } : {}),
  };
}

export function sanitizeData(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const contacts = (Array.isArray(src.contacts) ? src.contacts : []).map(sanitizeContact).filter(Boolean);
  const ids = new Set(contacts.map((c) => c.id));
  const deals = (Array.isArray(src.deals) ? src.deals : []).map(sanitizeDeal).filter(Boolean)
    .map((d) => (d.contactId && !ids.has(d.contactId) ? { ...d, contactId: undefined } : d))
    .map((d) => JSON.parse(JSON.stringify(d)));
  const dealIds = new Set(deals.map((d) => d.id));
  const activities = (Array.isArray(src.activities) ? src.activities : []).map(sanitizeActivity).filter(Boolean)
    .map((a) => ({ ...a, contactId: a.contactId && ids.has(a.contactId) ? a.contactId : undefined, dealId: a.dealId && dealIds.has(a.dealId) ? a.dealId : undefined }))
    .map((a) => JSON.parse(JSON.stringify(a)));
  return { version: DATA_VERSION, contacts, deals, activities };
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('__sv_probe', '1');
      localStorage.removeItem('__sv_probe');
      return localStorage;
    }
  } catch { /* приватный режим / запрет хранилища */ }
  return memoryStorage();
}

// ───────────────────────── store ─────────────────────────

export function createCrmStore({ storage = defaultStorage(), clock = () => Date.now() } = {}) {
  let data;
  try {
    data = sanitizeData(JSON.parse(storage.getItem(STORAGE_KEY) || 'null'));
  } catch {
    data = sanitizeData(null);
  }
  const listeners = new Set();
  let revision = 0;

  const commit = () => {
    revision += 1;
    try { storage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* квота — данные остаются в памяти */ }
    listeners.forEach((fn) => fn(revision));
  };

  const contactById = (id) => data.contacts.find((c) => c.id === id) || null;
  const dealById = (id) => data.deals.find((d) => d.id === id) || null;

  function findDuplicate({ phones = [], emails = [] }, exceptId) {
    const pk = new Set(splitList(phones).map(phoneKey).filter((k) => k.length >= 6));
    const ek = new Set(splitList(emails).map((e) => e.toLowerCase()));
    return data.contacts.find((c) => c.id !== exceptId && (
      c.phones.some((p) => pk.has(phoneKey(p))) || c.emails.some((e) => ek.has(e))
    )) || null;
  }

  const store = {
    get revision() { return revision; },
    get data() { return data; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // contacts
    getContact: contactById,
    findDuplicate,
    listContacts({ q = '', status = '', tag = '' } = {}) {
      const query = String(q).trim().toLowerCase();
      const qPhone = phoneKey(query);
      return data.contacts
        .filter((c) => !status || c.status === status)
        .filter((c) => !tag || c.tags.includes(tag))
        .filter((c) => !query
          || c.name.toLowerCase().includes(query)
          || c.company.toLowerCase().includes(query)
          || c.emails.some((e) => e.includes(query))
          || c.tags.some((t) => t.toLowerCase().includes(query))
          || (qPhone.length >= 3 && c.phones.some((p) => phoneKey(p).includes(qPhone))))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    },
    addContact(input, { checkDuplicates = true } = {}) {
      const name = str(input?.name, 300);
      if (!name) throw new Error('Имя контакта обязательно');
      if (checkDuplicates) {
        const dup = findDuplicate(input);
        if (dup) throw new Error(`Такой номер или e-mail уже есть у «${dup.name}»`);
      }
      const now = clock();
      const contact = sanitizeContact({ ...input, id: makeId('c', clock), name, status: input?.status || 'lead', source: input?.source || 'manual', createdAt: now, updatedAt: now });
      data.contacts.push(contact);
      commit();
      return contact;
    },
    updateContact(id, patch) {
      const cur = contactById(id);
      if (!cur) throw new Error('Контакт не найден');
      if (patch.name !== undefined && !str(patch.name, 300)) throw new Error('Имя контакта обязательно');
      const next = sanitizeContact({ ...cur, ...patch, id, createdAt: cur.createdAt, updatedAt: clock() });
      data.contacts = data.contacts.map((c) => (c.id === id ? next : c));
      commit();
      return next;
    },
    deleteContact(id) {
      data.contacts = data.contacts.filter((c) => c.id !== id);
      data.deals = data.deals.map((d) => (d.contactId === id ? JSON.parse(JSON.stringify({ ...d, contactId: undefined })) : d));
      data.activities = data.activities.map((a) => (a.contactId === id ? JSON.parse(JSON.stringify({ ...a, contactId: undefined })) : a));
      commit();
    },

    // deals
    getDeal: dealById,
    listDeals({ contactId } = {}) {
      return data.deals.filter((d) => !contactId || d.contactId === contactId).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    addDeal(input) {
      const title = str(input?.title, 300);
      if (!title) throw new Error('Название сделки обязательно');
      const amount = input?.amount === '' || input?.amount === undefined ? 0 : Number(String(input.amount).replace(',', '.').replace(/\s/g, ''));
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Сумма сделки должна быть неотрицательным числом');
      if (input?.contactId && !contactById(input.contactId)) throw new Error('Контакт не найден');
      const now = clock();
      const stage = STAGE_IDS.includes(input?.stage) ? input.stage : 'new';
      const deal = sanitizeDeal({ ...input, id: makeId('d', clock), title, amount, stage, createdAt: now, updatedAt: now, closedAt: CLOSED.has(stage) ? now : undefined });
      data.deals.push(deal);
      commit();
      return deal;
    },
    updateDeal(id, patch) {
      const cur = dealById(id);
      if (!cur) throw new Error('Сделка не найдена');
      const stage = patch.stage && STAGE_IDS.includes(patch.stage) ? patch.stage : cur.stage;
      const closedAt = CLOSED.has(stage) ? (CLOSED.has(cur.stage) ? cur.closedAt : clock()) : undefined;
      const next = sanitizeDeal({ ...cur, ...patch, id, stage, createdAt: cur.createdAt, updatedAt: clock(), closedAt });
      data.deals = data.deals.map((d) => (d.id === id ? next : d));
      commit();
      return next;
    },
    moveDeal(id, direction) {
      const cur = dealById(id);
      if (!cur) throw new Error('Сделка не найдена');
      const target = STAGE_IDS.includes(direction)
        ? direction
        : STAGE_IDS[Math.min(STAGE_IDS.length - 1, Math.max(0, STAGE_IDS.indexOf(cur.stage) + (direction === 'back' ? -1 : 1)))];
      return store.updateDeal(id, { stage: target });
    },
    deleteDeal(id) {
      data.deals = data.deals.filter((d) => d.id !== id);
      data.activities = data.activities.map((a) => (a.dealId === id ? JSON.parse(JSON.stringify({ ...a, dealId: undefined })) : a));
      commit();
    },

    // activities & tasks
    listActivities({ contactId, type, openTasks } = {}) {
      return data.activities
        .filter((a) => !contactId || a.contactId === contactId)
        .filter((a) => !type || a.type === type)
        .filter((a) => !openTasks || (a.type === 'task' && !a.done))
        .sort((a, b) => (openTasks || type === 'task'
          ? (a.done - b.done) || ((a.dueAt ?? Infinity) - (b.dueAt ?? Infinity))
          : b.createdAt - a.createdAt));
    },
    addActivity(input) {
      const text = str(input?.text, 10000);
      if (!text) throw new Error('Текст обязателен');
      if (input?.contactId && !contactById(input.contactId)) throw new Error('Контакт не найден');
      const now = clock();
      const activity = sanitizeActivity({ ...input, id: makeId('a', clock), text, done: false, createdAt: now });
      data.activities.push(activity);
      if (activity.contactId && TOUCH_TYPES.has(activity.type)) {
        data.contacts = data.contacts.map((c) => (c.id === activity.contactId ? { ...c, lastContactAt: now } : c));
      }
      commit();
      return activity;
    },
    setTaskDone(id, done) {
      data.activities = data.activities.map((a) => {
        if (a.id !== id) return a;
        const next = { ...a, done: Boolean(done) };
        if (done) next.completedAt = clock(); else delete next.completedAt;
        return next;
      });
      commit();
    },
    deleteActivity(id) {
      data.activities = data.activities.filter((a) => a.id !== id);
      commit();
    },

    // analytics
    stats(now = clock()) {
      const byStatus = Object.fromEntries(Object.keys(CONTACT_STATUSES).map((k) => [k, 0]));
      data.contacts.forEach((c) => { byStatus[c.status] += 1; });
      const byStage = Object.fromEntries(STAGE_IDS.map((k) => [k, { count: 0, amount: 0 }]));
      data.deals.forEach((d) => { byStage[d.stage].count += 1; byStage[d.stage].amount += d.amount; });
      const open = data.deals.filter((d) => !CLOSED.has(d.stage));
      const won = data.deals.filter((d) => d.stage === 'won');
      const lost = data.deals.filter((d) => d.stage === 'lost');
      const year = new Date(now).getFullYear();
      const wonThisYear = won.filter((d) => new Date(d.closedAt || d.updatedAt).getFullYear() === year);
      const yearIncome = wonThisYear.reduce((s, d) => s + d.amount, 0);
      const npdEstimate = wonThisYear.reduce((s, d) => s + d.amount * NPD_RATE[d.payer || 'person'], 0);
      const tasks = data.activities.filter((a) => a.type === 'task' && !a.done);
      return {
        contacts: data.contacts.length,
        byStatus,
        byStage,
        openDeals: open.length,
        pipelineValue: open.reduce((s, d) => s + d.amount, 0),
        wonDeals: won.length,
        wonValue: won.reduce((s, d) => s + d.amount, 0),
        lostDeals: lost.length,
        conversion: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : 0,
        openTasks: tasks.length,
        overdueTasks: tasks.filter((t) => t.dueAt && t.dueAt < now).length,
        yearIncome,
        npdEstimate: Math.round(npdEstimate),
        npdLimitShare: yearIncome / NPD_YEAR_LIMIT,
        receiptsMissing: won.filter((d) => !d.receipt).length,
      };
    },
    summaryText(now = clock()) {
      const s = store.stats(now);
      const tasks = store.listActivities({ openTasks: true }).slice(0, 3);
      const parts = [
        `В CRM ${s.contacts} контактов, из них клиентов ${s.byStatus.client}.`,
        `Открытых сделок ${s.openDeals} на ${money(s.pipelineValue)}.`,
        s.openTasks ? `Задач в работе ${s.openTasks}${s.overdueTasks ? `, просрочено ${s.overdueTasks}` : ''}.` : 'Открытых задач нет.',
      ];
      if (s.receiptsMissing) parts.push(`Не отмечены чеки по ${s.receiptsMissing} оплаченным сделкам — проверьте «Мой налог».`);
      if (tasks.length) parts.push('Ближайшие задачи: ' + tasks.map((t) => t.text).join('; ') + '.');
      return parts.join(' ');
    },

    // import / export
    exportJSON() { return JSON.stringify({ ...data, exportedAt: new Date(clock()).toISOString(), app: 'mir-samozanyatyh' }, null, 2); },
    importJSON(text) {
      if (String(text).length > LIMITS.backupBytes) throw new Error('Файл не похож на резервную копию CRM (неверный JSON или слишком большой)');
      let parsed;
      try { parsed = JSON.parse(text); } catch { throw new Error('Файл не похож на резервную копию CRM (неверный JSON или слишком большой)'); }
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.contacts)) throw new Error('Файл не похож на резервную копию CRM (неверный JSON или слишком большой)');
      data = sanitizeData(parsed);
      commit();
      return { contacts: data.contacts.length, deals: data.deals.length, activities: data.activities.length };
    },
    exportCSV() {
      const head = ['Имя', 'Телефоны', 'E-mail', 'Компания', 'Должность', 'Статус', 'Теги', 'Заметки'];
      const rows = store.listContacts().map((c) => [c.name, c.phones.join(', '), c.emails.join(', '), c.company, c.position, CONTACT_STATUSES[c.status], c.tags.join(', '), c.notes]);
      return '\uFEFF' + [head, ...rows].map((r) => r.map(csvSafe).join(',')).join('\r\n');
    },
    importCSV(text) {
      if (String(text).length > LIMITS.csvBytes) throw new Error('Файл больше 5 МБ');
      const rows = parseCsv(text);
      if (!rows.length) return { added: 0, merged: 0, skipped: 0 };
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const col = Object.fromEntries(Object.entries(CSV_HEADERS).map(([key, names]) => [key, header.findIndex((h) => names.includes(h))]));
      if (col.name < 0) throw new Error('В CSV нет колонки «Имя»');
      const statusByLabel = Object.fromEntries(Object.entries(CONTACT_STATUSES).map(([k, v]) => [v.toLowerCase(), k]));
      let added = 0; let merged = 0; let skipped = 0;
      const now = clock();
      for (const r of rows.slice(1)) {
        const get = (k) => (col[k] >= 0 ? String(r[col[k]] ?? '').replace(/^'(?=[=+\-@])/, '').trim() : '');
        const name = get('name');
        if (!name) { skipped += 1; continue; }
        const rec = { name, phones: splitList(get('phones')), emails: splitList(get('emails')), company: get('company'), position: get('position'), tags: splitList(get('tags')), notes: get('notes') };
        const status = statusByLabel[get('status').toLowerCase()] || (CONTACT_STATUSES[get('status')] ? get('status') : 'lead');
        const dup = findDuplicate(rec);
        if (dup) {
          const next = sanitizeContact({
            ...dup,
            phones: [...dup.phones, ...rec.phones],
            emails: [...dup.emails, ...rec.emails],
            company: dup.company || rec.company,
            position: dup.position || rec.position,
            tags: [...dup.tags, ...rec.tags],
            notes: dup.notes || rec.notes,
            updatedAt: now,
          });
          if (JSON.stringify({ ...next, updatedAt: 0 }) === JSON.stringify({ ...dup, updatedAt: 0 })) { skipped += 1; continue; }
          data.contacts = data.contacts.map((c) => (c.id === dup.id ? next : c));
          merged += 1;
        } else {
          data.contacts.push(sanitizeContact({ ...rec, status, id: makeId('c', clock), source: 'import', createdAt: now, updatedAt: now }));
          added += 1;
        }
      }
      commit();
      return { added, merged, skipped };
    },
    clear() {
      data = sanitizeData(null);
      commit();
    },
  };
  return store;
}

let shared = null;
/** Единый экземпляр для страниц кабинета. */
export function crmStore() {
  if (!shared) shared = createCrmStore();
  return shared;
}
