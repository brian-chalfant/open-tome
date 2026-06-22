/**
 * @file test/helpers/makeTestUser.js
 * @description Creates DB test users with a deterministic UUID for supertest auth.
 *
 * Tests authenticate via an X-Test-User-Id header (accepted by requireAuth
 * when NODE_ENV === 'test') instead of JWT cookies.
 *
 * Usage:
 *   const { user, headers } = await makeTestUser(getDb(), 'Alice');
 *   const res = await request(app).get('/api/projects').set(headers);
 */

let _seq = 0;

/**
 * Insert a user into the DB and return the user record plus auth headers
 * for supertest.
 *
 * @param {import('pg').Pool} db
 * @param {string} [name]
 * @param {string} [prefix]  - Prefix for email uniqueness across test files.
 * @returns {Promise<{ user: object, headers: object }>}
 */
export async function makeTestUser(db, name = 'User', prefix = 'test') {
  const seq   = ++_seq;
  const email = `${prefix}-user-${seq}@test.example`;

  const { rows } = await db.query(
    `INSERT INTO users (email, display_name, password_hash)
     VALUES ($1, $2, 'not-a-real-hash')
     ON CONFLICT (email) DO UPDATE
       SET display_name = EXCLUDED.display_name
     RETURNING id`,
    [email, name],
  );

  const { rows: [user] } = await db.query(
    `SELECT id, display_name, email, avatar_url, token_version, theme,
            ms_legal_name, ms_pen_name, ms_address, ms_phone, ms_email
     FROM users WHERE id = $1`,
    [rows[0].id],
  );

  return { user, headers: { 'x-test-user-id': user.id } };
}
