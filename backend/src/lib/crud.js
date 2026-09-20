/**
 * Generic owner-scoped CRUD factory.
 *
 * Every CRM entity has the same shape: list/get/create/update/delete, always
 * filtered by owner_id, always validated with zod, always audited. Building it
 * once means IDOR protection and audit logging cannot be forgotten per-route.
 *
 * Columns are developer-provided constants (never user input), so the generated
 * SQL is injection-safe; all values are parameterized.
 */
import { nanoid } from 'nanoid';
import { db } from '../db/client.js';
import { auditRequest, diffSummary } from '../plugins/audit.js';
import { sendError, validateOrThrow, paginationSchema } from './http.js';

/**
 * @param {object} opts
 * @param {string} opts.table          table name
 * @param {string[]} opts.columns      writable columns (never id/owner_id)
 * @param {object} opts.createSchema   zod schema for POST
 * @param {object} opts.updateSchema   zod schema for PUT
 * @param {string[]} [opts.search]     columns to ILIKE-search on ?q=
 * @param {string} [opts.order='created_at DESC']
 * @param {function} [opts.afterCreate]  async hook(fastify, request, row)
 * @param {function} [opts.afterUpdate]  async hook(fastify, request, row)
 */
export function crudPlugin(opts) {
  const {
    table,
    columns,
    createSchema,
    updateSchema,
    search = [],
    order = 'created_at DESC',
    afterCreate,
    afterUpdate,
  } = opts;

  const idCol = 'id';
  const safeOrder = /^[a-zA-Z_]+ (ASC|DESC|asc|desc)$/.test(order) ? order : 'created_at DESC';

  return async (fastify) => {
    fastify.addHook('preValidation', async (request, reply) => {
      if (!request.user) await fastify.requireAuth(request, reply);
    });

    // LIST
    fastify.get('/', async (request, reply) => {
      const { limit, offset } = paginationSchema.parse(request.query ?? {});
      const q = String(request.query?.q ?? '').trim();

      let whereSql = 'owner_id = ?';
      const sqlParams = [request.user.id];
      if (q && search.length) {
        whereSql += ` AND (${search.map((c) => `${c} LIKE ?`).join(' OR ')})`;
        for (const _c of search) sqlParams.push(`%${q}%`);
      }

      const rows = db()
        .prepare(`SELECT * FROM ${table} WHERE ${whereSql} ORDER BY ${safeOrder} LIMIT ? OFFSET ?`)
        .all(...sqlParams, limit, offset);
      const total = db()
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${whereSql}`)
        .get(...sqlParams);
      reply.send({ data: rows, total: total.n, limit, offset });
    });

    // GET
    fastify.get('/:id', async (request, reply) => {
      const row = db().prepare(`SELECT * FROM ${table} WHERE ${idCol} = ?`).get(request.params.id);
      if (!row || row.owner_id !== request.user.id) {
        return sendError(reply, 404, 'not_found', 'Не найдено');
      }
      reply.send(row);
    });

    // CREATE
    fastify.post('/', async (request, reply) => {
      const body = validateOrThrow(createSchema, request.body, reply);
      if (!body) return;
      const id = nanoid();
      // Only insert provided fields: columns with a DB DEFAULT (status, currency…)
      // must not be overwritten with an explicit NULL.
      const cols = [idCol, 'owner_id', ...columns.filter((c) => body[c] !== undefined)];
      const placeholders = cols.map(() => '?').join(', ');
      const values = [id, request.user.id, ...cols.slice(2).map((c) => body[c])];
      try {
        db()
          .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`)
          .run(...values);
      } catch (err) {
        request.log.error({ err }, `create ${table} failed`);
        return sendError(reply, 400, 'db_error', 'Не удалось создать запись', { detail: err.message });
      }
      const row = db().prepare(`SELECT * FROM ${table} WHERE ${idCol} = ?`).get(id);
      auditRequest(request, 'create', table, id, body);
      if (afterCreate) await afterCreate(fastify, request, row);
      reply.code(201).send(row);
    });

    // UPDATE
    fastify.put('/:id', async (request, reply) => {
      const body = validateOrThrow(updateSchema, request.body, reply);
      if (!body) return;
      const before = db().prepare(`SELECT * FROM ${table} WHERE ${idCol} = ?`).get(request.params.id);
      if (!before || before.owner_id !== request.user.id) {
        return sendError(reply, 404, 'not_found', 'Не найдено');
      }
      const setCols = columns.filter((c) => body[c] !== undefined);
      if (setCols.length) {
        const setSql = setCols.map((c) => `${c} = ?`).join(', ');
        db()
          .prepare(`UPDATE ${table} SET ${setSql}, updated_at = unixepoch() WHERE ${idCol} = ?`)
          .run(...setCols.map((c) => body[c]), request.params.id);
      }
      const row = db().prepare(`SELECT * FROM ${table} WHERE ${idCol} = ?`).get(request.params.id);
      auditRequest(request, 'update', table, request.params.id, diffSummary(before, row));
      if (afterUpdate) await afterUpdate(fastify, request, row);
      reply.send(row);
    });

    // DELETE
    fastify.delete('/:id', async (request, reply) => {
      const row = db().prepare(`SELECT * FROM ${table} WHERE ${idCol} = ?`).get(request.params.id);
      if (!row || row.owner_id !== request.user.id) {
        return sendError(reply, 404, 'not_found', 'Не найдено');
      }
      db().prepare(`DELETE FROM ${table} WHERE ${idCol} = ?`).run(request.params.id);
      auditRequest(request, 'delete', table, request.params.id);
      reply.send({ ok: true, id: request.params.id });
    });
  };
}
