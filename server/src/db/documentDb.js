// ============================================================
// documentDb.js
// ============================================================
// Purpose:   All database read and write operations for the `documents`
//            table — the binder tree, document content, and project-wide search.
// Used by:   routes/documents.js (CRUD routes), routes/compile.js (export),
//            routes/projects.js (project import/export)
// Exports:   getDocumentTree, createDocument, updateDocument, deleteDocument,
//            reorderDocuments, findDocument, getDocumentsWithContent,
//            updateDocumentContent, searchDocuments
// Notes:     All queries use $N parameterised placeholders — no string
//            concatenation. findDocument intentionally skips the user_id filter;
//            callers in routes/documents.js must verify ownership before acting.
// ============================================================

import { safeParseContent } from '../lib/pmContent.js';

// --- TEXT HELPERS --------------------------------------------

// Recursively extract all plain text from a ProseMirror JSON node tree.
// Used both for word counting and for search (to get a flat string to match against).
function extractText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  if (!Array.isArray(node.content)) return '';
  return node.content.map(extractText).join(' ');
}

// Parse a stored JSON content string, extract plain text, and count whitespace-delimited tokens.
// Returns 0 for null, empty, or malformed content.
function countWordsInContent(jsonString) {
  const node = safeParseContent(jsonString);
  if (!node) return 0;
  const text = extractText(node);
  return (text.match(/\S+/g) || []).length;
}

// --- SEARCH --------------------------------------------------

// Escape a string for safe, literal use inside a RegExp constructor.
// Without this, punctuation in the search term would be interpreted as regex syntax.
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Find all occurrences of term in plain text and return a match object for each.
// Each match includes a ±60-char context snippet so the UI can show surrounding prose.
// The ellipsis prefix/suffix signals to the reader that the snippet is truncated.
function findMatches(text, term, { caseSensitive = false, wholeWord = false } = {}) {
  const escaped = escapeRegex(term);
  // \b word boundaries only make sense for whole-word matching; skip them otherwise
  // to avoid mismatches on terms that start or end with punctuation.
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  const flags   = caseSensitive ? 'g' : 'gi';
  const re      = new RegExp(pattern, flags);
  const matches = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const offset   = m.index;
    const length   = m[0].length;
    // Clip the context window to document boundaries so slice never goes negative or past end.
    const ctxStart = Math.max(0, offset - 60);
    const ctxEnd   = Math.min(text.length, offset + length + 60);
    const context  = (ctxStart > 0 ? '…' : '') +
                     text.slice(ctxStart, ctxEnd) +
                     (ctxEnd < text.length ? '…' : '');
    matches.push({ offset, length, context });
  }
  return matches;
}

// Search every document in a project for the given term.
// Reuses getDocumentsWithContent (one DB round-trip) and extractText (shared with word counter).
// Only documents with ≥1 match are included — empty results are filtered out here, not in the route.
export async function searchDocuments(db, projectId, userId, term, opts = {}) {
  const docs    = await getDocumentsWithContent(db, projectId, userId);
  const results = [];
  for (const doc of docs) {
    if (!doc.content) continue;
    try {
      const text    = extractText(JSON.parse(doc.content));
      const matches = findMatches(text, term, opts);
      if (matches.length > 0) results.push({ id: doc.id, title: doc.title, type: doc.type, matches });
    } catch { /* skip documents with unparseable content */ }
  }
  return results;
}

// --- TEMPLATES -----------------------------------------------

// Pre-built ProseMirror JSON scaffolds for new character and research documents.
// When a user creates one of these types, they get a structured starting point
// instead of a blank page — headings, bold labels, empty paragraphs ready to fill.
// Scene, folder, and chapter types get no template (null → blank editor).
const TEMPLATES = {
  character: JSON.stringify({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Character Overview' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Basic Info' }] },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Age:' }, { type: 'text', text: ' ' }] },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Location:' }, { type: 'text', text: ' ' }] },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Role in Story:' }, { type: 'text', text: ' ' }] },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Occupation:' }, { type: 'text', text: ' ' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Physical Description' }] },
      { type: 'paragraph', content: [] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Personality' }] },
      { type: 'paragraph', content: [] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Background' }] },
      { type: 'paragraph', content: [] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Goals' }] },
      { type: 'paragraph', content: [] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Conflicts' }] },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Internal:' }, { type: 'text', text: ' ' }] },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'External:' }, { type: 'text', text: ' ' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Notes' }] },
      { type: 'paragraph', content: [] },
    ],
  }),
  research: JSON.stringify({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Research Overview' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Summary' }] },
      { type: 'paragraph', content: [] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Key Facts' }] },
      { type: 'paragraph', content: [] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Sources' }] },
      { type: 'paragraph', content: [] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'How This Applies to My Story' }] },
      { type: 'paragraph', content: [] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Notes' }] },
      { type: 'paragraph', content: [] },
    ],
  }),
};

// Pre-compute the word count for each template at startup so that newly created
// character and research docs show the correct count in the binder immediately,
// without waiting for the user to open and save them.
const TEMPLATE_WORD_COUNTS = Object.fromEntries(
  Object.entries(TEMPLATES).map(([k, v]) => [k, countWordsInContent(v)])
);

// --- DOCUMENT QUERIES ----------------------------------------

/**
 * Fetch a single document row by primary key (internal helper).
 *
 * @param {import('pg').Pool} db
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
async function getDocumentById(db, id) {
  const { rows } = await db.query('SELECT * FROM documents WHERE id = $1', [id]);
  return rows[0];
}

/**
 * Return all documents for a project as a flat array (tree built on the frontend).
 *
 * @param {import('pg').Pool} db
 * @param {number} projectId
 * @param {number} userId
 * @returns {Promise<object[]>}
 */
export async function getDocumentTree(db, projectId, userId) {
  const { rows } = await db.query(
    `SELECT id, parent_id, title, type, sort_order, word_count, synopsis, label_id, status_id, created_at, updated_at
     FROM documents
     WHERE project_id = $1 AND user_id = $2
     ORDER BY parent_id NULLS FIRST, sort_order`,
    [projectId, userId]
  );
  return rows;
}

// --- DOCUMENT MUTATIONS --------------------------------------

/**
 * Create a new document inside a project.
 *
 * @param {import('pg').Pool} db
 * @param {{ projectId: number, userId: number, parentId: number|null,
 *           title: string, type: string, sortOrder: number }} params
 * @returns {Promise<object>}
 */
export async function createDocument(db, { projectId, userId, parentId, title, type, sortOrder }) {
  const content = TEMPLATES[type] ?? null;
  const wordCount = TEMPLATE_WORD_COUNTS[type] ?? 0;
  const { rows } = await db.query(
    `INSERT INTO documents (project_id, user_id, parent_id, title, type, sort_order, content, word_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [projectId, userId, parentId ?? null, title, type, sortOrder ?? 0, content, wordCount]
  );
  return getDocumentById(db, rows[0].id);
}

/**
 * Update document metadata fields (title, parent_id, sort_order).
 * Only fields present in the `fields` object are updated.
 *
 * @param {import('pg').Pool} db
 * @param {number} id
 * @param {{ title?: string, parent_id?: number|null, sort_order?: number }} fields
 * @returns {Promise<object>}
 */
export async function updateDocument(db, id, fields) {
  const allowed = ['title', 'parent_id', 'sort_order', 'label_id', 'status_id', 'synopsis'];
  const setClauses = [];
  const values = [];
  let idx = 1;

  for (const key of allowed) {
    if (key in fields) {
      setClauses.push(`${key} = $${idx++}`);
      values.push(fields[key]);
    }
  }

  if (setClauses.length === 0) return getDocumentById(db, id);

  setClauses.push(`updated_at = NOW()`);
  values.push(id); // WHERE id = $N

  await db.query(
    `UPDATE documents SET ${setClauses.join(', ')} WHERE id = $${idx}`,
    values
  );
  return getDocumentById(db, id);
}

/**
 * Permanently delete a document (and all its descendants via ON DELETE CASCADE).
 *
 * @param {import('pg').Pool} db
 * @param {number} id
 */
export async function deleteDocument(db, id) {
  await db.query('DELETE FROM documents WHERE id = $1', [id]);
}

/**
 * Bulk-update the sort_order of multiple documents in a single round-trip.
 *
 * @param {import('pg').Pool} db
 * @param {{ id: number, sort_order: number }[]} items
 */
export async function reorderDocuments(db, items) {
  if (!items.length) return;
  // Single statement: build a VALUES clause of (id, sort_order) tuples and
  // join it onto documents in one UPDATE. PostgreSQL treats single statements
  // as atomic — no BEGIN/COMMIT needed. Replaces an N-iteration loop that
  // round-tripped to the DB once per row (drag-reorder of 500 items was 500
  // round-trips). Portable across real Postgres and pg-mem (which doesn't
  // support multi-arg UNNEST).
  const params = [];
  // Each item contributes two placeholders: $1, $2 for item 0, $3, $4 for
  // item 1, and so on. ::int casts make the tuple types explicit so the
  // planner doesn't have to infer them from the VALUES literal.
  const tuples = items.map(({ id, sort_order }, i) => {
    params.push(id, sort_order);
    return `($${i * 2 + 1}::int, $${i * 2 + 2}::int)`;
  }).join(',');
  // No table alias on the UPDATE target — pg-mem rejects "UPDATE documents AS d".
  await db.query(
    `UPDATE documents
     SET sort_order = v.sort_order
     FROM (VALUES ${tuples}) AS v(id, sort_order)
     WHERE documents.id = v.id`,
    params
  );
}

/**
 * Fetch a single document by ID (no user filter — callers must verify ownership).
 *
 * @param {import('pg').Pool} db
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
export async function findDocument(db, id) {
  return getDocumentById(db, id);
}

/**
 * Fetch multiple documents by id in a single query.
 * Returns a Map keyed by id so callers can preserve their own ordering
 * (e.g. compile.js needs documents in the user-selected export order, which
 * a SQL ORDER BY can't reproduce).
 * Does NOT filter by user/project — callers must enforce ownership.
 *
 * @param {import('pg').Pool} db
 * @param {number[]} ids
 * @returns {Promise<Map<number, object>>}
 */
export async function getDocumentsByIdsMap(db, ids) {
  if (!ids.length) return new Map();
  // IN ($1, $2, ...) with one placeholder per id. pg-mem's binding of
  // = ANY($1::int[]) is unreliable, so we expand the list explicitly.
  // Safe: the ids array is the only thing passed as params; no values are
  // ever stringified into the SQL itself.
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await db.query(
    `SELECT id, project_id, user_id, parent_id, title, type, content, word_count, sort_order
     FROM documents WHERE id IN (${placeholders})`,
    ids
  );
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Fetch all documents for a project as a flat list, including content.
 * Used by the export endpoint — avoids building the tree.
 *
 * @param {import('pg').Pool} db
 * @param {number} projectId
 * @param {number} userId
 * @returns {Promise<object[]>}
 */
export async function getDocumentsWithContent(db, projectId, userId) {
  const { rows } = await db.query(
    `SELECT id, parent_id, title, type, sort_order, content, word_count
     FROM documents
     WHERE project_id = $1 AND user_id = $2
     ORDER BY parent_id NULLS FIRST, sort_order`,
    [projectId, userId]
  );
  return rows;
}

/**
 * Fetch all documents in a project with full content and synopsis.
 * Used by the ZIP archive route — includes synopsis which getDocumentsWithContent omits.
 *
 * @param {import('pg').Pool} db
 * @param {number} projectId
 * @param {number} userId
 * @returns {Promise<object[]>}
 */
export async function getDocumentsForArchive(db, projectId, userId) {
  const { rows } = await db.query(
    `SELECT id, parent_id, title, type, sort_order, content, word_count, synopsis
     FROM documents
     WHERE project_id = $1 AND user_id = $2
     ORDER BY parent_id NULLS FIRST, sort_order`,
    [projectId, userId]
  );
  return rows;
}

/**
 * Update a document's rich-text content and word count.
 *
 * @param {import('pg').Pool} db
 * @param {number} id
 * @param {string|null} content
 * @param {number} wordCount
 * @returns {Promise<object>}
 */
export async function updateDocumentContent(db, id, content, wordCount) {
  await db.query(
    `UPDATE documents SET content = $1, word_count = $2, updated_at = NOW() WHERE id = $3`,
    [content ?? null, wordCount ?? 0, id]
  );
  return getDocumentById(db, id);
}

