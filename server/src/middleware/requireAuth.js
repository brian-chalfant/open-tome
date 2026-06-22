import jwt from 'jsonwebtoken';
import { getDb } from '../db/migrate.js';
import { getUserById } from '../db/userDb.js';

/**
 * Express middleware that validates the JWT session cookie on protected routes.
 *
 * Cookie name: tome_token (httpOnly, SameSite=Strict)
 * JWT payload: { sub: userId, tv: tokenVersion }
 *
 * The token_version field in the DB allows instant session invalidation on logout.
 */
export async function requireAuth(req, res, next) {
  // ── Test bypass ──────────────────────────────────────────────────────────────
  // Allows supertest suites to authenticate without a real JWT.
  // X-Test-User-Id header must contain a valid user UUID from the test DB.
  if (process.env.NODE_ENV === 'test') {
    const addr = req.socket?.remoteAddress ?? '';
    if (addr !== '127.0.0.1' && addr !== '::1' && addr !== '::ffff:127.0.0.1') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const testUserId = req.headers['x-test-user-id'];
    if (!testUserId) return res.status(401).json({ error: 'Unauthorized' });
    const user = await getUserById(getDb(), testUserId);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    return next();
  }

  // ── JWT cookie validation ─────────────────────────────────────────────────
  const token = req.cookies?.tome_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET not configured');

    const payload = jwt.verify(token, secret);
    const user = await getUserById(getDb(), payload.sub);

    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    // Mismatched token_version means the user logged out or a session was revoked
    if (user.token_version !== payload.tv) return res.status(401).json({ error: 'Unauthorized' });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
