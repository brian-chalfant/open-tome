import { Router } from 'express';
import logger from '../../logger.js';
import { getDb } from '../../db/migrate.js';
import {
  listAllProjectsAdmin, getProjectAdmin, getProjectDocumentsAdmin, deleteProjectAdmin,
} from '../adminDb.js';
import { projectsListView, projectDetailView } from '../views/projects.js';
import { requireAdminCsrf, adminCsrfToken } from '../auth.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const projects = await listAllProjectsAdmin(getDb());
    res.send(projectsListView({ projects, path: req.path, csrf: adminCsrfToken(req.cookies?.admin_session) }));
  } catch (err) {
    logger.error({ err: err.message }, 'admin route error');
    res.status(500).send('<pre style="color:#fca5a5;background:#0f172a;padding:1rem">Internal error. Check server logs.</pre>');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db  = getDb();
    const id  = parseInt(req.params.id, 10);
    const [project, documents] = await Promise.all([
      getProjectAdmin(db, id),
      getProjectDocumentsAdmin(db, id),
    ]);
    if (!project) return res.status(404).send('Project not found');
    res.send(projectDetailView({ project, documents, path: req.path, csrf: adminCsrfToken(req.cookies?.admin_session) }));
  } catch (err) {
    logger.error({ err: err.message }, 'admin route error');
    res.status(500).send('<pre style="color:#fca5a5;background:#0f172a;padding:1rem">Internal error. Check server logs.</pre>');
  }
});

router.post('/:id/delete', requireAdminCsrf, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await deleteProjectAdmin(getDb(), id);
    logger.info({ action: 'admin:delete_project', target_id: id }, 'admin action');
    res.redirect('/admin/projects');
  } catch (err) {
    logger.error({ err: err.message }, 'admin route error');
    res.status(500).send('<pre style="color:#fca5a5;background:#0f172a;padding:1rem">Internal error. Check server logs.</pre>');
  }
});

export default router;
