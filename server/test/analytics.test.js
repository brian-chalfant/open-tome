/**
 * @file test/analytics.test.js
 * @description Integration tests for the analytics HTTP routes.
 *
 * Routes under test (all require authentication):
 *   GET /api/analytics              — heatmap + 30-day pace + summary for current year
 *   GET /api/analytics/summary      — year-scoped summary cards only (?year=YYYY)
 */

import { describe, it, expect, afterAll } from 'vitest';
import { createTestDb } from './helpers/createTestDb.js';

process.env.NODE_ENV       = 'test';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';

const { Pool } = createTestDb();
const { initDb } = await import('../src/db/migrate.js');
await initDb(new Pool());

const { app, server } = await import('../src/index.js');
const { default: request } = await import('supertest');
const { getDb } = await import('../src/db/migrate.js');
const { makeTestUser } = await import('./helpers/makeTestUser.js');
const { recordDelta } = await import('../src/db/analyticsDb.js');

afterAll(() => server.close());

// ── GET /api/analytics ────────────────────────────────────────────────────────

describe('GET /api/analytics', () => {
  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/analytics');
    expect(res.status).toBe(401);
  });

  it('returns 200 with heatmap, pace, and summary properties', async () => {
    const { headers } = await makeTestUser(getDb(), 'User', 'anl');
    const res = await request(app).get('/api/analytics').set(headers);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('heatmap');
    expect(res.body).toHaveProperty('pace');
    expect(res.body).toHaveProperty('summary');
  });

  it('heatmap is an array', async () => {
    const { headers } = await makeTestUser(getDb(), 'User', 'anl');
    const res = await request(app).get('/api/analytics').set(headers);
    expect(Array.isArray(res.body.heatmap)).toBe(true);
  });

  it('pace array has exactly 30 entries', async () => {
    const { headers } = await makeTestUser(getDb(), 'User', 'anl');
    const res = await request(app).get('/api/analytics').set(headers);
    expect(res.body.pace).toHaveLength(30);
  });

  it('each pace entry has stat_date and words_added', async () => {
    const { headers } = await makeTestUser(getDb(), 'User', 'anl');
    const res = await request(app).get('/api/analytics').set(headers);
    for (const entry of res.body.pace) {
      expect(entry).toHaveProperty('stat_date');
      expect(entry).toHaveProperty('words_added');
      expect(entry.stat_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof entry.words_added).toBe('number');
    }
  });

  it('summary contains all expected numeric fields', async () => {
    const { headers } = await makeTestUser(getDb(), 'User', 'anl');
    const res = await request(app).get('/api/analytics').set(headers);
    expect(res.body.summary).toMatchObject({
      total_doc_words:        expect.any(Number),
      words_this_year:        expect.any(Number),
      writing_days_this_year: expect.any(Number),
      current_streak:         expect.any(Number),
      best_streak:            expect.any(Number),
    });
  });

  it('reflects writing activity for the authenticated user', async () => {
    const { user, headers } = await makeTestUser(getDb(), 'User', 'anl');
    await recordDelta(getDb(), user.id, 0, 500);
    const res = await request(app).get('/api/analytics').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.summary.words_this_year).toBeGreaterThanOrEqual(500);
    expect(res.body.summary.current_streak).toBeGreaterThanOrEqual(1);
    expect(res.body.heatmap.length).toBeGreaterThan(0);
  });

  it("does not include another user's activity (cross-user isolation)", async () => {
    const a = await makeTestUser(getDb(), 'Alice', 'anl');
    const b = await makeTestUser(getDb(), 'Bob',   'anl');
    await recordDelta(getDb(), a.user.id, 0, 1000);
    const res = await request(app).get('/api/analytics').set(b.headers);
    expect(res.status).toBe(200);
    expect(res.body.summary.words_this_year).toBe(0);
    expect(res.body.heatmap).toHaveLength(0);
  });
});

// ── GET /api/analytics/summary ────────────────────────────────────────────────

describe('GET /api/analytics/summary', () => {
  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/analytics/summary?year=2025');
    expect(res.status).toBe(401);
  });

  it('returns 400 when the year param is missing', async () => {
    const { headers } = await makeTestUser(getDb(), 'User', 'anls');
    const res = await request(app).get('/api/analytics/summary').set(headers);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for year < 2000', async () => {
    const { headers } = await makeTestUser(getDb(), 'User', 'anls');
    const res = await request(app).get('/api/analytics/summary?year=1999').set(headers);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for year > current year', async () => {
    const { headers } = await makeTestUser(getDb(), 'User', 'anls');
    const futureYear = new Date().getFullYear() + 1;
    const res = await request(app).get(`/api/analytics/summary?year=${futureYear}`).set(headers);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for a non-numeric year value', async () => {
    const { headers } = await makeTestUser(getDb(), 'User', 'anls');
    const res = await request(app).get('/api/analytics/summary?year=notayear').set(headers);
    expect(res.status).toBe(400);
  });

  it('returns 200 with a summary object for a valid year', async () => {
    const { headers } = await makeTestUser(getDb(), 'User', 'anls');
    const year = new Date().getFullYear();
    const res = await request(app).get(`/api/analytics/summary?year=${year}`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(res.body.summary).toMatchObject({
      total_doc_words:        expect.any(Number),
      words_this_year:        expect.any(Number),
      writing_days_this_year: expect.any(Number),
      current_streak:         expect.any(Number),
      best_streak:            expect.any(Number),
    });
  });

  it('returns 0 for words_this_year when querying a year with no activity', async () => {
    const { user, headers } = await makeTestUser(getDb(), 'User', 'anls');
    await recordDelta(getDb(), user.id, 0, 200);
    const res = await request(app).get('/api/analytics/summary?year=2020').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.summary.words_this_year).toBe(0);
    expect(res.body.summary.writing_days_this_year).toBe(0);
  });

  it('scopes words_this_year to the requested year', async () => {
    const { user, headers } = await makeTestUser(getDb(), 'User', 'anls');
    const thisYear = new Date().getFullYear();
    await recordDelta(getDb(), user.id, 0, 300);
    const currentRes = await request(app)
      .get(`/api/analytics/summary?year=${thisYear}`).set(headers);
    const pastRes = await request(app)
      .get(`/api/analytics/summary?year=${thisYear - 1}`).set(headers);
    expect(currentRes.body.summary.words_this_year).toBeGreaterThanOrEqual(300);
    expect(pastRes.body.summary.words_this_year).toBe(0);
  });
});
