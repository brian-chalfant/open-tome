/**
 * @file logger.js
 * @description Singleton pino logger shared across the entire backend.
 *
 * pino writes structured JSON to stdout on every log call. Docker captures
 * stdout and makes it available via `docker logs <container>`.
 *
 * Log level is controlled by the LOG_LEVEL environment variable:
 *   'trace' | 'debug' | 'info' (default) | 'warn' | 'error' | 'fatal'
 *
 * Usage:
 *   import logger from './logger.js';
 *   logger.info({ uid: 42, path: '/api/projects' }, 'request received');
 *   logger.error({ err: err.message }, 'something went wrong');
 *
 * IMPORTANT: Never log JWT values, auth tokens, cookie contents, or document
 * content. Log only request metadata: method, path, status, duration, user_id.
 */
import pino from 'pino';

/**
 * The shared logger instance.
 * `level` defaults to 'info' if LOG_LEVEL is not set in the environment.
 */
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export default logger;
