/**
 * @file routes/labels.js
 * @description Express router for per-project label and doc_status CRUD.
 *
 * Routes:
 *   GET    /api/projects/:projectId/labels    — list labels
 *   POST   /api/projects/:projectId/labels    — create label
 *   PATCH  /api/labels/:id                   — rename / recolor label
 *   DELETE /api/labels/:id                   — delete label (FK clears doc assignments)
 *
 *   GET    /api/projects/:projectId/statuses  — list doc_statuses
 *   POST   /api/projects/:projectId/statuses  — create doc_status
 *   PATCH  /api/statuses/:id                 — rename / recolor doc_status
 *   DELETE /api/statuses/:id                 — delete doc_status
 */

import { Router } from 'express';
import { z } from 'zod';

import { getDb } from '../db/migrate.js';
import {
  getLabels, createLabel, updateLabel, deleteLabel, findLabel,
  getStatuses, createStatus, updateStatus, deleteStatus, findStatus,
} from '../db/labelDb.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { loadOwnedProject, makeOwnershipLoader, asyncHandler } from '../middleware/ownership.js';

const router = Router();
router.use(requireAuth);

// ── Zod schemas ───────────────────────────────────────────────────────────────

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const createSchema = z.object({
  name:  z.string().min(1).max(100),
  color: z.string().regex(COLOR_RE, 'Must be a 6-digit hex color e.g. #3b82f6'),
});

const updateSchema = z.object({
  name:  z.string().min(1).max(100).optional(),
  color: z.string().regex(COLOR_RE, 'Must be a 6-digit hex color e.g. #3b82f6').optional(),
});

// ── Ownership helpers ─────────────────────────────────────────────────────────
// Project/label/status ownership now delegates to middleware/ownership.js.

const loadOwnedLabel  = makeOwnershipLoader(findLabel);
const loadOwnedStatus = makeOwnershipLoader(findStatus);

// ── Label routes ──────────────────────────────────────────────────────────────

router.get('/projects/:projectId/labels', asyncHandler(async (req, res) => {
  const db = getDb();
  const projectId = Number(req.params.projectId);
  await loadOwnedProject(db, projectId, req.user.id);
  res.json(await getLabels(db, projectId));
}));

router.post('/projects/:projectId/labels', asyncHandler(async (req, res) => {
  const db = getDb();
  const projectId = Number(req.params.projectId);
  await loadOwnedProject(db, projectId, req.user.id);
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  const label = await createLabel(db, { projectId, userId: req.user.id, ...parsed.data });
  res.status(201).json(label);
}));

router.patch('/labels/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const item = await loadOwnedLabel(db, Number(req.params.id), req.user.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  res.json(await updateLabel(db, item.id, parsed.data));
}));

router.delete('/labels/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  await loadOwnedLabel(db, Number(req.params.id), req.user.id);
  await deleteLabel(db, Number(req.params.id));
  res.status(204).end();
}));

// ── Status routes ─────────────────────────────────────────────────────────────

router.get('/projects/:projectId/statuses', asyncHandler(async (req, res) => {
  const db = getDb();
  const projectId = Number(req.params.projectId);
  await loadOwnedProject(db, projectId, req.user.id);
  res.json(await getStatuses(db, projectId));
}));

router.post('/projects/:projectId/statuses', asyncHandler(async (req, res) => {
  const db = getDb();
  const projectId = Number(req.params.projectId);
  await loadOwnedProject(db, projectId, req.user.id);
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  const status = await createStatus(db, { projectId, userId: req.user.id, ...parsed.data });
  res.status(201).json(status);
}));

router.patch('/statuses/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const item = await loadOwnedStatus(db, Number(req.params.id), req.user.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  res.json(await updateStatus(db, item.id, parsed.data));
}));

router.delete('/statuses/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  await loadOwnedStatus(db, Number(req.params.id), req.user.id);
  await deleteStatus(db, Number(req.params.id));
  res.status(204).end();
}));

export default router;
