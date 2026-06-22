import { Router } from 'express';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { backupsView } from '../views/backups.js';

const BACKUP_DIR = '/backups';
const router = Router();

router.get('/', (req, res) => {
  let files = null;
  let error = null;
  try {
    files = readdirSync(BACKUP_DIR)
      .filter(name => name.startsWith('open-tome_') && (name.endsWith('.sql') || name.endsWith('.sql.gpg')))
      .map(name => {
        const s = statSync(join(BACKUP_DIR, name));
        return { name, size: s.size, mtime: s.mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    error = 'Backup directory not accessible. '
      + 'Mount the backup-data volume to the backend service (see docker-compose.yml).';
  }
  res.send(backupsView({ files, error, path: req.path }));
});

export default router;
