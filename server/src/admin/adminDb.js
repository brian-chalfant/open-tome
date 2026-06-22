export async function getDashboardStats(db) {
  const { rows } = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users)     AS total_users,
      (SELECT COUNT(*)::int FROM projects)  AS total_projects,
      (SELECT COUNT(*)::int FROM documents) AS total_documents,
      (SELECT COALESCE(SUM(words_added), 0)::bigint FROM daily_stats) AS total_words
  `);
  return rows[0];
}

export async function getNewUsersCount(db) {
  const { rows } = await db.query(`
    SELECT COUNT(*)::int AS count
    FROM users
    WHERE created_at >= NOW() - INTERVAL '30 days'
  `);
  return rows[0].count;
}

export async function getTopWriters(db, limit = 5) {
  const { rows } = await db.query(`
    SELECT u.id, u.display_name, u.email,
           COALESCE(SUM(ds.words_added), 0)::int AS words_this_year
    FROM users u
    LEFT JOIN daily_stats ds ON ds.user_id = u.id
      AND ds.stat_date >= date_trunc('year', NOW())
    GROUP BY u.id, u.display_name, u.email
    ORDER BY words_this_year DESC
    LIMIT $1
  `, [limit]);
  return rows;
}

export async function getDbSize(db) {
  const { rows } = await db.query(
    `SELECT pg_size_pretty(pg_database_size(current_database())) AS size`,
  );
  return rows[0].size;
}

export async function listAllUsers(db) {
  const { rows } = await db.query(`
    SELECT u.id, u.display_name, u.email, u.is_admin,
           u.created_at, u.last_login_at,
           COUNT(p.id)::int AS project_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `);
  return rows;
}

export async function getUserStats(db, userId) {
  const { rows } = await db.query(`
    SELECT COALESCE(SUM(words_added), 0)::int AS total_words
    FROM daily_stats WHERE user_id = $1
  `, [userId]);
  return rows[0]?.total_words ?? 0;
}

export async function getUserProjects(db, userId) {
  const { rows } = await db.query(`
    SELECT p.id, p.title, p.archived, p.created_at, p.updated_at,
           COUNT(d.id)::int AS doc_count,
           COALESCE(SUM(d.word_count), 0)::int AS word_count
    FROM projects p
    LEFT JOIN documents d ON d.project_id = p.id
    WHERE p.user_id = $1
    GROUP BY p.id
    ORDER BY p.archived, p.updated_at DESC
  `, [userId]);
  return rows;
}

export async function deleteUser(db, userId) {
  await db.query('DELETE FROM users WHERE id = $1', [userId]);
}

export async function listAllProjectsAdmin(db) {
  const { rows } = await db.query(`
    SELECT p.id, p.title, p.archived, p.created_at, p.updated_at,
           u.email AS user_email, u.display_name AS user_name, u.id AS user_id,
           COUNT(d.id)::int AS doc_count,
           COALESCE(SUM(d.word_count), 0)::int AS word_count
    FROM projects p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN documents d ON d.project_id = p.id
    GROUP BY p.id, u.id
    ORDER BY p.created_at DESC
  `);
  return rows;
}

export async function getProjectAdmin(db, projectId) {
  const { rows } = await db.query(`
    SELECT p.id, p.title, p.archived, p.created_at, p.updated_at,
           p.target_words, p.deadline,
           u.email AS user_email, u.display_name AS user_name, u.id AS user_id
    FROM projects p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = $1
  `, [projectId]);
  return rows[0] ?? null;
}

export async function getProjectDocumentsAdmin(db, projectId) {
  const { rows } = await db.query(`
    SELECT id, title, type, parent_id, word_count, sort_order, created_at, updated_at
    FROM documents
    WHERE project_id = $1
    ORDER BY parent_id NULLS FIRST, sort_order
  `, [projectId]);
  return rows;
}

export async function deleteProjectAdmin(db, projectId) {
  await db.query('DELETE FROM projects WHERE id = $1', [projectId]);
}
