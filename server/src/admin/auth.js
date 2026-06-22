import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import logger from '../logger.js';
import { loginView } from './views/login.js';

const adminLoginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Try again later.',
});

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function sign(payload) {
  // Use a dedicated signing key separate from the login password (F-06).
  // Fall back to ADMIN_SECRET for backward compatibility during rollout.
  const signingKey = process.env.ADMIN_TOKEN_SIGNING_KEY ?? process.env.ADMIN_SECRET;
  return crypto
    .createHmac('sha256', signingKey)
    .update(payload)
    .digest('hex');
}

function makeToken() {
  const now = Date.now();
  const payload = Buffer
    .from(JSON.stringify({ iat: now, exp: now + 8 * 3600 * 1000 }))
    .toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expected = sign(payload);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      return false;
    }
  } catch {
    return false;
  }
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Date.now() < exp;
  } catch {
    return false;
  }
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict',
  secure:   process.env.NODE_ENV === 'production',
  maxAge:   8 * 3600 * 1000,
};

export function requireAdminAuth(req, res, next) {
  if (verifyToken(req.cookies?.admin_session)) return next();
  res.redirect('/admin/login');
}

/**
 * Derive a stateless CSRF token from the current admin session cookie.
 * Uses HMAC-SHA256(session_token, signing_key) so no server-side storage is needed.
 */
export function adminCsrfToken(sessionToken) {
  const key = process.env.ADMIN_TOKEN_SIGNING_KEY ?? process.env.ADMIN_SECRET ?? '';
  return crypto.createHmac('sha256', key).update(String(sessionToken ?? '')).digest('hex').slice(0, 32);
}

/**
 * Middleware: validate the _csrf hidden field on admin POST forms.
 */
export function requireAdminCsrf(req, res, next) {
  const expected = adminCsrfToken(req.cookies?.admin_session);
  if (req.body?._csrf === expected) return next();
  logger.warn({ path: req.path }, 'admin CSRF validation failed');
  res.status(403).send('Forbidden');
}

const router = Router();

router.get('/login', (_req, res) => {
  res.send(loginView({ error: null }));
});

router.post('/login', adminLoginLimit, (req, res) => {
  const submitted = sha256(req.body?.password ?? '');
  const expected  = sha256(process.env.ADMIN_SECRET ?? '');
  let match = false;
  try {
    match = crypto.timingSafeEqual(
      Buffer.from(submitted, 'hex'),
      Buffer.from(expected,  'hex'),
    );
  } catch { /* length mismatch should never happen with sha256 */ }

  if (match) {
    res.cookie('admin_session', makeToken(), COOKIE_OPTS);
    return res.redirect('/admin/');
  }
  res.status(401).send(loginView({ error: 'Invalid password' }));
});

router.post('/logout', (_req, res) => {
  res.clearCookie('admin_session');
  res.redirect('/admin/login');
});

export default router;
