import { z } from 'zod';
import { crudPlugin } from '../lib/crud.js';

const dealBase = {
  client_id: z.string().nullable().optional(),
  lead_id: z.string().nullable().optional(),
  title: z.string().min(1).max(300),
  amount: z.coerce.number().int().min(0),
  currency: z.string().length(3).default('RUB'),
  stage: z.enum(['new', 'proposal', 'won', 'lost', 'closed']).optional(),
  closed_at: z.coerce.number().int().nullable().optional(),
};
export default async function dealRoutes(fastify) {
  // The crudPlugin registers its own preValidation hook *inside its scope*, so
  // sibling routes below (contacts, tags, subtasks, …) must require auth
  // explicitly — otherwise request.user is null and they 500 (and would be
  // effectively unauthenticated, an IDOR hole).
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });
  await fastify.register(
    crudPlugin({
      table: 'deals',
      columns: ['client_id', 'lead_id', 'title', 'amount', 'currency', 'stage', 'closed_at'],
      createSchema: z.object(dealBase),
      updateSchema: z.object(Object.fromEntries(Object.entries(dealBase).map(([k, v]) => [k, v.optional()]))),
      search: ['title'],
    })
  );
}
