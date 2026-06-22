/**
 * @file db/projectDb.js
 * @description Database operations for the `projects` table.
 *
 * All functions are async and accept a pg.Pool as the first argument.
 * All queries use $N parameterized statements — no string concatenation.
 */

// Normalise the deadline field to a plain 'YYYY-MM-DD' string.
// pg and pg-mem both return DATE columns as Date objects, which JSON.stringify
// converts to full ISO timestamps ("2026-12-31T00:00:00.000Z"). Client code that
// appends "T00:00:00" to parse as local midnight would then produce an invalid
// date string and get NaN. Slicing to 10 chars fixes both Date objects and
// already-full ISO strings, leaving bare 'YYYY-MM-DD' strings untouched.
function fmtProject(row) {
  if (!row) return row;
  const dl = row.deadline;
  return {
    ...row,
    deadline: dl instanceof Date
      ? dl.toISOString().slice(0, 10)
      : typeof dl === 'string' ? dl.slice(0, 10) : null,
  };
}

/**
 * Return all projects belonging to a user, ordered by most-recently-updated first.
 *
 * @param {import('pg').Pool} db
 * @param {number} userId
 * @returns {Promise<object[]>}
 */
export async function listProjects(db, userId) {
  const { rows } = await db.query(
    `SELECT id, title, archived, target_words, deadline, created_at, updated_at
     FROM projects WHERE user_id = $1 AND archived = false ORDER BY updated_at DESC`,
    [userId]
  );
  return rows.map(fmtProject);
}

export async function listAllProjects(db, userId) {
  const { rows } = await db.query(
    `SELECT id, title, archived, target_words, deadline, created_at, updated_at
     FROM projects WHERE user_id = $1 ORDER BY archived, updated_at DESC`,
    [userId]
  );
  return rows.map(fmtProject);
}

export async function archiveProject(db, id, archived) {
  await db.query(
    'UPDATE projects SET archived = $1, updated_at = NOW() WHERE id = $2',
    [archived, id]
  );
  return getProjectById(db, id);
}

/**
 * Fetch a single project by its primary key (no user filter — callers must verify ownership).
 *
 * @param {import('pg').Pool} db
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
export async function getProjectById(db, id) {
  const { rows } = await db.query('SELECT * FROM projects WHERE id = $1', [id]);
  return fmtProject(rows[0]);
}

/**
 * Create a new project for a user.
 *
 * Runs in a single transaction that also seeds:
 *   - 3 default doc_statuses (Not Started / In Progress / Complete)
 *   - A starter document scaffold:
 *       Story (folder)
 *         └─ Chapter 1 (chapter)
 *              └─ Scene 1 (scene)
 *       Notes (folder)
 *         ├─ Characters (folder)
 *         └─ Research (folder)
 *
 * @param {import('pg').Pool} db
 * @param {string} userId
 * @param {string} title - Validated upstream by Zod (max 200 chars).
 * @returns {Promise<object>}
 */
export async function createProject(db, userId, title) {
  const client = await db.connect();
  let projectId;
  try {
    await client.query('BEGIN');

    // ── Project row ───────────────────────────────────────────────────────────
    const { rows: [proj] } = await client.query(
      'INSERT INTO projects (user_id, title) VALUES ($1, $2) RETURNING id',
      [userId, title],
    );
    projectId = proj.id;

    // ── Default statuses ──────────────────────────────────────────────────────
    const statuses = [
      { name: 'Not Started', color: '#94a3b8', sort_order: 0 },
      { name: 'In Progress', color: '#f59e0b', sort_order: 1 },
      { name: 'Complete',    color: '#22c55e', sort_order: 2 },
    ];
    for (const s of statuses) {
      await client.query(
        'INSERT INTO doc_statuses (project_id, user_id, name, color, sort_order) VALUES ($1, $2, $3, $4, $5)',
        [projectId, userId, s.name, s.color, s.sort_order],
      );
    }

    // ── Scaffold documents ────────────────────────────────────────────────────
    const ins = (parentId, docTitle, type, sortOrder) =>
      client.query(
        `INSERT INTO documents (project_id, user_id, parent_id, title, type, sort_order, content, word_count)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, 0) RETURNING id`,
        [projectId, userId, parentId, docTitle, type, sortOrder],
      );

    const { rows: [story]    } = await ins(null,        'Story',      'folder',  0);
    const { rows: [chapter1] } = await ins(story.id,    'Chapter 1',  'chapter', 0);
                                   await ins(chapter1.id, 'Scene 1',    'scene',   0);
    const { rows: [notes]    } = await ins(null,        'Notes',      'folder',  1);
                                   await ins(notes.id,   'Characters', 'folder',  0);
                                   await ins(notes.id,   'Research',   'folder',  1);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return getProjectById(db, projectId);
}

/**
 * Update a project's title and refresh its updated_at timestamp.
 *
 * @param {import('pg').Pool} db
 * @param {number} id
 * @param {string} title
 * @returns {Promise<object>}
 */
export async function renameProject(db, id, title) {
  await db.query(
    'UPDATE projects SET title = $1, updated_at = NOW() WHERE id = $2',
    [title, id]
  );
  return getProjectById(db, id);
}

/**
 * Permanently delete a project and all its child records (via ON DELETE CASCADE).
 *
 * @param {import('pg').Pool} db
 * @param {number} id
 */
export async function deleteProject(db, id) {
  await db.query('DELETE FROM projects WHERE id = $1', [id]);
}

/**
 * Set or clear the word-count target and optional deadline for a project.
 *
 * @param {import('pg').Pool} db
 * @param {number}      id
 * @param {number|null} targetWords
 * @param {string|null} deadline - ISO date string 'YYYY-MM-DD' or null.
 * @returns {Promise<object>}
 */
export async function updateProjectTargets(db, id, targetWords, deadline) {
  const { rows } = await db.query(
    `UPDATE projects
     SET target_words = $1, deadline = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING id, title, archived, target_words, deadline, created_at, updated_at`,
    [targetWords ?? null, deadline ?? null, id]
  );
  return fmtProject(rows[0]);
}

