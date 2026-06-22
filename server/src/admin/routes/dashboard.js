import { Router } from 'express';
import logger from '../../logger.js';
import { getDb } from '../../db/migrate.js';
import {
  getDashboardStats, getNewUsersCount, getTopWriters, getDbSize,
} from '../adminDb.js';
import { dashboardView } from '../views/dashboard.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const [stats, newUsers, topWriters, dbSize] = await Promise.all([
      getDashboardStats(db),
      getNewUsersCount(db),
      getTopWriters(db, 5),
      getDbSize(db),
    ]);
    res.send(dashboardView({ stats, newUsers, topWriters, dbSize, path: req.path }));
  } catch (err) {
    logger.error({ err: err.message }, 'admin route error');
    res.status(500).send('<pre style="color:#fca5a5;background:#0f172a;padding:1rem">Internal error. Check server logs.</pre>');
  }
});

export default router;
