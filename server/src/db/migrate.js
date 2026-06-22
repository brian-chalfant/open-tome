/**
 * @file db/migrate.js
 * @description PostgreSQL connection pool management and schema bootstrap.
 *
 * This module owns the single global `pg.Pool` instance.
 * All other modules call `getDb()` to obtain a reference to the pool.
 *
 * Schema bootstrap: schema.sql is split on semicolons and each statement is
 * executed via pool.query() on startup. All table definitions use
 * `CREATE TABLE IF NOT EXISTS` so this is idempotent — existing data is untouched.
 */

import pg             from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { validateKey }            from '../lib/crypto.js';
import { encryptManuscriptFields } from './userDb.js';

const { Pool } = pg;

// Return DATE columns (OID 1082) as plain 'YYYY-MM-DD' strings instead of Date objects.
// Without this the pg driver returns Date objects, which JSON.stringify serialises to full
// ISO timestamps ("2026-12-31T00:00:00.000Z"). Client code that appends "T00:00:00" to
// parse as local midnight would then produce an invalid date string and get NaN.
pg.types.setTypeParser(1082, (val) => val);

// Resolve __dirname for ES modules
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Singleton pg.Pool instance. Null until initDb() is called. */
let _pool = null;

/**
 * Return the live connection pool.
 *
 * @returns {pg.Pool}
 * @throws {Error} If initDb() has not been called yet.
 */
export function getDb() {
  if (!_pool) throw new Error('Database not initialized — call initDb() first');
  return _pool;
}

/**
 * Create the pg.Pool and run schema.sql to ensure all tables exist.
 *
 * Accepts either:
 *   - A connection string / URL (production / dev)
 *   - An already-created Pool object (used in tests with pg-mem)
 *
 * @param {string|import('pg').Pool} [arg] - Connection URL or an existing Pool.
 * @returns {Promise<import('pg').Pool>} The initialized pool.
 */
export async function initDb(arg) {
  // Fail fast if the encryption key is set but malformed.
  validateKey(process.env.MANUSCRIPT_ENCRYPTION_KEY);

  // If pool is already initialized and no replacement is being injected, skip.
  // This allows test setups to call initDb(memPool) before index.js does initDb().
  if (_pool && !arg) return _pool;

  if (arg && typeof arg === 'object' && typeof arg.query === 'function') {
    // Received an existing Pool (e.g., from pg-mem in tests)
    _pool = arg;
  } else {
    _pool = new Pool({
      connectionString: (typeof arg === 'string' ? arg : null) ?? process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  // If users.id is still an integer (old sequential-ID schema), drop all
  // user-dependent tables so they get recreated with UUID types below.
  const { rows: colInfo } = await _pool.query(`
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'id'
  `);
  if (colInfo.length > 0 && colInfo[0].data_type === 'integer') {
    await _pool.query(`
      DROP TABLE IF EXISTS note_fields CASCADE;
      DROP TABLE IF EXISTS notes       CASCADE;
      DROP TABLE IF EXISTS documents   CASCADE;
      DROP TABLE IF EXISTS projects    CASCADE;
      DROP TABLE IF EXISTS users       CASCADE;
    `);
  }

  // Read and execute the full schema DDL.
  // Split on semicolons to execute each statement individually.
  // Strip inline SQL comments (lines starting with --) from each chunk
  // before checking whether the chunk contains real SQL — without this,
  // chunks that begin with a comment block followed by CREATE TABLE would
  // be incorrectly filtered out as comment-only.
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  const statements = schema
    .split(';')
    .map((chunk) => {
      // Remove full-line comments, then trim whitespace
      const stripped = chunk
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .trim();
      return stripped;
    })
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await _pool.query(stmt);
  }

  // Encrypt any plaintext ms_* fields left over from before R-6 was deployed.
  await encryptManuscriptFields(_pool);

  return _pool;
}

/**
 * End the connection pool, draining all active connections.
 *
 * Called by SIGTERM / SIGINT handlers in index.js for graceful shutdown.
 */
export async function closeDb() {
  if (_pool) {
    try {
      await _pool.end();
    } catch { /* ignore errors on shutdown */ }
    _pool = null;
  }
}

