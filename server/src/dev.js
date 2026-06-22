/**
 * @file dev.js
 * @description Local development entry point — uses pg-mem instead of a real database.
 *
 * Run with:  npm run dev:local
 *
 * Loads the root .env file so secrets are available, then boots the server
 * against an in-memory Postgres database.
 * All data resets on restart.
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Load the dev env (two directories up from server/src/)
loadEnv({ path: resolve(__dirname, '../../.env.dev') });

// ── Must happen before ANY app module is imported ─────────────────────────────
process.env.NODE_ENV       ??= 'development';
process.env.PORT           ??= '3001';
process.env.ALLOWED_ORIGIN ??= 'http://localhost:5173';
process.env.LOG_LEVEL      ??= 'info';

// ── In-memory database (pg-mem) ───────────────────────────────────────────────
import { createTestDb } from '../test/helpers/createTestDb.js';

const { Pool } = createTestDb();
const { initDb } = await import('./db/migrate.js');
await initDb(new Pool());

console.log('\n  DEV MODE — in-memory database, data resets on restart');
console.log('  Sign in at http://localhost:5173/login\n');

// ── Start the app ─────────────────────────────────────────────────────────────
await import('./index.js');
