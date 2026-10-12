/**
 * Migration runner.
 *
 *   node src/db/migrate.js            # apply pending migrations
 *   node src/db/migrate.js --status   # show applied / pending
 *
 * Migrations are plain .sql files in src/db/schema, applied in lexical order,
 * each inside its own transaction. schema_migrations tracks the high-water mark.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { db, closeDb } from './client.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Locate the schema directory. Next to this file in a normal checkout; on
 * Vercel the bundled function may run from another directory while the
 * `includeFiles` copies keep their repository-relative path.
 */
export function findSchemaDir(candidates = [
  resolve(__dirname, 'schema'),
  resolve(process.cwd(), 'backend/src/db/schema'),
  resolve(process.cwd(), 'src/db/schema'),
  resolve(__dirname, '../../backend/src/db/schema'),
]) {
  const dir = candidates.find((c) => existsSync(c));
  if (!dir) throw new Error('Database schema directory was not packaged (looked in: ' + candidates.join(', ') + ')');
  return dir;
}

let schemaDir = null;
const SCHEMA_DIR = () => (schemaDir ??= findSchemaDir());

function ensureMigrationsTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}

function appliedVersions(database) {
  return new Set(
    database.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version)
  );
}

function listMigrations() {
  return readdirSync(SCHEMA_DIR())
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, version: file.replace(/\.sql$/, '') }));
}

function readSql(file) {
  return readFileSync(join(SCHEMA_DIR(), file), 'utf8');
}

/** Apply all pending migrations. Each migration is one transaction. */
export function migrate(database = db()) {
  ensureMigrationsTable(database);
  const applied = appliedVersions(database);
  const pending = listMigrations().filter((m) => !applied.has(m.version));

  if (pending.length === 0) {
    console.log('✅ Database is up to date');
    return { applied: [], pending: [] };
  }

  const appliedNow = [];
  for (const m of pending) {
    const sql = readSql(m.file);
    database.transaction(() => {
      database.exec(sql);
      database.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(m.version);
    });
    appliedNow.push(m.version);
    console.log(`⬆️  applied ${m.version}`);
  }
  console.log(`✅ ${appliedNow.length} migration(s) applied`);
  return { applied: appliedNow, pending: [] };
}

export function migrationStatus(database = db()) {
  ensureMigrationsTable(database);
  const applied = appliedVersions(database);
  const all = listMigrations();
  return {
    applied: all.filter((m) => applied.has(m.version)).map((m) => m.version),
    pending: all.filter((m) => !applied.has(m.version)).map((m) => m.version),
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    if (process.argv.includes('--status')) {
      console.log(migrationStatus());
    } else {
      migrate();
    }
  } finally {
    closeDb();
  }
}
