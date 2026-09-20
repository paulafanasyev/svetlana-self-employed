import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Single SQLite connection for the whole backend.
 * node:sqlite is compiled into Node >=22 — no native deps required.
 *
 * Production settings applied:
 *  - WAL journal mode (concurrent readers + one writer)
 *  - foreign keys enforced
 *  - busy timeout so queued writes don't immediately fail
 *  - synchronous=NORMAL (safe with WAL, correct on crash, fast)
 */
export function createDb(dbPath = process.env.DB_PATH) {
  const path = resolve(dbPath || new URL('../../data/app.sqlite', import.meta.url).pathname);
  mkdirSync(dirname(path), { recursive: true });

  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = MEMORY;
  `);

  // Every write goes through a transaction helper so partial writes
  // never land in the database (CRM/billing invariants stay intact).
  db.transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  return db;
}

/** Global singleton used by route modules. */
let _db = null;
export function db() {
  if (!_db) _db = createDb();
  return _db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
