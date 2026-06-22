/**
 * @file routes/health.js
 * @description Liveness probe endpoint for Docker health checks.
 *
 * Docker and the frontend Nginx proxy call `GET /api/health` to determine
 * whether the backend process is running. Returning 200 with `{ status: 'ok' }`
 * is sufficient — no DB check is needed here because an unhealthy DB would
 * cause other endpoints to fail and be detected by application-level monitoring.
 *
 * Mounted at: GET /api/health  (via index.js)
 */

import { Router } from 'express';

const router = Router();

/**
 * GET /api/health
 * Returns a 200 response with a static status payload.
 * Used by Docker HEALTHCHECK and the Nginx `depends_on: condition: service_healthy` config.
 */
router.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

export default router;
