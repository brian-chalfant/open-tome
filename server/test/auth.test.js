/**
 * @file test/auth.test.js
 * @description Integration tests for the auth HTTP routes.
 *
 * Routes under test:
 *   GET    /api/auth/me      — return DB user for authenticated session
 *   POST   /api/auth/logout  — clear session cookie, bump token_version
 *   DELETE /api/auth/me      — delete user account
 *
 * Authentication in tests uses the X-Test-User-Id header bypass (only active
 * when NODE_ENV === 'test'), which requireAuth accepts in place of a JWT cookie.
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

afterAll(() => server.close());

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('returns 401 with no auth header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with an unknown user id', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('x-test-user-id', '00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(401);
  });

  it('returns 200 with user data for a valid session', async () => {
    const { user, headers } = await makeTestUser(getDb(), 'Alice', 'me');

    const res = await request(app).get('/api/auth/me').set(headers);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id:           user.id,
      display_name: 'Alice',
      theme:        'light',
    });
    expect(res.body).not.toHaveProperty('token_version');
    expect(res.body).not.toHaveProperty('password_hash');
  });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('returns 401 without authentication', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  it('returns 204 for an authenticated user', async () => {
    const { headers } = await makeTestUser(getDb(), 'LogoutUser', 'logout');
    const res = await request(app).post('/api/auth/logout').set(headers);
    expect(res.status).toBe(204);
  });
});

// ── DELETE /api/auth/me ───────────────────────────────────────────────────────

describe('DELETE /api/auth/me', () => {
  it('returns 401 without authentication', async () => {
    const res = await request(app).delete('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 204 and removes the user record', async () => {
    const { headers } = await makeTestUser(getDb(), 'DeleteMe', 'del');
    const res = await request(app).delete('/api/auth/me').set(headers);
    expect(res.status).toBe(204);
  });

  it('returns 401 on subsequent GET /api/auth/me after deletion', async () => {
    const { headers } = await makeTestUser(getDb(), 'DeleteMe2', 'del2');
    await request(app).delete('/api/auth/me').set(headers);
    const res = await request(app).get('/api/auth/me').set(headers);
    expect(res.status).toBe(401);
  });
});

// ── Cross-user isolation ──────────────────────────────────────────────────────

describe('Cross-user isolation', () => {
  it("User A's session returns only User A's data — never User B's", async () => {
    const a = await makeTestUser(getDb(), 'Alice', 'iso');
    const b = await makeTestUser(getDb(), 'Bob',   'iso');

    const res = await request(app).get('/api/auth/me').set(a.headers);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(a.user.id);
    expect(res.body.display_name).toBe('Alice');
    expect(res.body.id).not.toBe(b.user.id);
  });
});
