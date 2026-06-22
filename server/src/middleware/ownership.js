// ============================================================
// ownership.js
// ============================================================
// Purpose:   Canonical helpers for resource-ownership checks.
//            Every protected route must verify the requested resource
//            (project, document, label, status) belongs to the authenticated
//            user. These helpers fetch the resource and throw an OwnershipError
//            on a 404 (missing) or 403 (foreign owner). Pair them with
//            asyncHandler so routes don't repeat try/catch boilerplate.
// Used by:   routes/projects.js, routes/documents.js, routes/labels.js,
//            routes/compile.js
// Exports:   OwnershipError, loadOwnedProject, loadOwnedDocument,
//            makeOwnershipLoader, asyncHandler
// Notes:     The whole point of this module is consistency. A single canonical
//            helper makes it impossible to forget the user_id check when
//            adding a new route — which is how IDOR vulnerabilities sneak in.
// ============================================================

// --- DEPENDENCIES --------------------------------------------

import { getProjectById } from '../db/projectDb.js';
import { findDocument }   from '../db/documentDb.js';

// --- ERROR TYPE ----------------------------------------------

// Custom error subclass so asyncHandler can distinguish ownership failures
// (which become 404/403 JSON responses) from unexpected runtime errors
// (which fall through to the global 500 handler in index.js).
export class OwnershipError extends Error {
  constructor(status, message) {
    super(message);
    // Setting .name makes stack traces and pino log lines self-describing.
    this.name   = 'OwnershipError';
    this.status = status;
  }
}

// --- OWNERSHIP LOADERS ---------------------------------------

// Load a project by id and assert the requesting user owns it.
// Throws OwnershipError(404) if missing, OwnershipError(403) if foreign.
// notFoundMessage lets callers preserve specific wording — e.g. routes that
// look up a project by id under /documents/* still say "Project not found"
// rather than the generic "Not found", matching the pre-refactor API.
export async function loadOwnedProject(db, projectId, userId, notFoundMessage = 'Not found') {
  const project = await getProjectById(db, projectId);
  if (!project) throw new OwnershipError(404, notFoundMessage);
  if (project.user_id !== userId) throw new OwnershipError(403, 'Forbidden');
  return project;
}

// Load a document by id and assert the requesting user owns it.
// Same throw semantics as loadOwnedProject.
export async function loadOwnedDocument(db, docId, userId, notFoundMessage = 'Not found') {
  const doc = await findDocument(db, docId);
  if (!doc) throw new OwnershipError(404, notFoundMessage);
  if (doc.user_id !== userId) throw new OwnershipError(403, 'Forbidden');
  return doc;
}

// Build an ownership loader for any table whose row exposes a user_id column.
// Used by routes/labels.js to derive loadOwnedLabel and loadOwnedStatus from
// the existing findLabel / findStatus DB helpers without duplicating the
// throw-on-missing-or-foreign pattern.
export function makeOwnershipLoader(finder) {
  return async function loadOwned(db, id, userId) {
    const item = await finder(db, id);
    if (!item) throw new OwnershipError(404, 'Not found');
    if (item.user_id !== userId) throw new OwnershipError(403, 'Forbidden');
    return item;
  };
}

// --- ROUTE WRAPPER -------------------------------------------

// Wraps an async route handler so:
//   - OwnershipError → JSON response with the encoded status (404 or 403)
//   - any other thrown error → forwarded to Express's global error handler
// Without this wrapper, an async route that throws would become an
// unhandled promise rejection and crash the process.
export function asyncHandler(fn) {
  return (req, res, next) => {
    // Promise.resolve handles both sync throws (rejected promise) and
    // async errors uniformly — no separate try/catch needed for sync code.
    Promise.resolve(fn(req, res, next)).catch((err) => {
      if (err instanceof OwnershipError) {
        // headersSent guard: an error might fire after the response has
        // already started streaming (e.g. mid-export). Don't double-write.
        if (!res.headersSent) res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    });
  };
}
