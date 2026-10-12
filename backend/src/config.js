/**
 * Central configuration.
 *
 * Every secret comes from the environment. Nothing is hardcoded, and the
 * frontend never receives any of the keys marked secret (see /health and the
 * auth routes — they only ever echo non-sensitive values).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { z } from 'zod';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/** Minimal .env loader — does not clobber variables already set by --env-file. */
function loadDotEnv(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv(resolve(__dirname, '../.env'));

/**
 * Temporary Vercel preview (serverless): the deployment bundle is read-only and
 * every function instance is isolated. Without explicit settings we run in an
 * honest "demo" mode: data lives in the instance temp dir and a per-instance
 * JWT secret is generated. /health reports this as `ephemeral_demo` so nobody
 * mistakes it for production storage. Explicit env vars always win.
 */
export const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const ephemeral = { secret: false, storage: false };
if (isServerless) {
  const tmp = tmpdir();
  if (!process.env.DB_PATH) { process.env.DB_PATH = resolve(tmp, 'mir-app.sqlite'); ephemeral.storage = true; }
  if (!process.env.STORAGE_DIR) { process.env.STORAGE_DIR = resolve(tmp, 'mir-storage'); ephemeral.storage = true; }
  // Генерируем секрет только если он не задан вовсе. Заданный, но слабый секрет
  // не подменяем молча — конфигурация упадёт с понятной ошибкой.
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = randomBytes(48).toString('hex');
    ephemeral.secret = true;
    console.warn('⚠️  JWT_SECRET is not set: generated a per-instance secret (temporary demo mode). Set JWT_SECRET in Vercel → Settings → Environment Variables.');
  }
  if (!process.env.WEB_ORIGIN) {
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
    if (host) process.env.WEB_ORIGIN = 'https://' + host;
  }
  if (!process.env.CORS_ORIGINS) {
    process.env.CORS_ORIGINS = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL]
      .filter(Boolean).map((h) => 'https://' + h).join(',');
  }
}

const schema = z.object({
  NODE_ENV: z.enum(['production', 'development', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),

  // Paths
  DB_PATH: z.string().default(resolve(__dirname, '../data/app.sqlite')),
  STORAGE_DIR: z.string().default(resolve(__dirname, '../data/storage')),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  REFRESH_TOKEN_ROTATION: z.coerce.boolean().default(true),

  // CORS: comma-separated list of allowed browser origins (production domain + partner sites).
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default(''),

  // Светлана runtime: model endpoint and key exist only on the server.
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().url().optional(),
  AI_MODEL: z.string().default('svetlana-core'),
  AI_PROVIDER_ORDER: z.string().default('primary,local'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  AI_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),

  // Embeddings for RAG (optional — a deterministic hash fallback keeps RAG working offline)
  EMBEDDING_PROVIDER: z.enum(['remote', 'local', 'none']).default('none'),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(768),

  // Payments (§26). 'test' provider is allowed ONLY outside production.
  PAYMENT_PROVIDER: z.string().default('test'),
  YOOKASSA_SHOP_ID: z.string().optional(),
  YOOKASSA_SECRET: z.string().optional(),

  // Marketplace commission (§25). Live value lives in system_config; this is the seed default.
  DEFAULT_COMMISSION_PERCENT: z.coerce.number().min(0).max(100).default(10),

  // Rate limits
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

  // Demo/seed data — §54: mocks only allowed when this is explicitly true.
  SEED_DEMO_DATA: z.coerce.boolean().default(false),

  // Optional email transport (document delivery, notifications). Absent => in_app only.
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  console.error('❌ Invalid environment configuration:');
  for (const line of issues) console.error(`  ${line}`);
  if (isServerless) {
    // В serverless process.exit убивает функцию без ответа; бросаем ошибку — api/index.js
    // вернёт 503 с именем переменной (значения не выводятся).
    throw new Error('Invalid environment configuration: ' + issues.join('; '));
  }
  console.error('\nSet these in backend/.env (see backend/.env.example).');
  process.exit(1);
}

export const config = Object.freeze({
  ...parsed.data,
  // Resolve relative paths against the backend root so the process can start
  // from any cwd (systemd, npm workspaces, tests). The special ':memory:'
  // value must be preserved verbatim — resolving it would create a literal
  // file named ":memory:" and break in-memory test databases.
  DB_PATH: parsed.data.DB_PATH === ':memory:' ? ':memory:' : resolve(__dirname, '../', parsed.data.DB_PATH),
  STORAGE_DIR: resolve(__dirname, '../', parsed.data.STORAGE_DIR),
  corsOrigins: [...new Set(
    parsed.data.CORS_ORIGINS
      ? parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
      : [parsed.data.WEB_ORIGIN],
  )],
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  isServerless,
  // true when running as a temporary serverless demo without durable storage/secret
  ephemeralDemo: ephemeral.secret || ephemeral.storage,
});
