/**
 * @file db/analyticsDb.js
 * @description Database helpers for writing analytics (daily_stats table).
 *
 * Date arithmetic is done in JS rather than SQL (no generate_series, TO_CHAR,
 * or DATE_TRUNC) so the queries work identically in pg-mem (dev) and real
 * PostgreSQL (production).
 */

/** Normalize a DATE value from pg to a 'YYYY-MM-DD' string.
 *  Real Postgres (with the type parser in migrate.js) returns the raw string.
 *  pg-mem may return a Date object. Both are handled here.
 */
function toDateStr(val) {
  if (typeof val === 'string') return val.slice(0, 10);
  if (val instanceof Date)    return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

/** ISO date string for N days before today (local midnight). */
function daysAgo(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Record a positive word-count delta for today (UTC date).
 * Called after every successful document save.
 * Only positive deltas are recorded — pruning/deletion does not subtract words.
 */
export async function recordDelta(db, userId, oldCount, newCount) {
  const delta = (newCount ?? 0) - (oldCount ?? 0);
  if (delta <= 0) return;

  await db.query(
    `INSERT INTO daily_stats (user_id, stat_date, words_added)
     VALUES ($1, CURRENT_DATE, $2)
     ON CONFLICT (user_id, stat_date)
     DO UPDATE SET words_added = daily_stats.words_added + EXCLUDED.words_added`,
    [userId, delta],
  );
}

/**
 * Return heatmap data: one row per day the user wrote something in the last 365 days.
 * Days with zero activity are omitted — the client fills gaps with level-0 cells.
 *
 * @returns {Promise<Array<{stat_date: string, words_added: number}>>}
 */
export async function getHeatmapData(db, userId) {
  const cutoff = daysAgo(364);
  const { rows } = await db.query(
    `SELECT stat_date, words_added
     FROM daily_stats
     WHERE user_id = $1
       AND stat_date >= $2
     ORDER BY stat_date`,
    [userId, cutoff],
  );
  return rows.map((r) => ({
    stat_date:   toDateStr(r.stat_date),
    words_added: Number(r.words_added),
  }));
}

/**
 * Return pace data: the last N days of writing activity including zero-word days.
 * Gap-filling is done in JS so generate_series is not required.
 *
 * @returns {Promise<Array<{stat_date: string, words_added: number}>>}
 */
export async function getPaceData(db, userId, days = 30) {
  const startDate = daysAgo(days - 1);
  const { rows } = await db.query(
    `SELECT stat_date, words_added
     FROM daily_stats
     WHERE user_id = $1
       AND stat_date >= $2
     ORDER BY stat_date`,
    [userId, startDate],
  );

  const lookup = Object.fromEntries(
    rows.map((r) => [toDateStr(r.stat_date), Number(r.words_added)]),
  );

  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const iso = daysAgo(i);
    result.push({ stat_date: iso, words_added: lookup[iso] ?? 0 });
  }
  return result;
}

/**
 * Return summary statistics for a user's writing activity.
 *
 * @returns {Promise<{
 *   total_doc_words: number,
 *   words_this_year: number,
 *   writing_days_this_year: number,
 *   current_streak: number,
 *   best_streak: number
 * }>}
 */
export async function getSummary(db, userId, year = new Date().getFullYear()) {
  const yearStart = `${year}-01-01`;
  const yearEnd   = `${year + 1}-01-01`;

  const [{ rows: [docRow] }, { rows: [yearRow] }, { rows: dayRows }] = await Promise.all([
    db.query(
      `SELECT COALESCE(SUM(word_count), 0)::int AS total_doc_words
       FROM documents WHERE user_id = $1`,
      [userId],
    ),
    db.query(
      `SELECT COALESCE(SUM(words_added), 0)::int          AS words_this_year,
              COUNT(*) FILTER (WHERE words_added > 0)::int AS writing_days_this_year
       FROM daily_stats
       WHERE user_id = $1
         AND stat_date >= $2
         AND stat_date < $3`,
      [userId, yearStart, yearEnd],
    ),
    db.query(
      `SELECT stat_date FROM daily_stats
       WHERE user_id = $1 AND words_added > 0
       ORDER BY stat_date DESC`,
      [userId],
    ),
  ]);

  const dates = dayRows.map((r) => toDateStr(r.stat_date));
  const { currentStreak, bestStreak } = computeStreaks(dates);

  return {
    total_doc_words:        docRow.total_doc_words,
    words_this_year:        yearRow.words_this_year,
    writing_days_this_year: yearRow.writing_days_this_year,
    current_streak:         currentStreak,
    best_streak:            bestStreak,
  };
}

/**
 * Compute current and best writing streaks from an array of date strings
 * ('YYYY-MM-DD'), sorted descending (most recent first).
 * Current streak: consecutive days ending today or yesterday.
 */
function computeStreaks(dates) {
  if (dates.length === 0) return { currentStreak: 0, bestStreak: 0 };

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let runLength     = 1;
  let bestStreak    = 1;
  let inCurrentRun  = true;
  let currentStreak = 0;

  const first        = new Date(dates[0] + 'T00:00:00Z');
  const diffFromToday = Math.round((today - first) / 86_400_000);
  if (diffFromToday > 1) inCurrentRun = false;

  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T00:00:00Z');
    const curr = new Date(dates[i]     + 'T00:00:00Z');
    const gap  = Math.round((prev - curr) / 86_400_000);

    if (gap === 1) {
      runLength++;
    } else {
      if (inCurrentRun) { currentStreak = runLength; inCurrentRun = false; }
      bestStreak = Math.max(bestStreak, runLength);
      runLength  = 1;
    }
  }

  bestStreak = Math.max(bestStreak, runLength);
  if (inCurrentRun) currentStreak = runLength;

  return { currentStreak, bestStreak };
}
