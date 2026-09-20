/**
 * PaymentProvider abstraction (§26).
 *
 * Every provider implements one method:
 *
 *   charge({ amount, currency, idempotencyKey, description, returnUrl })
 *     -> { success, providerTransactionId, errorMessage?, evidence? }
 *
 * Adding a provider = adding a case here + configuring credentials in env.
 * Nothing about provider internals lives in the frontend or Android.
 *
 * `test` provider is a deterministic, clearly-labelled sandbox: it approves
 * amounts below a ceiling and declines above it, so failure paths are
 * exercisable in development. It is refused in production by the route layer.
 */
import { config } from '../config.js';

class TestProvider {
  constructor() {
    this.name = 'test';
    this.mode = 'sandbox';
    this.ceiling = 100000; // amounts above this decline, to exercise failure paths
  }
  get configured() {
    return true;
  }
  async charge({ amount, currency, idempotencyKey, description }) {
    // Deterministic pseudo-random txn id from the key (stable on replay).
    const txn = `TEST-${Math.abs(hash(idempotencyKey + amount)).toString(16).slice(0, 12).toUpperCase()}`;
    if (amount > this.ceiling) {
      return {
        success: false,
        state: 'failed',
        providerTransactionId: null,
        errorMessage: `Тестовый провайдер отклоняет суммы выше ${this.ceiling} (симуляция отказа)`,
        evidence: { provider: 'test', simulated: true, ceiling: this.ceiling, idempotencyKey },
      };
    }
    return {
      success: true,
      state: 'succeeded',
      providerTransactionId: txn,
      evidence: {
        provider: 'test',
        simulated: true,
        amount,
        currency,
        description,
        at: new Date().toISOString(),
      },
    };
  }
}

class YooKassaProvider {
  constructor() {
    this.name = 'yookassa';
    this.mode = 'live';
    this.shopId = config.YOOKASSA_SHOP_ID;
    this.secret = config.YOOKASSA_SECRET;
    this.base = 'https://api.yookassa.ru/v3';
  }
  get configured() {
    return Boolean(this.shopId && this.secret);
  }
  async charge({ amount, currency, idempotencyKey, description, returnUrl }) {
    if (!this.configured) throw new Error('YooKassa не настроен (YOOKASSA_SHOP_ID / YOOKASSA_SECRET)');
    const auth = Buffer.from(`${this.shopId}:${this.secret}`).toString('base64');
    const res = await fetch(`${this.base}/payments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${auth}`,
        'Idempotence-Key': idempotencyKey,
      },
      body: JSON.stringify({
        amount: { value: (amount / 100).toFixed(2), currency: currency.toUpperCase() },
        capture: true,
        confirmation: { type: 'redirect', return_url: returnUrl ?? config.WEB_ORIGIN },
        description: String(description ?? '').slice(0, 128),
      }),
    });
    const body = await res.json().catch(() => ({}));
    const state =
      body.status === 'succeeded'
        ? 'succeeded'
        : ['pending', 'waiting_for_capture'].includes(body.status)
          ? 'pending'
          : 'failed';
    return {
      success: state === 'succeeded',
      state,
      providerTransactionId: body.id ?? null,
      errorMessage: state === 'failed' ? (body.description ?? `HTTP ${res.status}`) : null,
      evidence: { provider: 'yookassa', raw_status: body.status ?? null, http_status: res.status },
    };
  }
}

class SbpProvider {
  constructor() {
    this.name = 'sbp';
    this.mode = 'live';
  }
  get configured() {
    // SBP via a bank gateway would need merchant credentials; not configured here.
    return false;
  }
  async charge() {
    throw new Error('SBP-провайдер не настроен (требуется банк-эквайер)');
  }
}

const REGISTRY = { test: () => new TestProvider(), yookassa: () => new YooKassaProvider(), sbp: () => new SbpProvider() };
const _cache = {};

export function resolvePaymentProvider(name) {
  if (!REGISTRY[name]) return null;
  if (!_cache[name]) _cache[name] = REGISTRY[name]();
  return _cache[name];
}

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return h | 0;
}
