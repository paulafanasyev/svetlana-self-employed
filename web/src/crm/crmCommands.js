/**
 * Команды Светланы для CRM на обычном русском языке (текстом или голосом).
 *
 * Разбор детерминированный и локальный: никакая модель не получает данные
 * клиентов. Любое изменение данных возвращается как «предложение», которое
 * пользователь подтверждает кнопкой (как ActionGate в Svetlana 2.0).
 */
import { money, STAGE_LABELS } from './crmStore.js';

const PHONE = /(\+?\d[\d\s()\-]{8,}\d)/;
const EMAIL = /([\w.+-]+@[\w-]+\.[\w.-]+)/;
const AMOUNT = /(\d[\d\s]*(?:[.,]\d+)?)\s*(тыс(?:\.|яч[аи]?)?|к(?=\s|$)|т\.?р\.?|₽|руб(?:лей|ля|ль)?\.?|р\.?)?/i;
const DAY = 86400000;

function dueFrom(text, now) {
  const t = text.toLowerCase();
  const base = new Date(now);
  base.setHours(9, 0, 0, 0);
  if (/послезавтра/.test(t)) return base.getTime() + 2 * DAY;
  if (/завтра/.test(t)) return base.getTime() + DAY;
  if (/сегодня/.test(t)) return base.getTime();
  const m = t.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : base.getFullYear();
    const d = new Date(year, Number(m[2]) - 1, Number(m[1]), 9, 0, 0, 0);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  return undefined;
}

function parseAmount(text) {
  const cleaned = text.replace(PHONE, ' ');
  const m = cleaned.match(AMOUNT);
  if (!m) return undefined;
  let n = Number(m[1].replace(/\s/g, '').replace(',', '.'));
  if (m[2] && /^(тыс|к|т)/i.test(m[2])) n *= 1000;
  return Number.isFinite(n) ? n : undefined;
}

const strip = (s) => s.replace(/\s+/g, ' ').replace(/^[\s,.:—-]+|[\s,.:—-]+$/g, '');

/**
 * @returns {null | {kind:'read'|'write', tool:string, args:object, title:string, fields:[string,string][]}}
 */
export function parseCommand(input, store, now = Date.now()) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const t = raw.toLowerCase().replace(/ё/g, 'е');

  if (/^(сводка|итоги|отчет|что у меня|как (у меня )?дела|статистика)/.test(t)) {
    return { kind: 'read', tool: 'crm_stats', args: {}, title: 'Сводка CRM', fields: [] };
  }

  let m = raw.match(/^(?:найди|найти|покажи|поиск)\s+(.+)/i);
  if (m) return { kind: 'read', tool: 'crm_find_contacts', args: { query: strip(m[1]) }, title: 'Поиск контактов', fields: [['Запрос', strip(m[1])]] };

  m = raw.match(/^(?:добавь|добавить|создай|создать|новый|новая|запиши)\s+(клиент[аы]?|контакт|лид[аы]?|партн[её]р[аы]?)\s+(.+)/i);
  if (m) {
    const kind = m[1].toLowerCase();
    let rest = m[2];
    const phone = rest.match(PHONE)?.[1];
    const email = rest.match(EMAIL)?.[1];
    if (phone) rest = rest.replace(phone, ' ');
    if (email) rest = rest.replace(email, ' ');
    const name = strip(rest.replace(/(^|\s)(телефон|тел\.?|почта|e-?mail)(?=\s|$)/gi, ' '));
    if (!name) return null;
    const status = kind.startsWith('клиент') ? 'client' : kind.startsWith('партн') ? 'partner' : 'lead';
    const args = { name, phones: phone ? [strip(phone)] : [], emails: email ? [email] : [], status, source: 'chat' };
    return { kind: 'write', tool: 'crm_add_contact', args, title: 'Добавить контакт?', fields: [['Имя', name], ['Статус', { client: 'Клиент', partner: 'Партнёр', lead: 'Лид' }[status]], ...(phone ? [['Телефон', strip(phone)]] : []), ...(email ? [['E-mail', email]] : [])] };
  }

  m = raw.match(/^(?:создай|создать|новая|добавь|добавить|открой)?\s*сделк[уа]\s+(.+)/i);
  if (m) {
    let rest = m[1];
    let contact = null;
    const who = rest.match(/\s(?:для|с|от|клиент[ау]?)\s+([А-ЯЁA-Z][\wА-Яа-яЁё-]+(?:\s+[А-ЯЁA-Z][\wА-Яа-яЁё-]+)?)\s*$/);
    if (who && store) {
      contact = store.listContacts({ q: who[1].split(' ')[0] })[0] || null;
      if (contact) rest = rest.slice(0, who.index);
    }
    const amount = parseAmount(rest) ?? 0;
    const title = strip(rest.replace(AMOUNT, ' ').replace(/\s(на|за|сумма)\s*$/i, ' ').replace(/\s(на|за)\s/gi, ' '));
    if (!title) return null;
    const payer = /(ооо|(^|\s)ип(?=\s|$)|организац|компани)/i.test(raw) ? 'business' : 'person';
    return { kind: 'write', tool: 'crm_create_deal', args: { title, amount, contactId: contact?.id, payer }, title: 'Создать сделку?', fields: [['Название', title], ['Сумма', money(amount)], ['Этап', STAGE_LABELS.new], ['Клиент', contact?.name || 'Без контакта'], ['Плательщик', payer === 'business' ? 'ИП или организация (НПД 6%)' : 'Физлицо (НПД 4%)']] };
  }

  m = raw.match(/^(?:задача|напомни(?:\s+мне)?|добавь задачу|создай задачу|нужно|надо)\s*:?\s+(.+)/i);
  if (m) {
    const dueAt = dueFrom(m[1], now);
    const text = strip(m[1].replace(/(^|\s)(послезавтра|завтра|сегодня)(?=\s|$)/gi, ' ').replace(/(^|\s)(до|к)\s+\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?/gi, ' ').replace(/\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?/g, ' '));
    if (!text) return null;
    return { kind: 'write', tool: 'crm_add_task', args: { type: 'task', text, dueAt }, title: 'Добавить задачу?', fields: [['Текст', text], ['Срок', dueAt ? new Date(dueAt).toLocaleDateString('ru-RU') : 'без срока']] };
  }

  return null;
}

/** Выполнить команду. Изменения — только после подтверждения пользователем. */
export function runCommand(cmd, store, { confirmed = false } = {}) {
  if (!cmd) return { ok: false, text: 'Не поняла команду. Попробуйте: «добавь клиента Анна +7 900 000-00-00», «сделка маникюр 2500 для Анна», «напомни завтра отправить счёт» или «сводка».' };
  if (cmd.kind === 'write' && !confirmed) return { ok: false, needsConfirm: true, text: 'Нужно подтверждение.' };
  switch (cmd.tool) {
    case 'crm_stats':
      return { ok: true, text: store.summaryText() };
    case 'crm_find_contacts': {
      const found = store.listContacts({ q: cmd.args.query }).slice(0, 5);
      return { ok: true, text: found.length ? 'Нашла: ' + found.map((c) => c.name + (c.phones[0] ? ` (${c.phones[0]})` : '')).join(', ') + '.' : 'Никого не нашла по запросу «' + cmd.args.query + '».', ids: found.map((c) => c.id) };
    }
    case 'crm_add_contact': {
      const c = store.addContact(cmd.args);
      return { ok: true, text: `Готово: «${c.name}» добавлен(а) в CRM.`, id: c.id };
    }
    case 'crm_create_deal': {
      const d = store.addDeal(cmd.args);
      return { ok: true, text: `Готово: сделка «${d.title}» на ${money(d.amount)} создана.`, id: d.id };
    }
    case 'crm_add_task': {
      const a = store.addActivity(cmd.args);
      return { ok: true, text: `Готово: задача «${a.text}» добавлена${a.dueAt ? ' на ' + new Date(a.dueAt).toLocaleDateString('ru-RU') : ''}.`, id: a.id };
    }
    default:
      return { ok: false, text: 'Эта команда не разрешена.' };
  }
}
