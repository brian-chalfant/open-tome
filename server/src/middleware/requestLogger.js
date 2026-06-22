/**
 * @file middleware/requestLogger.js
 * @description Express middleware that logs structured request/response metadata.
 *
 * Listens for the `finish` event on the response, which fires after all response
 * headers and body have been sent. This ensures the status code is final.
 *
 * Security: Only safe metadata is logged — method, path, status, duration, and
 * user ID. NO request bodies, cookies, tokens, or user content are ever logged.
 */

import logger from '../logger.js';

/**
 * Log structured request metadata to stdout (via pino) when the response finishes.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requestLogger(req, res, next) {
  const start = Date.now(); // Capture timestamp before any async work begins

  res.on('finish', () => {
    logger.info({
      method: req.method,         // GET, POST, PATCH, DELETE
      path:   req.path,           // URL path (no query string — avoids logging sensitive params)
      status: res.statusCode,     // Final HTTP status code
      ms:     Date.now() - start, // Total response time in milliseconds
      uid:    req.user?.id ?? null, // User ID if authenticated, null for public routes
    });
  });

  next();
}
