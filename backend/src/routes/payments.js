/**
 * Payments (§26): PaymentProvider abstraction + idempotent charges.
 *
 *   POST /payments/charge  { idempotency_key, order_id|invoice_id, provider? }
 *
 * The idempotency key is UNIQUE in the DB: the second attempt with the same
 * key returns the first result instead of charging again. Commission (§25) is
 * computed from the live system_config value and split into platform_fee /
 * seller_amount, both persisted on the payment as immutable evidence.
 *
 * The 'test' provider is refused in production (§54: no fake payments).
 */
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { config } from '../config.js';
import { auditRequest } from '../plugins/audit.js';
import { sendError, validateOrThrow } from '../lib/http.js';
import { resolvePaymentProvider } from '../payments/providers.js';
import { getCommissionPercent } from '../payments/commission.js';

const chargeSchema = z.object({
  idempotency_key: z.string().min(8).max(120),
  order_id: z.string().optional(),
  invoice_id: z.string().optional(),
  provider: z.string().optional(),
  return_url: z.string().url().optional(),
});

export default async function paymentRoutes(fastify) {
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });

  fastify.get('/providers', async () => {
    return { data: availableProviderInfo() };
  });

  fastify.post('/charge', async (request, reply) => {
    const body = validateOrThrow(chargeSchema, request.body, reply);
    if (!body) return;
    if (!body.order_id && !body.invoice_id) {
      return sendError(reply, 400, 'validation_error', 'Укажите order_id или invoice_id');
    }

    // Idempotency: replay returns the stored outcome.
    const existing = db()
      .prepare('SELECT * FROM payments WHERE idempotency_key = ?')
      .get(body.idempotency_key);
    if (existing) {
      return reply.send({
        ...existing,
        idempotent_replay: true,
        status: existing.status,
      });
    }

    let amount = 0;
    let currency = 'RUB';
    let sellerId = null;
    let payerId = request.user.id;
    if (body.order_id) {
      const order = db().prepare('SELECT * FROM orders WHERE id = ?').get(body.order_id);
      if (!order) return sendError(reply, 404, 'not_found', 'Заказ не найден');
      // The buyer pays; the seller receives.
      if (order.buyer_id !== request.user.id && order.seller_id !== request.user.id) {
        return sendError(reply, 403, 'forbidden', 'Нет доступа к заказу');
      }
      amount = order.amount;
      currency = order.currency;
      sellerId = order.seller_id;
      payerId = order.buyer_id;
    } else {
      const inv = db().prepare('SELECT * FROM invoices WHERE id = ?').get(body.invoice_id);
      if (!inv || inv.owner_id !== request.user.id) {
        return sendError(reply, 404, 'not_found', 'Счёт не найден');
      }
      amount = inv.amount;
      currency = inv.currency;
      sellerId = inv.owner_id;
    }
    if (amount <= 0) return sendError(reply, 400, 'validation_error', 'Сумма должна быть положительной');

    const providerName = body.provider ?? config.PAYMENT_PROVIDER;
    if (config.isProd && providerName === 'test') {
      return sendError(reply, 400, 'misconfigured', 'Тестовый провайдер недоступен в production');
    }
    const provider = resolvePaymentProvider(providerName);
    if (!provider) return sendError(reply, 400, 'unknown_provider', `Провайдер ${providerName} не настроен`);

    const commissionPercent = body.order_id
      ? db().prepare('SELECT commission_rate FROM orders WHERE id = ?').get(body.order_id)?.commission_rate ?? getCommissionPercent()
      : getCommissionPercent();
    const platformFee = Math.round((amount * commissionPercent) / 100);
    const sellerAmount = amount - platformFee;

    const paymentId = nanoid();
    db()
      .prepare(`INSERT INTO payments (id, owner_id, invoice_id, order_id, idempotency_key, provider,
                                       amount, currency, platform_fee, seller_amount, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`)
      .run(paymentId, payerId, body.invoice_id ?? null, body.order_id ?? null, body.idempotency_key,
        provider.name, amount, currency, platformFee, sellerAmount);

    try {
      const result = await provider.charge({
        amount,
        currency,
        idempotencyKey: body.idempotency_key,
        description: `Оплата заказа ${body.order_id ?? body.invoice_id}`,
        returnUrl: body.return_url,
      });

      db().transaction(() => {
        db()
          .prepare(`UPDATE payments SET status = ?, provider_txn_id = ?, evidence = ?, failure_reason = ?, updated_at = unixepoch()
                    WHERE id = ?`)
          .run(
            result.success ? 'succeeded' : 'failed',
            result.providerTransactionId ?? null,
            JSON.stringify(result.evidence ?? {}),
            result.success ? null : (result.errorMessage ?? null),
            paymentId
          );
        if (result.success && body.order_id) {
          db()
            .prepare("UPDATE orders SET status = 'paid', updated_at = unixepoch() WHERE id = ?")
            .run(body.order_id);
          // Seller balance books the net amount (§25 payout side).
          db()
            .prepare(`INSERT INTO seller_balances (user_id, available, currency) VALUES (?, ?, ?)
                      ON CONFLICT(user_id) DO UPDATE SET available = available + ?, updated_at = unixepoch()`)
            .run(sellerId, sellerAmount, currency, sellerAmount);
        }
        if (result.success && body.invoice_id) {
          db()
            .prepare("UPDATE invoices SET status = 'paid', paid_at = unixepoch(), updated_at = unixepoch() WHERE id = ?")
            .run(body.invoice_id);
        }
      });

      auditRequest(request, result.success ? 'payment_succeeded' : 'payment_failed', 'payment', paymentId, {
        amount, provider: provider.name, commission_percent: commissionPercent,
      });

      if (!result.success) {
        return sendError(reply, 402, 'payment_failed', result.errorMessage ?? 'Платёж не прошёл', {
          status: 'FAILED',
          payment_id: paymentId,
        });
      }
      return reply.send(db().prepare('SELECT * FROM payments WHERE id = ?').get(paymentId));
    } catch (err) {
      db()
        .prepare("UPDATE payments SET status = 'failed', failure_reason = ?, updated_at = unixepoch() WHERE id = ?")
        .run(err.message, paymentId);
      request.log.error({ err }, 'payment provider error');
      return sendError(reply, 502, 'payment_error', `Ошибка платёжного провайдера: ${err.message}`, {
        status: 'FAILED',
        payment_id: paymentId,
      });
    }
  });

  fastify.get('/', async (request, reply) => {
    const { limit, offset } = validateOrThrow(
      z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).default(0) }),
      request.query,
      reply
    ) ?? { limit: 20, offset: 0 };
    const rows = db()
      .prepare('SELECT * FROM payments WHERE owner_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(request.user.id, limit, offset);
    return { data: rows, limit, offset };
  });

  fastify.get('/:id', async (request, reply) => {
    const row = db().prepare('SELECT * FROM payments WHERE id = ?').get(request.params.id);
    if (!row || row.owner_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Платёж не найден');
    return row;
  });

  // Seller dashboard (§25): balance + payout history.
  fastify.get('/balance/summary', async (request, reply) => {
    const balance = db().prepare('SELECT * FROM seller_balances WHERE user_id = ?').get(request.user.id) ?? {
      user_id: request.user.id, available: 0, in_dispute: 0, paid_out: 0, currency: 'RUB',
    };
    const payouts = db()
      .prepare('SELECT * FROM payouts WHERE seller_id = ? ORDER BY created_at DESC LIMIT 20')
      .all(request.user.id);
    return { balance, payouts };
  });
}

function availableProviderInfo() {
  const list = [];
  for (const name of ['test', 'yookassa', 'sbp']) {
    const p = resolvePaymentProvider(name);
    if (p) list.push({ name: p.name, configured: p.configured, mode: p.mode });
  }
  return list;
}
