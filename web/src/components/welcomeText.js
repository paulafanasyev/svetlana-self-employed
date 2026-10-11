/** Тексты и знакомство Светланы (без React — покрыто unit-тестами). */
const SEEN_KEY = 'sv_welcome_v2';
const NAME_KEY = 'sv_visitor_name';

export const INTRO_TEXT =
  'Здравствуйте! Я Светлана, помощница «Мира Самозанятых». Как к вам обращаться?';

export function greetingFor(name) {
  const hello = name ? `Очень приятно, ${name}!` : 'Рада знакомству!';
  return (
    `${hello} Я помогу найти заказы и клиентов, посчитать налог на НПД, ` +
    'подготовить договор и вести клиентов в CRM. Спросите меня о чём угодно или начните бесплатно.'
  );
}

/** «анна-мария петрова» → «Анна-Мария Петрова»; мусор → '' */
export function normalizeName(raw) {
  const value = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!/^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё' -]{0,39}$/.test(value)) return '';
  return value
    .split(' ')
    .map((w) => w.split('-').map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p)).join('-'))
    .join(' ');
}

export function getVisitorName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}

export function saveVisitorName(name) {
  try {
    if (name) localStorage.setItem(NAME_KEY, name); else localStorage.removeItem(NAME_KEY);
  } catch { /* приватный режим */ }
  window.dispatchEvent(new CustomEvent('sv:name', { detail: name }));
}

export function openSvetlanaChat() {
  window.dispatchEvent(new CustomEvent('sv:open-chat'));
}

export function openSvetlanaWelcome() {
  window.dispatchEvent(new CustomEvent('sv:open-welcome'));
}

export function wasSeen() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}

export function markSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* приватный режим */ }
}
