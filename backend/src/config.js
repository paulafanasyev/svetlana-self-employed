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

  // CORS: comma-separated list. Include the production domain + GitHub Pages origin.
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default(''),
  // Public SPA origin used by GitHub Pages while the primary domain is unavailable.
  GITHUB_PAGES_ORIGIN: z.string().url().default('https://paulafanasyev.github.io'),

  // AI providers (§30). Any subset may be configured; absent = provider disabled.
  ATRIA_API_KEY: z.string().optional(),
  ATRIA_BASE_URL: z.string().url().default('https://api.atria-asi.ai/v1'),
  ATRIA_MODEL: z.string().default('Atria-Dawn-Preview'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL: z.string().default('openai/gpt-4o-mini'),
  LOCAL_MODEL_URL: z.string().optional(),
  AI_PROVIDER_ORDER: z.string().default('atria,openrouter,openai,local'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  AI_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),

  // Embeddings for RAG (optional — a deterministic hash fallback keeps RAG working offline)
  EMBEDDING_PROVIDER: z.enum(['atria', 'openai', 'local', 'none']).default('none'),
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
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
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
  corsOrigins: [...new Set([
    ...(parsed.data.CORS_ORIGINS
      ? parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
      : [parsed.data.WEB_ORIGIN]),
    parsed.data.GITHUB_PAGES_ORIGIN,
  ])],
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
});
