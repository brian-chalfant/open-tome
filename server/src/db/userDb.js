import crypto from 'crypto';
import { encryptField, decryptField, isEncrypted } from '../lib/crypto.js';

function decryptMsFields(user) {
  if (!user) return user;
  const key = process.env.MANUSCRIPT_ENCRYPTION_KEY ?? null;
  return {
    ...user,
    ms_legal_name: decryptField(user.ms_legal_name, key),
    ms_pen_name:   decryptField(user.ms_pen_name,   key),
    ms_address:    decryptField(user.ms_address,     key),
    ms_phone:      decryptField(user.ms_phone,       key),
    ms_email:      decryptField(user.ms_email,       key),
  };
}

/**
 * Fetch a user by their UUID primary key.
 * Does not return password_hash — use getUserByEmail for login verification.
 */
export async function getUserById(db, id) {
  const { rows } = await db.query(
    `SELECT id, email, display_name, avatar_url, is_admin, token_version, theme,
            ms_legal_name, ms_pen_name, ms_address, ms_phone, ms_email
     FROM users WHERE id = $1`,
    [id]
  );
  return decryptMsFields(rows[0]);
}

/**
 * Fetch a user by email including their password_hash for login verification.
 */
export async function getUserByEmail(db, email) {
  const { rows } = await db.query(
    `SELECT id, email, display_name, avatar_url, is_admin, token_version, theme, password_hash
     FROM users WHERE email = $1`,
    [email]
  );
  return rows[0];
}

/**
 * Insert a new user. isAdmin should be true only for the first registered user.
 */
export async function createUser(db, { email, displayName, passwordHash, isAdmin = false }) {
  const { rows } = await db.query(
    `INSERT INTO users (email, display_name, password_hash, is_admin)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [email.toLowerCase().trim(), displayName, passwordHash, isAdmin]
  );
  return getUserById(db, rows[0].id);
}

/** Returns the total number of registered users. Used to detect first-user registration. */
export async function countUsers(db) {
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM users');
  return rows[0].n;
}

/** Update last_login_at timestamp on successful login. */
export async function touchLastLogin(db, id) {
  await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [id]);
}

// ── Invite tokens ─────────────────────────────────────────────────────────────

/** Generate a cryptographically random invite token and store it. */
export async function createInviteToken(db, adminUserId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.query(
    `INSERT INTO invite_tokens (token, created_by) VALUES ($1, $2)`,
    [token, adminUserId]
  );
  return token;
}

/**
 * Validate and consume an invite token in one atomic step.
 * Returns true if the token was valid and unused; false otherwise.
 */
export async function consumeInviteToken(db, token) {
  const { rows } = await db.query(
    `UPDATE invite_tokens
     SET used_at = NOW()
     WHERE token = $1
       AND used_at IS NULL
       AND expires_at > NOW()
     RETURNING id`,
    [token]
  );
  return rows.length > 0;
}

// ── User profile updates ──────────────────────────────────────────────────────

export async function updateManuscriptInfo(db, id, fields) {
  const key = process.env.MANUSCRIPT_ENCRYPTION_KEY ?? null;
  await db.query(
    `UPDATE users
     SET ms_legal_name = $1,
         ms_pen_name   = $2,
         ms_address    = $3,
         ms_phone      = $4,
         ms_email      = $5
     WHERE id = $6`,
    [
      encryptField(fields.ms_legal_name ?? null, key),
      encryptField(fields.ms_pen_name   ?? null, key),
      encryptField(fields.ms_address    ?? null, key),
      encryptField(fields.ms_phone      ?? null, key),
      encryptField(fields.ms_email      ?? null, key),
      id,
    ],
  );
}

/** Increment token_version to invalidate all existing JWTs for this user. */
export async function bumpTokenVersion(db, id) {
  await db.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [id]);
}

export async function updateUserTheme(db, id, theme) {
  await db.query('UPDATE users SET theme = $1 WHERE id = $2', [theme, id]);
}

export async function deleteUser(db, id) {
  await db.query('DELETE FROM users WHERE id = $1', [id]);
}

/**
 * Idempotent startup migration: encrypt any plaintext ms_* fields.
 * No-op when MANUSCRIPT_ENCRYPTION_KEY is unset.
 */
export async function encryptManuscriptFields(db) {
  const key = process.env.MANUSCRIPT_ENCRYPTION_KEY ?? null;
  if (!key) return;

  const { rows } = await db.query(
    `SELECT id, ms_legal_name, ms_pen_name, ms_address, ms_phone, ms_email
     FROM users
     WHERE ms_legal_name IS NOT NULL
        OR ms_pen_name   IS NOT NULL
        OR ms_address    IS NOT NULL
        OR ms_phone      IS NOT NULL
        OR ms_email      IS NOT NULL`
  );

  for (const row of rows) {
    const needsUpdate =
      (row.ms_legal_name && !isEncrypted(row.ms_legal_name)) ||
      (row.ms_pen_name   && !isEncrypted(row.ms_pen_name))   ||
      (row.ms_address    && !isEncrypted(row.ms_address))    ||
      (row.ms_phone      && !isEncrypted(row.ms_phone))      ||
      (row.ms_email      && !isEncrypted(row.ms_email));

    if (!needsUpdate) continue;

    await db.query(
      `UPDATE users
       SET ms_legal_name = $1, ms_pen_name = $2, ms_address = $3,
           ms_phone = $4, ms_email = $5
       WHERE id = $6`,
      [
        encryptField(row.ms_legal_name, key),
        encryptField(row.ms_pen_name,   key),
        encryptField(row.ms_address,    key),
        encryptField(row.ms_phone,      key),
        encryptField(row.ms_email,      key),
        row.id,
      ]
    );
  }
}
