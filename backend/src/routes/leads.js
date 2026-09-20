import { z } from 'zod';
import { crudPlugin } from '../lib/crud.js';

const leadBase = {
  client_id: z.string().nullable().optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(8000).nullable().optional(),
  value: z.coerce.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).default('RUB'),
  stage: z.enum(['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost']).optional(),
  source: z.string().max(60).nullable().optional(),
};
export default async function leadRoutes(fastify) {
  // The crudPlugin registers its own preValidation hook *inside its scope*, so
  // sibling routes below (contacts, tags, subtasks, …) must require auth
  // explicitly — otherwise request.user is null and they 500 (and would be
  // effectively unauthenticated, an IDOR hole).
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });
  await fastify.register(
    crudPlugin({
      table: 'leads',
      columns: ['client_id', 'title', 'description', 'value', 'currency', 'stage', 'source'],
      createSchema: z.object(leadBase),
      updateSchema: z.object(Object.fromEntries(Object.entries(leadBase).map(([k, v]) => [k, v.optional()]))),
      search: ['title', 'description', 'source'],
    })
  );
}
