/**
 * @file db/labelDb.js
 * @description Database operations for the `labels` and `doc_statuses` tables.
 *
 * Both tables have identical structure, so a shared set of parameterized helpers
 * handles each. Callers use the exported convenience functions named for their table.
 */

// ── Generic helpers (table name validated internally — never from user input) ──

async function listItems(db, table, projectId) {
  const { rows } = await db.query(
    `SELECT id, project_id, user_id, name, color, sort_order, created_at
     FROM ${table} WHERE project_id = $1 ORDER BY sort_order, created_at`,
    [projectId]
  );
  return rows;
}

async function createItem(db, table, { projectId, userId, name, color }) {
  const { rows } = await db.query(
    `INSERT INTO ${table} (project_id, user_id, name, color)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [projectId, userId, name, color]
  );
  return rows[0];
}

async function updateItem(db, table, id, { name, color }) {
  const setClauses = [];
  const values = [];
  let idx = 1;
  if (name  !== undefined) { setClauses.push(`name  = $${idx++}`); values.push(name); }
  if (color !== undefined) { setClauses.push(`color = $${idx++}`); values.push(color); }
  if (setClauses.length === 0) {
    const { rows } = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    return rows[0];
  }
  values.push(id);
  const { rows } = await db.query(
    `UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0];
}

async function deleteItem(db, table, id) {
  await db.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
}

async function findItem(db, table, id) {
  const { rows } = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  return rows[0];
}

// ── Labels ────────────────────────────────────────────────────────────────────

export const getLabels    = (db, projectId)           => listItems(db, 'labels', projectId);
export const createLabel  = (db, params)              => createItem(db, 'labels', params);
export const updateLabel  = (db, id, fields)          => updateItem(db, 'labels', id, fields);
export const deleteLabel  = (db, id)                  => deleteItem(db, 'labels', id);
export const findLabel    = (db, id)                  => findItem(db, 'labels', id);

// ── Doc Statuses ──────────────────────────────────────────────────────────────

export const getStatuses   = (db, projectId)          => listItems(db, 'doc_statuses', projectId);
export const createStatus  = (db, params)             => createItem(db, 'doc_statuses', params);
export const updateStatus  = (db, id, fields)         => updateItem(db, 'doc_statuses', id, fields);
export const deleteStatus  = (db, id)                 => deleteItem(db, 'doc_statuses', id);
export const findStatus    = (db, id)                 => findItem(db, 'doc_statuses', id);
