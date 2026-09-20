/**
 * AI provider abstraction (§30).
 *
 *   Atria | OpenAI | OpenRouter | local
 *
 * One uniform `chat()` contract with:
 *  - fallback (provider order, skipping unconfigured providers)
 *  - retry with exponential backoff
 *  - timeout via AbortController
 *  - cost + token tracking persisted on ai_messages
 *
 * The `local` provider is a deterministic, rule-based planner — not an LLM.
 * It exists so the full Светлана pipeline (intent → tools → verification)
 * works end-to-end offline, and it is always honestly labelled as `local`
 * with zero cost. When a real provider key is configured, it takes priority.
 */
import { config } from '../config.js';

/** OpenAI-compatible chat completions client (Atria / OpenAI / OpenRouter). */
class OpenAICompatibleProvider {
  constructor({ name, baseUrl, apiKey, model, costPer1kIn = 0, costPer1kOut = 0 }) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.model = model;
    this.costPer1kIn = costPer1kIn;
    this.costPer1kOut = costPer1kOut;
    this.timeoutMs = config.AI_TIMEOUT_MS;
  }
  get configured() {
    return Boolean(this.apiKey);
  }
  async chat({ messages, tools = [], temperature = 0.4, maxTokens = 1500, signal }) {
    if (!this.configured) throw new Error(`${this.name} not configured`);
    const body = {
      model: this.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };
    if (tools.length) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      body.tool_choice = 'auto';
    }
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${this.name} HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    const choice = json.choices?.[0];
    const msg = choice?.message ?? {};
    const toolCalls = (msg.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function?.name,
      args: safeParse(tc.function?.arguments),
    }));
    return {
      provider: this.name,
      model: this.model,
      content: msg.content ?? '',
      toolCalls,
      finishReason: choice?.finish_reason ?? 'stop',
      tokensIn: json.usage?.prompt_tokens ?? 0,
      tokensOut: json.usage?.completion_tokens ?? 0,
      costRub:
        ((json.usage?.prompt_tokens ?? 0) / 1000) * this.costPer1kIn +
        ((json.usage?.completion_tokens ?? 0) / 1000) * this.costPer1kOut,
    };
  }
}

/**
 * Deterministic local planner. Parses Russian intent phrases into tool calls
 * using explicit rules — no statistics, no hallucinated abilities. It only
 * ever calls tools it actually knows, and always reports what it did.
 */
class LocalProvider {
  constructor() {
    this.name = 'local';
    this.model = 'rules-v1';
  }
  get configured() {
    return true;
  }
  async chat({ messages, tools = [] }) {
    // Continuation round: a tool result is already the last message in the
    // transcript. The local planner is single-step per user turn, so it must
    // stop here. Without this guard it re-plans the identical call on every
    // round (the last *user* message never changes) and loops until
    // MAX_ROUNDS, causing duplicate real side effects — e.g. 6 identical
    // clients created from one request.
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'tool') {
      return {
        provider: 'local',
        model: this.model,
        content: '',
        toolCalls: [],
        finishReason: 'stop',
        tokensIn: 0,
        tokensOut: 0,
        costRub: 0,
      };
    }

    const last = [...messages].reverse().find((m) => m.role === 'user');
    const text = String(last?.content ?? '');
    const toolNames = new Set(tools.map((t) => t.name));

    const plan = planLocal(text, toolNames, messages);
    const content = plan.toolCall
      ? plan.announce
      : plan.fallback;

    return {
      provider: 'local',
      model: this.model,
      content,
      toolCalls: plan.toolCall ? [{ id: `call_${Date.now()}`, name: plan.toolCall.name, args: plan.toolCall.args }] : [],
      finishReason: plan.toolCall ? 'tool_calls' : 'stop',
      tokensIn: Math.ceil(text.length / 4),
      tokensOut: Math.ceil((content || '').length / 4),
      costRub: 0,
    };
  }
}

function planLocal(text, toolNames, messages = []) {
  const t = text.toLowerCase();
  const has = (n) => toolNames.has(n);

  // Document pipeline continuation (§16): resolve the document the user is
  // referring to — either an explicit id in the message, or the one most
  // recently touched in this conversation.
  const activeDocId = explicitDocId(text) ?? lastDocumentId(messages);
  if (activeDocId) {
    if (has('documents.set_data') && /заполни|данны|внеси|укажи/.test(t)) {
      const data = parseKvPairs(text);
      if (Object.keys(data).length) {
        return {
          toolCall: { name: 'documents.set_data', args: { document_id: activeDocId, data } },
          announce: 'Заполняю данные документа…',
        };
      }
    }
    if (has('documents.generate') && /сгенерируй|сделай предпросмотр|предпросмотр|собери/.test(t)) {
      return {
        toolCall: { name: 'documents.generate', args: { document_id: activeDocId } },
        announce: 'Генерирую документ для предпросмотра…',
      };
    }
    if (has('documents.approve') && /утверди|сохрани|подтверди документ|финализ/.test(t)) {
      return {
        toolCall: { name: 'documents.approve', args: { document_id: activeDocId } },
        announce: 'Утверждаю документ и создаю файл…',
      };
    }
  }

  // CRM: client
  if (has('crm.create_client') && /(создай|добавь|заведи).*клиент|клиент.*(создай|добавь|заведи)|занеси клиент/.test(t)) {
    const name = extractName(text) || 'Новый клиент';
    return {
      toolCall: { name: 'crm.create_client', args: { name } },
      announce: `Создаю клиента «${name}» в CRM…`,
    };
  }
  // Tasks
  if (has('tasks.create') && /(создай|поставь|добавь).*задач/.test(t)) {
    return {
      toolCall: { name: 'tasks.create', args: { title: text.replace(/.*задач[уаие]?:?\s*/i, '').slice(0, 200) || 'Новая задача' } },
      announce: 'Создаю задачу…',
    };
  }
  // Reminders: «напомни завтра в 10 позвонить клиенту»
  if (has('calendar.remind') && /напомни/.test(t)) {
    const at = resolveReminderTime(t);
    const message = text.replace(/.*напомни[^ ]*\s*/i, '').trim() || 'Напоминание';
    return {
      toolCall: { name: 'calendar.remind', args: { message, remind_at: at, when: whenLabel(t) } },
      announce: `Ставлю напоминание: «${message}».`,
    };
  }
  // Grants
  if (has('grants.search') && /(грант|субсиди|соцконтракт|поддержк|льготн)/.test(t)) {
    return {
      toolCall: { name: 'grants.search', args: { q: text } },
      announce: 'Подбираю подходящие гранты и программы поддержки…',
    };
  }
  // Marketplace / clients search
  if (has('marketplace.search_projects') && /(найди|поиск|ищи).*(проект|заказ|клиент|работ)/.test(t)) {
    return {
      toolCall: { name: 'marketplace.search_projects', args: { q: text } },
      announce: 'Ищу подходящие проекты и заказы…',
    };
  }
  // Vacancies
  if (has('vacancies.search') && /(ваканси|работа|ищу работу)/.test(t)) {
    return {
      toolCall: { name: 'vacancies.search', args: { q: text } },
      announce: 'Ищу вакансии…',
    };
  }
  // Documents
  if (has('documents.create') && /(договор|акт|счёт|счет|кп|коммерческ|оферта|nda|нд[а]|техническ|тз)/.test(t)) {
    const kind = detectDocKind(t);
    return {
      toolCall: { name: 'documents.create', args: { kind, title: docTitle(kind) } },
      announce: `Готовлю ${docTitle(kind).toLowerCase()}. Ответьте на несколько вопросов, чтобы заполнить его корректно.`,
    };
  }
  // Taxes / FNS — routed to RAG so answers are cited, never invented
  if (has('rag.ask') && /(налог|фнс|нпд|самозанят|патент|ип|страх|взнос|декларац|чек|касс)/.test(t)) {
    return {
      toolCall: { name: 'rag.ask', args: { question: text } },
      announce: 'Ищу официальный ответ по налогам и законодательству…',
    };
  }
  return {
    fallback:
      'Я — Светлана, ваш AI-оператор. Я могу: завести клиента или задачу в CRM, поставить напоминание, найти гранты, вакансии и заказы, подготовить договор/акт/счёт/КП, ответить по налогам и самозанятым со ссылками на источники. Опишите задачу — я её выполню и подтвержу результат.',
  };
}

function extractName(text) {
  // Quoted names win: «ООО Вектор», "ИП Иванов".
  const quoted = /[«"]([^»"]{2,80})[»"]/.exec(text);
  if (quoted) return quoted[1].trim();

  // Otherwise take what follows the word "клиент…" up to a few words. The
  // first word may be an organisational form in all caps (ООО / ИП / АО /
  // ПАО), so allow uppercase letters throughout, not just the first char.
  const m = /клиент[а-яё]*\s*[:,—-]?\s*([A-ZА-ЯЁ][A-Za-zА-Яа-яЁё0-9.\-]*(?:\s+[A-Za-zА-Яа-яЁё0-9.\-]+){0,4})/iu.exec(text);
  if (!m) return null;
  const name = m[1]
    .replace(/[.,;:!?]+$/, '')
    .replace(/\s+(?:пожалуйста|плиз|в\s+crm|в\s+баз[уе]|сейчас)$/i, '')
    .trim();
  return name.length >= 2 && name.length <= 80 ? name : null;
}

/** An explicit document id mentioned by the user (nanoid or uuid). */
function explicitDocId(text) {
  const m = /(?:документ[а-я]*|id)\s*[:—-]?\s*([A-Za-z0-9_-]{15,36})/iu.exec(text);
  if (m) return m[1];
  const bare = /\b([A-Za-z0-9_-]{21})\b/.exec(text);
  return bare ? bare[1] : null;
}

/** Walk the transcript backwards for the most recent document we touched. */
function lastDocumentId(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'tool' || !m.content || !String(m.name ?? '').startsWith('documents.')) continue;
    const parsed = safeJson(m.content);
    const id = parsed?.result?.id;
    if (id && /^[A-Za-z0-9_-]{15,36}$/.test(id)) return id;
  }
  return null;
}

/** Parse `ключ=значение, ключ2=значение2` pairs from a message. */
function parseKvPairs(text) {
  const out = {};
  const re = /([a-zа-яё_0-9]{2,40})\s*=\s*([^,;\n]{1,200})/giu;
  let m;
  while ((m = re.exec(text))) {
    const key = m[1].toLowerCase().replace(/\s+/g, '_');
    const value = m[2].trim();
    out[key] = value;
  }
  return out;
}

function safeJson(s) {
  try {
    return typeof s === 'string' ? JSON.parse(s) : s;
  } catch {
    return null;
  }
}

function resolveReminderTime(t) {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const m = /(\d{1,2}):?(\d{2})?/.exec(t);
  const hour = m ? Number(m[1]) : 10;
  const min = m && m[2] ? Number(m[2]) : 0;
  const target = /завтра/.test(t) ? tomorrow : now;
  target.setHours(hour, min, 0, 0);
  if (!/завтра/.test(t) && target.getTime() < Date.now()) target.setDate(target.getDate() + 1);
  return Math.floor(target.getTime() / 1000);
}
function whenLabel(t) {
  if (/послезавтра/.test(t)) return 'послезавтра';
  if (/завтра/.test(t)) return 'завтра';
  if (/сегодня/.test(t)) return 'сегодня';
  return 'в ближайшее время';
}
function detectDocKind(t) {
  if (/договор/.test(t)) return 'contract';
  if (/акт/.test(t)) return 'act';
  if (/сч[её]т/.test(t)) return 'invoice';
  if (/коммерческ|\bкп\b/.test(t)) return 'kp';
  if (/оферта/.test(t)) return 'offer';
  if (/nda|нд[а]/.test(t)) return 'nda';
  if (/техническ|\bтз\b/.test(t)) return 'tz';
  if (/приложени/.test(t)) return 'appendix';
  return 'other';
}
function docTitle(kind) {
  return { contract: 'Договор оказания услуг', act: 'Акт сдачи-приёмки', invoice: 'Счёт на оплату',
    kp: 'Коммерческое предложение', offer: 'Публичная оферта', nda: 'Соглашение о неразглашении',
    tz: 'Техническое задание', appendix: 'Приложение к договору', other: 'Документ' }[kind] || 'Документ';
}

function safeParse(s) {
  if (!s) return {};
  try {
    return typeof s === 'string' ? JSON.parse(s) : s;
  } catch {
    return {};
  }
}

export function availableProviders() {
  return PROVIDERS.filter((p) => p.configured);
}

const PROVIDERS = [
  new OpenAICompatibleProvider({
    name: 'atria',
    baseUrl: config.ATRIA_BASE_URL,
    apiKey: config.ATRIA_API_KEY,
    model: config.ATRIA_MODEL,
    costPer1kIn: 0.05,
    costPer1kOut: 0.15,
  }),
  new OpenAICompatibleProvider({
    name: 'openrouter',
    baseUrl: config.OPENROUTER_BASE_URL,
    apiKey: config.OPENROUTER_API_KEY,
    model: config.OPENROUTER_MODEL,
    costPer1kIn: 0.03,
    costPer1kOut: 0.09,
  }),
  new OpenAICompatibleProvider({
    name: 'openai',
    baseUrl: config.OPENAI_BASE_URL,
    apiKey: config.OPENAI_API_KEY,
    model: config.OPENAI_MODEL,
    costPer1kIn: 0.15,
    costPer1kOut: 0.60,
  }),
  new LocalProvider(),
];

/** Router: first configured provider in the configured order wins. */
export function primaryProvider() {
  const order = config.AI_PROVIDER_ORDER.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const name of order) {
    const p = PROVIDERS.find((x) => x.name === name);
    if (p?.configured) return p;
  }
  return PROVIDERS.find((p) => p.name === 'local');
}

/**
 * chat() with fallback, retry, and timeout.
 * Returns { ...result, provider, attempts }.
 */
export async function chatWithFallback(params, { retries = config.AI_MAX_RETRIES } = {}) {
  const order = config.AI_PROVIDER_ORDER.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((n) => PROVIDERS.find((p) => p.name === n))
    .filter((p) => p?.configured);
  const candidates = order.length ? order : [PROVIDERS.find((p) => p.name === 'local')];

  let lastError = null;
  for (const provider of candidates) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.AI_TIMEOUT_MS);
      try {
        const result = await provider.chat({ ...params, signal: controller.signal });
        clearTimeout(timer);
        return { ...result, provider: provider.name, attempts: attempt + 1, fellBack: attempt > 0 };
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        const isAbort = err.name === 'AbortError';
        if (attempt < retries && !isAbort) {
          await sleep(400 * 2 ** attempt);
          continue;
        }
        break; // try the next provider
      }
    }
  }
  const e = new Error(`Все AI-провайдеры недоступны: ${lastError?.message ?? 'unknown'}`);
  e.lastError = lastError;
  throw e;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
