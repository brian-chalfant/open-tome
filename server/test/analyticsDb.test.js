/**
 * @file test/analyticsDb.test.js
 * @description Unit tests for the analytics DB helpers in src/db/analyticsDb.js.
 *
 * These tests exercise the DB layer directly (no HTTP/Express) using a pg-mem
 * in-memory database so no real PostgreSQL instance is needed.
 *
 * Functions under test:
 *   recordDelta   — upserts daily word-count deltas; ignores zero/negative
 *   getHeatmapData — returns last-365-day activity rows; normalises dates
 *   getPaceData    — returns gap-filled N-day window; fills zeros for quiet days
 *   getSummary     — aggregates totals, year stats, and streaks (computeStreaks
 *                    is private so it is covered indirectly here)
 */

import { describe, it, expect } from 'vitest';
import { createTestDb } from './helpers/createTestDb.js';

process.env.NODE_ENV = 'test';

// ── Bootstrap pg-mem and run schema migrations ────────────────────────────────
const { Pool } = createTestDb();
const pool = new Pool();
const { initDb } = await import('../src/db/migrate.js');
await initDb(pool);

// Import the functions under test (after initDb so the pool singleton is set)
const {
  recordDelta,
  getHeatmapData,
  getPaceData,
  getSummary,
} = await import('../src/db/analyticsDb.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

let _seq = 0;

/** Insert a user row directly and return its UUID. */
async function makeUser() {
  const { rows: [u] } = await pool.query(
    `INSERT INTO users (email, display_name, password_hash)
     VALUES ($1, 'Test User', 'not-a-real-hash') RETURNING id`,
    [`andb-${++_seq}@test.example`],
  );
  return u;
}

/** Insert a project row and return it. */
async function makeProject(userId) {
  const { rows: [p] } = await pool.query(
    `INSERT INTO projects (user_id, title) VALUES ($1, 'P') RETURNING id`,
    [userId],
  );
  return p;
}

/** Return 'YYYY-MM-DD' for a date N days before today (UTC midnight).
 *  Uses UTC throughout so the result matches the UTC-based streak logic in
 *  computeStreaks, which also anchors to setUTCHours. Using local time here
 *  caused the test to fail when run after ~8 PM in UTC-4: local "yesterday"
 *  was "2 days ago" in UTC, pushing diffFromToday > 1 and zeroing the streak.
 */
function daysAgoStr(n) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Insert a row directly into daily_stats for a specific date. */
async function insertStat(userId, dateStr, words) {
  await pool.query(
    `INSERT INTO daily_stats (user_id, stat_date, words_added)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, stat_date)
     DO UPDATE SET words_added = daily_stats.words_added + EXCLUDED.words_added`,
    [userId, dateStr, words],
  );
}

// ── recordDelta ───────────────────────────────────────────────────────────────

describe('recordDelta', () => {
  it('does not insert a row for a zero delta', async () => {
    const u = await makeUser();
    await recordDelta(pool, u.id, 100, 100);
    const { rows } = await pool.query(
      'SELECT * FROM daily_stats WHERE user_id = $1',
      [u.id],
    );
    expect(rows).toHaveLength(0);
  });

  it('does not insert a row for a negative delta', async () => {
    const u = await makeUser();
    await recordDelta(pool, u.id, 200, 100);
    const { rows } = await pool.query(
      'SELECT * FROM daily_stats WHERE user_id = $1',
      [u.id],
    );
    expect(rows).toHaveLength(0);
  });

  it('inserts a row with the correct delta for a positive change', async () => {
    const u = await makeUser();
    await recordDelta(pool, u.id, 0, 150);
    const { rows } = await pool.query(
      'SELECT words_added FROM daily_stats WHERE user_id = $1',
      [u.id],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].words_added)).toBe(150);
  });

  it('accumulates multiple deltas on the same day (upsert)', async () => {
    const u = await makeUser();
    await recordDelta(pool, u.id, 0, 50);   // delta = 50
    await recordDelta(pool, u.id, 50, 120); // delta = 70
    // pg-mem does not enforce ON CONFLICT DO UPDATE for compound UNIQUE constraints
    // when the value is the SQL keyword CURRENT_DATE, so we assert on the SUM rather
    // than the row count. Real Postgres produces 1 row; the total is what matters.
    const { rows } = await pool.query(
      'SELECT SUM(words_added)::int AS total FROM daily_stats WHERE user_id = $1',
      [u.id],
    );
    expect(Number(rows[0].total)).toBe(120); // 50 + 70
  });

  it('treats a null oldCount as 0', async () => {
    const u = await makeUser();
    await recordDelta(pool, u.id, null, 80);
    const { rows } = await pool.query(
      'SELECT words_added FROM daily_stats WHERE user_id = $1',
      [u.id],
    );
    expect(Number(rows[0].words_added)).toBe(80);
  });

  it('treats a null newCount as 0 (no insert)', async () => {
    const u = await makeUser();
    await recordDelta(pool, u.id, 0, null);
    const { rows } = await pool.query(
      'SELECT * FROM daily_stats WHERE user_id = $1',
      [u.id],
    );
    expect(rows).toHaveLength(0);
  });
});

// ── getHeatmapData ────────────────────────────────────────────────────────────

describe('getHeatmapData', () => {
  it('returns an empty array when no stats exist', async () => {
    const u = await makeUser();
    const result = await getHeatmapData(pool, u.id);
    expect(result).toEqual([]);
  });

  it('returns only the requesting user\'s rows (cross-user isolation)', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await insertStat(a.id, daysAgoStr(5), 100);
    await insertStat(b.id, daysAgoStr(5), 200);

    const result = await getHeatmapData(pool, a.id);
    expect(result).toHaveLength(1);
    expect(result[0].words_added).toBe(100);
  });

  it('omits rows older than 365 days', async () => {
    const u = await makeUser();
    await insertStat(u.id, daysAgoStr(400), 999); // outside window
    await insertStat(u.id, daysAgoStr(10), 50);   // inside window

    const result = await getHeatmapData(pool, u.id);
    expect(result).toHaveLength(1);
    expect(result[0].words_added).toBe(50);
  });

  it('includes rows exactly at the 364-day boundary', async () => {
    const u = await makeUser();
    await insertStat(u.id, daysAgoStr(364), 77);

    const result = await getHeatmapData(pool, u.id);
    expect(result.some((r) => r.words_added === 77)).toBe(true);
  });

  it('normalises stat_date to a YYYY-MM-DD string', async () => {
    const u = await makeUser();
    const date = daysAgoStr(3);
    await insertStat(u.id, date, 75);

    const result = await getHeatmapData(pool, u.id);
    expect(result[0].stat_date).toBe(date);
    expect(typeof result[0].stat_date).toBe('string');
    expect(result[0].stat_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns words_added as a JS number, not a string', async () => {
    const u = await makeUser();
    await insertStat(u.id, daysAgoStr(1), 42);

    const result = await getHeatmapData(pool, u.id);
    expect(typeof result[0].words_added).toBe('number');
  });
});

// ── getPaceData ───────────────────────────────────────────────────────────────

describe('getPaceData', () => {
  it('returns exactly 30 entries by default', async () => {
    const u = await makeUser();
    const result = await getPaceData(pool, u.id);
    expect(result).toHaveLength(30);
  });

  it('returns exactly N entries for a custom day count', async () => {
    const u = await makeUser();
    const result = await getPaceData(pool, u.id, 7);
    expect(result).toHaveLength(7);
  });

  it('fills days with no activity as words_added = 0', async () => {
    const u = await makeUser();
    const result = await getPaceData(pool, u.id, 7);
    expect(result.every((r) => r.words_added === 0)).toBe(true);
  });

  it('includes the correct word count for a day with activity', async () => {
    const u = await makeUser();
    await insertStat(u.id, daysAgoStr(3), 300);

    const result = await getPaceData(pool, u.id, 7);
    const hit = result.find((r) => r.stat_date === daysAgoStr(3));
    expect(hit).toBeDefined();
    expect(hit.words_added).toBe(300);
  });

  it('returns 0 for all entries when all stats are outside the window', async () => {
    const u = await makeUser();
    await insertStat(u.id, daysAgoStr(60), 500); // outside default 30-day window

    const result = await getPaceData(pool, u.id);
    expect(result.every((r) => r.words_added === 0)).toBe(true);
  });

  it('each entry has stat_date in YYYY-MM-DD format', async () => {
    const u = await makeUser();
    const result = await getPaceData(pool, u.id, 5);
    for (const r of result) {
      expect(r.stat_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('entries are ordered from oldest to newest', async () => {
    const u = await makeUser();
    const result = await getPaceData(pool, u.id, 7);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].stat_date >= result[i - 1].stat_date).toBe(true);
    }
  });
});

// ── getSummary (also covers computeStreaks indirectly) ────────────────────────

describe('getSummary', () => {
  it('returns all zeros for a user with no activity', async () => {
    const u = await makeUser();
    const s = await getSummary(pool, u.id);
    expect(s.total_doc_words).toBe(0);
    expect(s.words_this_year).toBe(0);
    expect(s.writing_days_this_year).toBe(0);
    expect(s.current_streak).toBe(0);
    expect(s.best_streak).toBe(0);
  });

  it('sums total_doc_words across all documents for the user', async () => {
    const u = await makeUser();
    const p = await makeProject(u.id);
    await pool.query(
      `INSERT INTO documents (project_id, user_id, title, word_count)
       VALUES ($1, $2, 'D1', 200), ($1, $2, 'D2', 350)`,
      [p.id, u.id],
    );
    const s = await getSummary(pool, u.id);
    expect(s.total_doc_words).toBe(550);
  });

  it('sums words_this_year from daily_stats within the requested year', async () => {
    const u = await makeUser();
    const year = new Date().getFullYear();
    await insertStat(u.id, `${year}-01-15`, 400);
    await insertStat(u.id, `${year}-03-01`, 600);
    await insertStat(u.id, `${year - 1}-12-31`, 999); // previous year — excluded

    const s = await getSummary(pool, u.id, year);
    expect(s.words_this_year).toBe(1000);
  });

  it('counts writing_days_this_year correctly', async () => {
    const u = await makeUser();
    const year = new Date().getFullYear();
    await insertStat(u.id, `${year}-02-01`, 100);
    await insertStat(u.id, `${year}-02-02`, 200);
    await insertStat(u.id, `${year - 1}-02-01`, 300); // excluded

    const s = await getSummary(pool, u.id, year);
    expect(s.writing_days_this_year).toBe(2);
  });

  it('excludes previous-year stats when queried for the current year', async () => {
    const u = await makeUser();
    const year = new Date().getFullYear();
    await insertStat(u.id, `${year - 1}-06-15`, 5000); // last year

    const s = await getSummary(pool, u.id, year);
    expect(s.words_this_year).toBe(0);
    expect(s.writing_days_this_year).toBe(0);
  });

  it('current_streak is 0 when the most recent write was 2+ days ago', async () => {
    const u = await makeUser();
    await insertStat(u.id, daysAgoStr(2), 100);
    await insertStat(u.id, daysAgoStr(3), 100);

    const s = await getSummary(pool, u.id);
    expect(s.current_streak).toBe(0);
    expect(s.best_streak).toBe(2);
  });

  it('current_streak is 1 for a single write today', async () => {
    const u = await makeUser();
    await insertStat(u.id, daysAgoStr(0), 100);

    const s = await getSummary(pool, u.id);
    expect(s.current_streak).toBe(1);
    expect(s.best_streak).toBe(1);
  });

  it('current_streak is 1 for a single write yesterday', async () => {
    const u = await makeUser();
    await insertStat(u.id, daysAgoStr(1), 100);

    const s = await getSummary(pool, u.id);
    expect(s.current_streak).toBe(1);
    expect(s.best_streak).toBe(1);
  });

  it('current_streak counts consecutive days ending today', async () => {
    const u = await makeUser();
    await insertStat(u.id, daysAgoStr(0), 100);
    await insertStat(u.id, daysAgoStr(1), 200);
    await insertStat(u.id, daysAgoStr(2), 150);

    const s = await getSummary(pool, u.id);
    expect(s.current_streak).toBe(3);
    expect(s.best_streak).toBe(3);
  });

  it('current_streak resets on a gap even if today has a write', async () => {
    const u = await makeUser();
    await insertStat(u.id, daysAgoStr(0), 100); // today
    // gap: no write yesterday
    await insertStat(u.id, daysAgoStr(2), 100); // 2 days ago

    const s = await getSummary(pool, u.id);
    expect(s.current_streak).toBe(1); // only today
  });

  it('best_streak tracks the longest historical run even after it ended', async () => {
    const u = await makeUser();
    // Old 4-day streak ending 10 days ago
    await insertStat(u.id, daysAgoStr(10), 100);
    await insertStat(u.id, daysAgoStr(11), 100);
    await insertStat(u.id, daysAgoStr(12), 100);
    await insertStat(u.id, daysAgoStr(13), 100);
    // Current 2-day streak
    await insertStat(u.id, daysAgoStr(0), 100);
    await insertStat(u.id, daysAgoStr(1), 100);

    const s = await getSummary(pool, u.id);
    expect(s.current_streak).toBe(2);
    expect(s.best_streak).toBe(4);
  });

  it('does not include another user\'s documents or stats (cross-user isolation)', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const pa = await makeProject(a.id);
    await pool.query(
      `INSERT INTO documents (project_id, user_id, title, word_count) VALUES ($1, $2, 'D', 999)`,
      [pa.id, a.id],
    );
    await insertStat(a.id, daysAgoStr(0), 999);

    const s = await getSummary(pool, b.id);
    expect(s.total_doc_words).toBe(0);
    expect(s.words_this_year).toBe(0);
    expect(s.current_streak).toBe(0);
  });
});
