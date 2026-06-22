import { describe, it, expect, afterAll } from 'vitest';
import { createTestDb } from './helpers/createTestDb.js';

process.env.NODE_ENV       = 'test';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';

const { Pool } = createTestDb();
const { initDb } = await import('../src/db/migrate.js');
await initDb(new Pool());

const { app, server } = await import('../src/index.js');
const { default: request } = await import('supertest');

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  afterAll(() => server.close());
});
