/**
 * Invoices (§15) — list/get/create/update + mark-paid.
 */
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { auditRequest } from '../plugins/audit.js';
import { sendError, validateOrThrow } from '../lib/http.js';
import { crudPlugin } from '../lib/crud.js';

const invoiceBase = {
  client_id: z.string().nullable().optional(),
  contract_id: z.string().nullable().optional(),
  number: z.string().min(1).max(60),
  amount: z.coerce.number().int().min(0),
  currency: z.string().length(3).default('RUB'),
  status: z.enum(['draft', 'sent', 'paid', 'partial', 'cancelled', 'refunded']).optional(),
  due_at: z.coerce.number().int().nullable().optional(),
};

export default async function invoiceRoutes(fastify) {
  // The crudPlugin registers its own preValidation hook *inside its scope*, so
  // sibling routes below must require auth explicitly — otherwise request.user
  // is null and these routes 500 (and are effectively unauthenticated).
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });

  await fastify.register(
    crudPlugin({
      table: 'invoices',
      columns: ['client_id', 'contract_id', 'number', 'amount', 'currency', 'status', 'due_at'],
      createSchema: z.object(invoiceBase),
      updateSchema: z.object(Object.fromEntries(Object.entries(invoiceBase).map(([k, v]) => [k, v.optional()]))),
      search: ['number'],
    })
  );

  fastify.post('/:id/pay', async (request, reply) => {
    const inv = db().prepare('SELECT * FROM invoices WHERE id = ?').get(request.params.id);
    if (!inv || inv.owner_id !== request.user.id) return sendError(reply, 404, 'not_found', 'Счёт не найден');
    db()
      .prepare("UPDATE invoices SET status = 'paid', paid_at = unixepoch(), updated_at = unixepoch() WHERE id = ?")
      .run(inv.id);
    auditRequest(request, 'invoice_paid', 'invoice', inv.id, { amount: inv.amount });
    reply.send(db().prepare('SELECT * FROM invoices WHERE id = ?').get(inv.id));
  });

  // Analytics: revenue by period for the dashboard.
  fastify.get('/analytics/revenue', async (request, reply) => {
    const from = Number(request.query?.from ?? 0);
    const to = Number(request.query?.to ?? Math.floor(Date.now() / 1000));
    const rows = db()
      .prepare(`SELECT status, currency, SUM(amount) AS total, COUNT(*) AS n
                FROM invoices WHERE owner_id = ? AND paid_at BETWEEN ? AND ?
                GROUP BY status, currency`)
      .all(request.user.id, from, to);
    reply.send({ data: rows });
  });
}
