/**
 * Companies, leads, deals (§15).
 */
import { z } from 'zod';
import { crudPlugin } from '../lib/crud.js';

const companyBase = {
  name: z.string().min(1).max(200),
  inn: z.string().max(20).nullable().optional(),
  website: z.string().url().nullable().or(z.literal('')).optional(),
  industry: z.string().max(120).nullable().optional(),
  size: z.string().max(40).nullable().optional(),
  notes: z.string().max(8000).nullable().optional(),
};
export default async function companyRoutes(fastify) {
  // The crudPlugin registers its own preValidation hook *inside its scope*, so
  // sibling routes below (contacts, tags, subtasks, …) must require auth
  // explicitly — otherwise request.user is null and they 500 (and would be
  // effectively unauthenticated, an IDOR hole).
  fastify.addHook('preValidation', async (request, reply) => {
    if (!request.user) await fastify.requireAuth(request, reply);
  });
  await fastify.register(
    crudPlugin({
      table: 'companies',
      columns: ['name', 'inn', 'website', 'industry', 'size', 'notes'],
      createSchema: z.object(companyBase),
      updateSchema: z.object(Object.fromEntries(Object.entries(companyBase).map(([k, v]) => [k, v.optional()]))),
      search: ['name', 'inn', 'industry'],
    })
  );
}
