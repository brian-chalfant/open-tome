/**
 * @file index.js
 * @description Main entry point for the tome-app backend server.
 */

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';

import { initDb, closeDb } from './db/migrate.js';
import { attachWebSocketServer } from './websocket.js';
import logger from './logger.js';
import { requestLogger } from './middleware/requestLogger.js';

// ── Process-level error handlers ─────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  logger.error({ err: err.message, stack: err.stack }, 'uncaughtException');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason: String(reason) }, 'unhandledRejection');
  process.exit(1);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', async () => { await closeDb(); process.exit(0); });
process.on('SIGINT',  async () => { await closeDb(); process.exit(0); });

// ── Route imports ─────────────────────────────────────────────────────────────
import healthRouter    from './routes/health.js';
import authRouter      from './routes/auth.js';
import projectsRouter  from './routes/projects.js';
import documentsRouter from './routes/documents.js';
import labelsRouter    from './routes/labels.js';
import compileRouter   from './routes/compile.js';
import analyticsRouter from './routes/analytics.js';

const {
  PORT = 3001,
  ALLOWED_ORIGIN,
  NODE_ENV,
} = process.env;

// ── Startup guards (production only) ─────────────────────────────────────────
if (NODE_ENV === 'production' && !ALLOWED_ORIGIN) {
  logger.fatal('ALLOWED_ORIGIN is not set — refusing to start in production (CORS would be open)');
  process.exit(1);
}
if (NODE_ENV === 'production' && !process.env.MANUSCRIPT_ENCRYPTION_KEY) {
  logger.fatal('MANUSCRIPT_ENCRYPTION_KEY is not set — refusing to start in production (PII would be stored in plaintext)');
  process.exit(1);
}
if (NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  logger.fatal('JWT_SECRET is not set — refusing to start in production');
  process.exit(1);
}
if (NODE_ENV === 'production' && (process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('change-me'))) {
  logger.fatal('JWT_SECRET is too weak (placeholder or < 32 chars) — refusing to start in production');
  process.exit(1);
}

// ── Database ──────────────────────────────────────────────────────────────────
logger.info('Initializing database');
await initDb();
logger.info('Database initialized');

// ── Express application ───────────────────────────────────────────────────────
export const app = express();

// Trust the single nginx reverse proxy in front of this service.
// Required for express-rate-limit to read X-Forwarded-For correctly,
// and for req.secure to reflect the original HTTPS connection.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin:      ALLOWED_ORIGIN,
  credentials: true,
  methods:     ['GET', 'POST', 'PATCH', 'DELETE'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(requestLogger);

app.use(rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             1000,
  standardHeaders: true,
  legacyHeaders:   false,
    // Skip rate limiting only during E2E test runs. In Docker the Playwright workers
    // share an IP so parallel runs hit the limit immediately. Use E2E=true explicitly
    // rather than "anything that isn't production" so staging retains rate limiting.
    skip:            () => process.env.E2E === 'true',
}));

app.use('/api/health',   healthRouter);
app.use('/api/auth',     authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api',          documentsRouter);
app.use('/api',          labelsRouter);
app.use('/api',          compileRouter);
app.use('/api',          analyticsRouter);

// Final error handler — catches any error not handled by asyncHandler so
// the process doesn't crash on a thrown route exception. The 4-arg signature
// is required by Express to recognise this as an error-handling middleware.
app.use((err, req, res, _next) => {
  logger.error({ err: err.message, stack: err.stack, path: req.path }, 'unhandled route error');
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
});

// ── HTTP server ───────────────────────────────────────────────────────────────
export const server = createServer(app);
attachWebSocketServer(server);

if (NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    logger.info({ port: Number(PORT) }, 'tome-app server listening');
  });
}

if (process.env.ADMIN_SECRET) {
  const { startAdminServer } = await import('./admin/index.js');
  startAdminServer();
}
