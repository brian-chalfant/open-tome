/**
 * @file test/helpers/createTestDb.js
 * @description Creates a pg-mem in-memory database with the functions that
 * pg-mem doesn't implement natively but our schema requires.
 *
 * pg-mem does not provide gen_random_uuid() — we register a JS implementation
 * so the schema bootstrap (which uses `DEFAULT gen_random_uuid()`) succeeds.
 */

import { newDb } from 'pg-mem';
import { randomUUID } from 'crypto';

export function createTestDb() {
  const db = newDb();

  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: 'uuid',
    implementation: () => randomUUID(),
    impure: true,
  });

  return db.adapters.createPg();
}
