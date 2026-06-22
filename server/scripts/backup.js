#!/usr/bin/env node
/**
 * @file scripts/backup.js
 * @description Standalone PostgreSQL backup script.
 *
 * Invokes pg_dump via child_process.spawn to create a plain-SQL dump of the
 * PostgreSQL database. Safe to run while the server is active — pg_dump uses
 * a consistent snapshot and does not block writes.
 *
 * After a successful backup, old backups beyond the retention window are pruned.
 *
 * Usage: node scripts/backup.js
 *
 * Environment variables (set by docker-compose backup service):
 *   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD — pg_dump reads these automatically
 *   BACKUP_DIR           - Directory to write backup files to  (default: /backups)
 *   BACKUP_RETAIN_DAYS   - Number of days of backups to keep   (default: 30)
 */

import { spawn }                                          from 'node:child_process';
import { mkdirSync, readdirSync, statSync, unlinkSync }   from 'node:fs';
import { join }                                           from 'node:path';

const BACKUP_DIR   = process.env.BACKUP_DIR          ?? '/backups';
const RETAIN_DAYS  = parseInt(process.env.BACKUP_RETAIN_DAYS ?? '30', 10);

mkdirSync(BACKUP_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dest = join(BACKUP_DIR, `open-tome_${timestamp}.sql`);

// pg_dump reads PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD from the environment
const pgdump = spawn('pg_dump', [
  '--format=plain',
  `--file=${dest}`,
  '--no-password',
]);

pgdump.stderr.on('data', (data) => {
  process.stderr.write(`[backup] pg_dump: ${data}`);
});

pgdump.on('close', (code) => {
  if (code !== 0) {
    console.error(`[backup] pg_dump exited with code ${code}`);
    process.exit(1);
  }
  console.log(`[backup] wrote ${dest}`);
  pruneOldBackups();
});

function pruneOldBackups() {
  const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
  let pruned = 0;
  for (const file of readdirSync(BACKUP_DIR)) {
    if (!file.startsWith('open-tome_') || !file.endsWith('.sql')) continue;
    const full = join(BACKUP_DIR, file);
    if (statSync(full).mtimeMs < cutoff) {
      unlinkSync(full);
      pruned++;
    }
  }
  if (pruned > 0) console.log(`[backup] pruned ${pruned} old backup(s)`);
}
