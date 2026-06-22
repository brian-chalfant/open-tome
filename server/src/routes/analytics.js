/**
 * @file routes/analytics.js
 * @description Writing analytics API — one endpoint returns all profile data.
 */

import { Router } from 'express';
import { getDb } from '../db/migrate.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getHeatmapData, getPaceData, getSummary } from '../db/analyticsDb.js';

const router = Router();
router.use(requireAuth);

/** GET /api/analytics — full profile data (heatmap + pace + current-year summary). */
router.get('/analytics', async (req, res) => {
  const db     = getDb();
  const userId = req.user.id;

  const [heatmap, pace, summary] = await Promise.all([
    getHeatmapData(db, userId),
    getPaceData(db, userId, 30),
    getSummary(db, userId),
  ]);

  res.json({ heatmap, pace, summary });
});

/** GET /api/analytics/summary?year=YYYY — year-scoped stat cards only. */
router.get('/analytics/summary', async (req, res) => {
  const db     = getDb();
  const userId = req.user.id;
  const year   = parseInt(req.query.year, 10);

  if (!Number.isFinite(year) || year < 2000 || year > new Date().getFullYear()) {
    return res.status(400).json({ error: 'Invalid year' });
  }

  const summary = await getSummary(db, userId, year);
  res.json({ summary });
});

export default router;
