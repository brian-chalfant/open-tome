/**
 * @file routes/documents.js
 * @description Express router for document tree CRUD and content save/load.
 *
 * All routes require authentication (requireAuth applied at the router level).
 * SameSite=Strict session cookies provide CSRF protection.
 *
 * Routes:
 *   GET    /api/projects/:projectId/documents   — Fetch the full nested document tree
 *   POST   /api/projects/:projectId/documents   — Create a new document in the tree
 *   POST   /api/projects/:projectId/search      — Search all document text in a project
 *   PATCH  /api/documents/reorder               — Bulk update sort_order after drag-and-drop
 *   PATCH  /api/documents/:id                   — Update a document's title/parent/order
 *   GET    /api/documents/:id/content           — Load document content (initial page load)
 *   PATCH  /api/documents/:id/content           — REST fallback save (when WS unavailable)
 *   DELETE /api/documents/:id                   — Delete a document (cascades to children)
 *
 * IMPORTANT: PATCH /documents/reorder must be registered BEFORE PATCH /documents/:id
 * in the router to prevent Express from treating 'reorder' as the :id parameter.
 */

import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/migrate.js';
import {
  getDocumentTree,
  createDocument,
  updateDocument,
  updateDocumentContent,
  deleteDocument,
  findDocument,
  reorderDocuments,
  searchDocuments,
} from '../db/documentDb.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { loadOwnedProject, loadOwnedDocument, asyncHandler } from '../middleware/ownership.js';
import { recordDelta }  from '../db/analyticsDb.js';
import { findLabel, findStatus } from '../db/labelDb.js';

const router = Router();

// All document routes require a valid access token
router.use(requireAuth);

// Bounds for sort_order, which is stored in a Postgres INTEGER column.
const sortOrderSchema = z.number().int().min(-2147483648).max(2147483647);

/** Zod enum for allowed document types. */
const docTypeEnum = z.enum(['scene', 'folder', 'chapter', 'research', 'character']);

/**
 * Schema for document creation.
 * type defaults to 'scene', sort_order defaults to 0 if omitted.
 */
const createSchema = z.object({
  title:      z.string().min(1).max(200).optional().default('Untitled'),
  type:       docTypeEnum.optional().default('scene'),
  parent_id:  z.number().int().positive().nullable().optional(),
  sort_order: sortOrderSchema.optional().default(0),
});

/**
 * Schema for metadata updates. All fields optional — omitted fields are unchanged.
 */
const updateSchema = z.object({
  title:      z.string().min(1).max(200).optional(),
  parent_id:  z.number().int().positive().nullable().optional(),
  sort_order: sortOrderSchema.optional(),
  label_id:   z.number().int().positive().nullable().optional(),
  status_id:  z.number().int().positive().nullable().optional(),
  synopsis:   z.string().max(500).optional(),
});

/**
 * Schema for bulk reorder. Accepts 1–1000 {id, sort_order} pairs.
 * The cap of 1000 prevents resource exhaustion from oversized payloads.
 */
const reorderSchema = z.array(
  z.object({
    id:         z.number().int().positive(),
    sort_order: sortOrderSchema,
  })
).min(1).max(1000);

// ── Helpers ───────────────────────────────────────────────────────────────────
// Ownership checks (loadOwnedProject, loadOwnedDocument) live in middleware/ownership.js.

/**
 * Validate that a parent_id (if provided) belongs to the same project and user.
 *
 * @param {import('pg').Pool} db
 * @param {number|null|undefined} parentId
 * @param {number} projectId
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
async function validateParent(db, parentId, projectId, userId) {
  if (parentId == null) return true;
  const parent = await findDocument(db, parentId);
  return parent && parent.project_id === projectId && parent.user_id === userId;
}

/**
 * Return true if moving docId under newParentId would create a cycle
 * (i.e. newParentId is docId itself or one of its descendants).
 *
 * @param {import('pg').Pool} db
 * @param {number} docId
 * @param {number|null|undefined} newParentId
 * @returns {Promise<boolean>}
 */
async function wouldCreateCycle(db, docId, newParentId) {
  const seen = new Set();
  let cur = newParentId;
  while (cur != null) {
    if (cur === docId) return true;
    if (seen.has(cur)) return true; // pre-existing cycle — refuse to extend it
    seen.add(cur);
    const node = await findDocument(db, cur);
    cur = node?.parent_id ?? null;
  }
  return false;
}

/**
 * Validate that a label/status id (if provided) belongs to the same project and user.
 *
 * @param {Function} finder - findLabel or findStatus
 * @param {import('pg').Pool} db
 * @param {number|null|undefined} id
 * @param {number} projectId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function validateProjectItem(finder, db, id, projectId, userId) {
  if (id == null) return true;
  const item = await finder(db, id);
  return !!item && item.project_id === projectId && item.user_id === userId;
}

router.get('/projects/:projectId/documents', asyncHandler(async (req, res) => {
  const db = getDb();
  const projectId = Number(req.params.projectId);
  await loadOwnedProject(db, projectId, req.user.id, 'Project not found');
  res.json(await getDocumentTree(db, projectId, req.user.id));
}));

router.post('/projects/:projectId/documents', asyncHandler(async (req, res) => {
  const db = getDb();
  const projectId = Number(req.params.projectId);
  await loadOwnedProject(db, projectId, req.user.id, 'Project not found');

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  const { title, type, parent_id, sort_order } = parsed.data;

  if (!await validateParent(db, parent_id, projectId, req.user.id)) {
    return res.status(400).json({ error: 'Invalid parent_id' });
  }

  const doc = await createDocument(db, {
    projectId,
    userId: req.user.id,
    parentId: parent_id ?? null,
    title,
    type,
    sortOrder: sort_order,
  });

  res.status(201).json(doc);
}));

// Search term validation — min 1 char so empty searches are rejected early.
const searchSchema = z.object({
  term:          z.string().min(1).max(200),
  caseSensitive: z.boolean().optional(),
  wholeWord:     z.boolean().optional(),
});

// security: IDOR guard — assertProjectOwned verifies the project belongs to req.user.id
// before any documents are read.
router.post('/projects/:projectId/search', asyncHandler(async (req, res) => {
  const db        = getDb();
  const projectId = Number(req.params.projectId);
  await loadOwnedProject(db, projectId, req.user.id, 'Project not found');

  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  const { term, ...opts } = parsed.data;
  const results = await searchDocuments(db, projectId, req.user.id, term, opts);
  res.json({ results });
}));

router.patch('/documents/reorder', asyncHandler(async (req, res) => {
  const db = getDb();
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  const items = parsed.data;

  for (const { id } of items) {
    const doc = await findDocument(db, id);
    if (!doc || doc.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  await reorderDocuments(db, items);
  res.status(204).end();
}));

router.patch('/documents/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const doc = await loadOwnedDocument(db, Number(req.params.id), req.user.id);

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  const fields = parsed.data;

  if ('parent_id' in fields && !await validateParent(db, fields.parent_id, doc.project_id, req.user.id)) {
    return res.status(400).json({ error: 'Invalid parent_id' });
  }
  if ('parent_id' in fields && await wouldCreateCycle(db, doc.id, fields.parent_id)) {
    return res.status(400).json({ error: 'Invalid parent_id' });
  }
  if ('label_id' in fields && !await validateProjectItem(findLabel, db, fields.label_id, doc.project_id, req.user.id)) {
    return res.status(400).json({ error: 'Invalid label_id' });
  }
  if ('status_id' in fields && !await validateProjectItem(findStatus, db, fields.status_id, doc.project_id, req.user.id)) {
    return res.status(400).json({ error: 'Invalid status_id' });
  }

  const updated = await updateDocument(db, doc.id, fields);
  res.json(updated);
}));

router.get('/documents/:id/content', asyncHandler(async (req, res) => {
  const db = getDb();
  const doc = await loadOwnedDocument(db, Number(req.params.id), req.user.id);
  res.json({ content: doc.content ?? null, word_count: doc.word_count });
}));

const contentSchema = z.object({
  content:    z.string().max(1_000_000).nullable().optional(),
  word_count: z.number().int().min(0).max(10_000_000).optional().default(0),
});

router.patch('/documents/:id/content', asyncHandler(async (req, res) => {
  const db = getDb();
  const doc = await loadOwnedDocument(db, Number(req.params.id), req.user.id);

  const parsed = contentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  const { content, word_count } = parsed.data;
  const updated = await updateDocumentContent(db, doc.id, content ?? null, word_count);
  recordDelta(db, req.user.id, doc.word_count, word_count).catch(() => {});
  res.json({ content: updated.content ?? null, word_count: updated.word_count });
}));

router.delete('/documents/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const doc = await loadOwnedDocument(db, Number(req.params.id), req.user.id);

  await deleteDocument(db, doc.id);
  res.status(204).end();
}));

export default router;
