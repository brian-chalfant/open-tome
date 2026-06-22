import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import authRouter, { requireAdminAuth } from './auth.js';
import dashboardRouter from './routes/dashboard.js';
import usersRouter from './routes/users.js';
import projectsRouter from './routes/projects.js';
import backupsRouter from './routes/backups.js';

export function startAdminServer() {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        scriptSrc:  ["'self'"],
        imgSrc:     ["'self'", "data:"],
      },
    },
  }));
  app.use(cookieParser());
  app.use(express.urlencoded({ extended: false }));

  // Unprotected: login / logout
  app.use('/admin', authRouter);

  // Redirect bare /admin (no trailing slash) to /admin/
  app.get(/^\/admin$/, (_req, res) => res.redirect('/admin/'));

  // All routes below require a valid session cookie
  app.use('/admin', requireAdminAuth);
  app.use('/admin',          dashboardRouter);
  app.use('/admin/users',    usersRouter);
  app.use('/admin/projects', projectsRouter);
  app.use('/admin/backups',  backupsRouter);

  app.listen(3002, '127.0.0.1', () => {
    console.log('Admin UI listening on http://127.0.0.1:3002/admin/');
  });
}
