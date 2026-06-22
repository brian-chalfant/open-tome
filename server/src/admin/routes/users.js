import { Router } from 'express';
import logger from '../../logger.js';
import { getDb } from '../../db/migrate.js';
import { getUserById } from '../../db/userDb.js';
import {
  listAllUsers, getUserStats, getUserProjects, deleteUser,
} from '../adminDb.js';
import { usersListView, userDetailView } from '../views/users.js';
import { requireAdminCsrf, adminCsrfToken } from '../auth.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const users = await listAllUsers(getDb());
    res.send(usersListView({ users, path: req.path, csrf: adminCsrfToken(req.cookies?.admin_session) }));
  } catch (err) {
    logger.error({ err: err.message }, 'admin route error');
    res.status(500).send('<pre style="color:#fca5a5;background:#0f172a;padding:1rem">Internal error. Check server logs.</pre>');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const [user, totalWords, projects] = await Promise.all([
      getUserById(db, req.params.id),
      getUserStats(db, req.params.id),
      getUserProjects(db, req.params.id),
    ]);
    if (!user) return res.status(404).send('User not found');
    res.send(userDetailView({ user, totalWords, projects, path: req.path, csrf: adminCsrfToken(req.cookies?.admin_session) }));
  } catch (err) {
    logger.error({ err: err.message }, 'admin route error');
    res.status(500).send('<pre style="color:#fca5a5;background:#0f172a;padding:1rem">Internal error. Check server logs.</pre>');
  }
});

router.post('/:id/delete', requireAdminCsrf, async (req, res) => {
  try {
    await deleteUser(getDb(), req.params.id);
    logger.info({ action: 'admin:delete_user', target_id: req.params.id }, 'admin action');
    res.redirect('/admin/users');
  } catch (err) {
    logger.error({ err: err.message }, 'admin route error');
    res.status(500).send('<pre style="color:#fca5a5;background:#0f172a;padding:1rem">Internal error. Check server logs.</pre>');
  }
});

export default router;
