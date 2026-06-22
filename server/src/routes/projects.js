/**
 * @file routes/projects.js
 * @description Express router for project CRUD operations.
 *
 * All routes require authentication (requireAuth applied at the router level).
 * State-mutating routes (POST, PATCH, DELETE) are protected by
 * SameSite=Strict session cookies (no separate CSRF token required).
 *
 * Ownership is verified on every mutation by fetching the resource first and
 * comparing its user_id to req.user.id — never relying solely on WHERE clauses.
 *
 * Routes:
 *   GET    /api/projects          — List all projects for the authenticated user
 *   POST   /api/projects          — Create a new project
 *   PATCH  /api/projects/:id      — Rename a project
 *   DELETE /api/projects/:id      — Delete a project (cascades to all documents)
 */

import { Router } from 'express';
import { z } from 'zod';
import { ZipArchive } from 'archiver';
import { getDb } from '../db/migrate.js';
import { listProjects, listAllProjects, createProject, renameProject, deleteProject, archiveProject, updateProjectTargets } from '../db/projectDb.js';
import { getDocumentsWithContent, getDocumentsForArchive } from '../db/documentDb.js';
import { safeParseContent } from '../lib/pmContent.js';
import { pmToRtf } from '../lib/pmToRtf.js';
import { buildSingleDocx } from '../lib/pmToDocx.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { loadOwnedProject, asyncHandler } from '../middleware/ownership.js';

const router = Router();

// All project routes require a valid access token
router.use(requireAuth);

const titleSchema = z.string().min(1).max(200);

/** Zod schema for the import payload — validates structure and field lengths. */
const importSchema = z.object({
  version: z.literal(1),
  app:     z.literal('open-tome'),
  project: z.object({
    title: z.string().min(1).max(200),
    documents: z.array(z.object({
      clientId:       z.number().int(),
      parentClientId: z.number().int().nullable(),
      title:          z.string().max(200).default('Untitled'),
      type:           z.enum(['scene', 'folder', 'chapter', 'character', 'research']),
      sort_order:     z.number().int().default(0),
      content:        z.string().max(1_000_000).nullable().default(null),
      word_count:     z.number().int().min(0).default(0),
    })).max(500),
  }),
});

/** Sort documents so parents are always inserted before their children, preserving sort_order within each level. */
function topoSortDocs(docs) {
  const result = [];
  const done   = new Set([null]);
  const queue  = [...docs].sort((a, b) => a.sort_order - b.sort_order);
  let prev = -1;
  while (queue.length && queue.length !== prev) {
    prev = queue.length;
    let i = 0;
    while (i < queue.length) {
      if (done.has(queue[i].parentClientId)) {
        done.add(queue[i].clientId);
        result.push(queue[i]);
        queue.splice(i, 1);
        // i stays the same — next element shifted into position i
      } else {
        i++;
      }
    }
  }
  return result;
}

/**
 * GET /api/projects
 * Returns all non-archived projects owned by the authenticated user.
 */
router.get('/', async (req, res) => {
  const projects = await listProjects(getDb(), req.user.id);
  res.json(projects);
});

/**
 * GET /api/projects/all
 * Returns ALL projects (including archived) for the project manager.
 * Must be registered before /:id to prevent "all" being matched as an id.
 */
router.get('/all', async (req, res) => {
  const projects = await listAllProjects(getDb(), req.user.id);
  res.json(projects);
});

router.post('/', async (req, res) => {
  const parsed = titleSchema.safeParse(req.body.title);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid title' });
  }
  const project = await createProject(getDb(), req.user.id, parsed.data);
  res.status(201).json(project);
});

router.patch('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const project = await loadOwnedProject(db, Number(req.params.id), req.user.id);

  const parsed = titleSchema.safeParse(req.body.title);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid title' });
  }
  const updated = await renameProject(db, project.id, parsed.data);
  res.json(updated);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const project = await loadOwnedProject(db, Number(req.params.id), req.user.id);

  await deleteProject(db, project.id);
  res.status(204).end();
}));

/**
 * PATCH /api/projects/:id/archive
 * Toggle a project's archived state.
 */
router.patch('/:id/archive', asyncHandler(async (req, res) => {
  const db = getDb();
  const project = await loadOwnedProject(db, Number(req.params.id), req.user.id);

  const parsed = z.boolean().safeParse(req.body.archived);
  if (!parsed.success) return res.status(400).json({ error: 'archived must be boolean' });

  const updated = await archiveProject(db, project.id, parsed.data);
  res.json(updated);
}));

/**
 * PATCH /api/projects/:id/targets
 * Set or clear the word-count target and deadline for a project.
 */
const targetsSchema = z.object({
  target_words: z.number().int().positive().nullable(),
  deadline:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

router.patch('/:id/targets', asyncHandler(async (req, res) => {
  const db = getDb();
  const project = await loadOwnedProject(db, Number(req.params.id), req.user.id);
  const parsed = targetsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const updated = await updateProjectTargets(db, project.id, parsed.data.target_words, parsed.data.deadline);
  res.json(updated);
}));

/**
 * GET /api/projects/:id/export
 * Serialize the full project (documents with content) as a downloadable JSON file.
 */
router.get('/:id/export', asyncHandler(async (req, res) => {
  const db = getDb();
  const project = await loadOwnedProject(db, Number(req.params.id), req.user.id);

  const documents = await getDocumentsWithContent(db, project.id, req.user.id);

  const payload = {
    version: 1,
    app: 'open-tome',
    exportedAt: new Date().toISOString(),
    project: {
      title: project.title,
      documents: documents.map((d) => ({
        clientId:       d.id,
        parentClientId: d.parent_id ?? null,
        title:          d.title,
        type:           d.type,
        sort_order:     d.sort_order,
        content:        d.content ?? null,
        word_count:     d.word_count ?? 0,
      })),
    },
  };

  const safeName = project.title
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'project';
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}-${date}.json"`);
  res.json(payload);
}));

/**
 * POST /api/projects/import
 * Reconstitute a project from an exported JSON payload.
 * Runs inside a single DB transaction — either all records are created or none.
 */
router.post('/import', async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid import file', details: parsed.error.flatten() });
  }

  const { project: data } = parsed.data;
  const db = getDb();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Create the project
    const { rows: [proj] } = await client.query(
      'INSERT INTO projects (user_id, title) VALUES ($1, $2) RETURNING id',
      [req.user.id, data.title]
    );
    const projectId = proj.id;

    // Insert documents in topological order, tracking clientId → real DB id
    const idMap = new Map(); // clientId → inserted DB id
    for (const doc of topoSortDocs(data.documents)) {
      const parentId = doc.parentClientId != null ? (idMap.get(doc.parentClientId) ?? null) : null;
      const { rows: [d] } = await client.query(
        `INSERT INTO documents (project_id, user_id, parent_id, title, type, sort_order, content, word_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [projectId, req.user.id, parentId, doc.title, doc.type, doc.sort_order, doc.content, doc.word_count]
      );
      idMap.set(doc.clientId, d.id);
    }

    await client.query('COMMIT');

    const { rows: [newProject] } = await client.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    res.status(201).json(newProject);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

/**
 * GET /api/projects/:id/archive?format=txt|rtf|docx
 * Stream a ZIP archive of the project with documents laid out as the binder tree.
 * Each document becomes a file in the chosen format. Folders become directories.
 * Synopsis and character-sheet fields are embedded as a header block in each file.
 * This is a human-readable, non-reimportable backup — the JSON export is unchanged.
 */
router.get('/:id/archive', asyncHandler(async (req, res) => {
  const db      = getDb();
  const project = await loadOwnedProject(db, Number(req.params.id), req.user.id);

  const VALID_FORMATS = ['txt', 'rtf', 'docx'];
  const format = VALID_FORMATS.includes(req.query.format) ? req.query.format : 'txt';

  const documents = await getDocumentsForArchive(db, project.id, req.user.id);

  // OOM guard: reject requests that would stream an unreasonably large archive.
  const MAX_ARCHIVE_DOCS  = 500;
  const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024; // 100 MB of raw content
  if (documents.length > MAX_ARCHIVE_DOCS) {
    return res.status(400).json({ error: `Archive contains too many documents (${documents.length}). Maximum is ${MAX_ARCHIVE_DOCS}.` });
  }
  const estimatedBytes = documents.reduce((sum, d) => sum + (d.content?.length ?? 0), 0);
  if (estimatedBytes > MAX_ARCHIVE_BYTES) {
    return res.status(400).json({ error: 'Archive content is too large to export in one request.' });
  }

  // Fetch note_fields keyed by document_id for character sheet data
  const { rows: noteRows } = await db.query(
    `SELECT n.document_id, nf.field_name, nf.field_value
     FROM notes n
     JOIN note_fields nf ON nf.note_id = n.id
     WHERE n.project_id = $1 AND n.user_id = $2
     ORDER BY n.id, nf.sort_order`,
    [project.id, req.user.id]
  );
  const fieldsMap = new Map();
  for (const row of noteRows) {
    if (row.document_id == null) continue;
    if (!fieldsMap.has(row.document_id)) fieldsMap.set(row.document_id, []);
    fieldsMap.get(row.document_id).push({ name: row.field_name, value: row.field_value });
  }

  // Build tree from flat document list
  const nodeMap = new Map(documents.map((d) => [d.id, { doc: d, children: [] }]));

  // Detect and break cyclic parent_id chains before tree construction.
  // Without this, a self-referential binder entry (A→B→A) would cause
  // the recursive ZIP walker to loop forever (CWE-674).
  for (const entry of nodeMap.values()) {
    if (entry.doc.parent_id == null) continue;
    const seen = new Set([entry.doc.id]);
    let cur = entry.doc.parent_id;
    while (cur != null) {
      if (seen.has(cur)) {
        // Cycle detected — orphan this node so it becomes a root
        entry.doc.parent_id = null;
        break;
      }
      seen.add(cur);
      cur = nodeMap.get(cur)?.doc.parent_id ?? null;
    }
  }

  const roots   = [];
  for (const entry of nodeMap.values()) {
    if (entry.doc.parent_id == null) {
      roots.push(entry);
    } else {
      const parent = nodeMap.get(entry.doc.parent_id);
      if (parent) parent.children.push(entry);
    }
  }

  // Sanitize a title for use as a ZIP path segment (strips Windows-illegal chars)
  function safeSeg(name) {
    return (name || 'Untitled')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\.+$/, '')
      .trim() || 'Untitled';
  }

  // Extract plain text from a ProseMirror node tree (for TXT format)
  function extractPlainText(node) {
    if (!node) return '';
    if (node.type === 'text') return node.text ?? '';
    return (node.content ?? []).map(extractPlainText).join(' ');
  }

  // Build the file content buffer for a single document in the chosen format.
  // Pass doc.content = null to produce a header-only file (used for folder _notes files).
  async function buildContent(doc) {
    const pmDoc   = safeParseContent(doc.content);
    const fields  = fieldsMap.get(doc.id) ?? [];
    const synopsis = (doc.synopsis ?? '').trim();

    if (format === 'txt') {
      const lines = [`Title: ${doc.title}`];
      if (synopsis) lines.push(`Synopsis: ${synopsis}`);
      if (fields.length > 0) {
        lines.push('');
        for (const f of fields) lines.push(`${f.name}: ${f.value}`);
      }
      lines.push('', '');
      const bodyText = pmDoc ? extractPlainText(pmDoc).replace(/\s+/g, ' ').trim() : '';
      if (bodyText) lines.push(bodyText);
      return Buffer.from(lines.join('\n'), 'utf-8');
    }

    if (format === 'rtf') {
      const headerParas = [
        { type: 'paragraph', content: [{ type: 'text', text: `Title: ${doc.title}` }] },
      ];
      if (synopsis) headerParas.push({ type: 'paragraph', content: [{ type: 'text', text: `Synopsis: ${synopsis}` }] });
      if (fields.length > 0) {
        headerParas.push({ type: 'paragraph', content: [] });
        for (const f of fields) {
          headerParas.push({ type: 'paragraph', content: [{ type: 'text', text: `${f.name}: ${f.value}` }] });
        }
      }
      const body    = pmDoc?.content ?? [];
      const fullDoc = { type: 'doc', content: [...headerParas, { type: 'horizontalRule' }, ...body] };
      return Buffer.from(pmToRtf(fullDoc), 'utf-8');
    }

    // format === 'docx'
    return buildSingleDocx(doc, pmDoc, fields);
  }

  // Collect all files before streaming — ensures errors return a proper HTTP response
  const files = [];

  async function walkTree(nodes, dirPath) {
    const used = new Map(); // lowercased segment → count seen (for dedup)
    for (const node of nodes) {
      const { doc } = node;
      const isContainer = doc.type === 'folder' || doc.type === 'chapter';
      const rawSeg      = safeSeg(doc.title);
      const count       = used.get(rawSeg.toLowerCase()) ?? 0;
      used.set(rawSeg.toLowerCase(), count + 1);
      const seg  = count > 0 ? `${rawSeg}_${count + 1}` : rawSeg;
      const path = dirPath ? `${dirPath}/${seg}` : seg;

      if (isContainer) {
        const synopsis = (doc.synopsis ?? '').trim();
        const fields   = fieldsMap.get(doc.id) ?? [];
        if (synopsis || fields.length > 0) {
          const notesContent = await buildContent({ ...doc, content: null });
          files.push({ name: `${path}/_notes.${format}`, content: notesContent });
        }
        await walkTree(node.children, path);
      } else {
        files.push({ name: `${path}.${format}`, content: await buildContent(doc) });
      }
    }
  }

  const rootDir = safeSeg(project.title);
  const meta = {
    title:            project.title,
    exportedAt:       new Date().toISOString(),
    format,
    total_word_count: documents.reduce((sum, d) => sum + (d.word_count ?? 0), 0),
  };

  files.push({ name: `${rootDir}/_project.json`, content: Buffer.from(JSON.stringify(meta, null, 2), 'utf-8') });
  await walkTree(roots, rootDir);

  const safeName = project.title
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'project';
  const date = new Date().toISOString().slice(0, 10);

  res.setHeader('Content-Type', 'application/zip');
  const encodedName = encodeURIComponent(`${project.title}_${date}.zip`);
  res.setHeader('Content-Disposition',
    `attachment; filename="${safeName}-${date}.zip"; filename*=UTF-8''${encodedName}`);

  const arch = new ZipArchive({ zlib: { level: 6 } });
  arch.pipe(res);
  for (const { name, content } of files) {
    arch.append(content, { name });
  }
  await arch.finalize();
}));

export default router;
