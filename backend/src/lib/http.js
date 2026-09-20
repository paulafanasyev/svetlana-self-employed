/**
 * Shared route helpers: validation, pagination, JSON columns, error shape.
 */
import { z } from 'zod';

/** Standard error payload: { error, message, details? }. */
export function sendError(reply, code, error, message, details) {
  return reply.code(code).send({ error, message, ...(details ? { details } : {}) });
}

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export function parseListQuery(request, schema = z.object({})) {
  const parsed = paginationSchema.safeParse(request.query);
  const extra = schema.safeParse(request.query);
  return {
    limit: parsed.success ? parsed.data.limit : 20,
    offset: parsed.success ? parsed.data.offset : 0,
    filters: extra.success ? extra.data : {},
  };
}

/** Build `WHERE a = ? AND b LIKE ?` + params from a filter map. */
export function whereFromFilters(filters) {
  const clauses = [];
  const params = [];
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'string' && value.includes('%')) {
      clauses.push(`${key} LIKE ?`);
      params.push(value);
    } else {
      clauses.push(`${key} = ?`);
      params.push(value);
    }
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

/** Read a JSON column that may be null/empty. */
export function readJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return fallback ?? null;
  }
}

export function writeJson(value) {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** SQLite stores booleans as 0/1. */
export const toBool = (v) => (v ? 1 : 0);
export const fromBool = (v) => Boolean(v);

/** Throw a 400-shaped validation error Fastify converts into the error body. */
export function validateOrThrow(schema, data, reply) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    sendError(reply, 400, 'validation_error', 'Некорректные данные', parsed.error.flatten());
    return null;
  }
  return parsed.data;
}

/** Number-or-null for optional integer fields. */
export const optInt = z.coerce.number().int().nullable().optional();
export const optStr = z.string().trim().nullable().optional();
