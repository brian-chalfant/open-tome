import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getDb } from '../db/migrate.js';
import {
  createUser, getUserByEmail, countUsers, touchLastLogin,
  bumpTokenVersion, updateUserTheme, updateManuscriptInfo, deleteUser,
  createInviteToken, consumeInviteToken,
} from '../db/userDb.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/ownership.js';

const router = Router();

const BCRYPT_ROUNDS = 12;

router.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.E2E === 'true',
}));

// ── Cookie helper ─────────────────────────────────────────────────────────────

function issueAuthCookie(res, user) {
  const secret = process.env.JWT_SECRET;
  const expiry = process.env.JWT_EXPIRY ?? '7d';
  const token = jwt.sign(
    { sub: user.id, tv: user.token_version },
    secret,
    { expiresIn: expiry, algorithm: 'HS256' }
  );
  res.cookie('tome_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms (matches default JWT_EXPIRY)
  });
}

// ── Registration ──────────────────────────────────────────────────────────────

const signupSchema = z.object({
  email:        z.string().trim().toLowerCase().email().max(200),
  display_name: z.string().min(1).max(200).trim(),
  password:     z.string().min(8).max(128),
  invite_token: z.string().optional(),
});

/**
 * POST /api/auth/signup
 * Creates a new account. The first user in the DB becomes admin automatically.
 * All subsequent registrations require a valid invite token.
 */
router.post('/signup', asyncHandler(async (req, res) => {
  const result = signupSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid input', details: result.error.flatten() });
  }

  const { email, display_name, password, invite_token } = result.data;
  const db = getDb();

  const userCount = await countUsers(db);
  const isFirst   = userCount === 0;

  if (!isFirst && !invite_token) {
    return res.status(403).json({ error: 'An invite token is required to register' });
  }

  // Check for a duplicate account before consuming the invite so a failed
  // signup doesn't burn a single-use token.
  const existing = await getUserByEmail(db, email);
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  if (!isFirst) {
    const valid = await consumeInviteToken(db, invite_token);
    if (!valid) {
      return res.status(403).json({ error: 'Invalid or expired invite token' });
    }
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await createUser(db, {
    email,
    displayName:  display_name,
    passwordHash,
    isAdmin: isFirst,
  });

  issueAuthCookie(res, user);
  res.status(201).json({
    id:           user.id,
    display_name: user.display_name,
    email:        user.email,
    is_admin:     user.is_admin,
    theme:        user.theme,
  });
}));

// ── Login ─────────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email:    z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(128),
});

/**
 * POST /api/auth/login
 * Verifies credentials and issues a JWT session cookie.
 */
router.post('/login', asyncHandler(async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const { email, password } = result.data;
  const db = getDb();

  const user = await getUserByEmail(db, email);
  // Always run bcrypt to prevent timing-based user enumeration
  const dummyHash = '$2b$12$invalidhashpaddingthatisnotreal000000000000000000000000';
  const match = user
    ? await bcrypt.compare(password, user.password_hash)
    : await bcrypt.compare(password, dummyHash).then(() => false);

  if (!match) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  await touchLastLogin(db, user.id);
  issueAuthCookie(res, user);
  res.json({
    id:           user.id,
    display_name: user.display_name,
    email:        user.email,
    is_admin:     user.is_admin,
    theme:        user.theme,
  });
}));

// ── Current user ──────────────────────────────────────────────────────────────

router.get('/me', requireAuth, (req, res) => {
  res.json({
    id:            req.user.id,
    display_name:  req.user.display_name,
    email:         req.user.email,
    is_admin:      req.user.is_admin,
    avatar_url:    req.user.avatar_url,
    theme:         req.user.theme,
    ms_legal_name: req.user.ms_legal_name ?? null,
    ms_pen_name:   req.user.ms_pen_name   ?? null,
    ms_address:    req.user.ms_address    ?? null,
    ms_phone:      req.user.ms_phone      ?? null,
    ms_email:      req.user.ms_email      ?? null,
  });
});

// ── Theme preference ──────────────────────────────────────────────────────────

const themeSchema = z.object({ theme: z.enum(['light', 'dark', 'tome']) });

router.patch('/me/theme', requireAuth, asyncHandler(async (req, res) => {
  const result = themeSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: 'Invalid theme value' });
  await updateUserTheme(getDb(), req.user.id, result.data.theme);
  res.json({ theme: result.data.theme });
}));

// ── Manuscript info ───────────────────────────────────────────────────────────

const manuscriptSchema = z.object({
  ms_legal_name: z.string().max(200).nullable(),
  ms_pen_name:   z.string().max(200).nullable(),
  ms_address:    z.string().max(500).nullable(),
  ms_phone:      z.string().max(50).nullable(),
  ms_email:      z.union([z.string().email().max(200), z.literal(''), z.null()]),
});

router.patch('/me/manuscript', requireAuth, asyncHandler(async (req, res) => {
  const result = manuscriptSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: 'Invalid input', details: result.error.flatten() });
  await updateManuscriptInfo(getDb(), req.user.id, result.data);
  res.status(204).end();
}));

// ── Self-deletion ─────────────────────────────────────────────────────────────

router.delete('/me', requireAuth, asyncHandler(async (req, res) => {
  await deleteUser(getDb(), req.user.id);
  res.clearCookie('tome_token');
  res.status(204).end();
}));

// ── Logout ────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/logout
 * Bumps token_version to invalidate the current JWT, then clears the cookie.
 */
router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  await bumpTokenVersion(getDb(), req.user.id);
  res.clearCookie('tome_token');
  res.status(204).end();
}));

// ── Invite token generation (admin only) ──────────────────────────────────────

/**
 * POST /api/auth/invite
 * Generates a single-use invite token. Requires admin privileges.
 */
router.post('/invite', requireAuth, asyncHandler(async (req, res) => {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const token = await createInviteToken(getDb(), req.user.id);
  res.json({ token });
}));

export default router;
