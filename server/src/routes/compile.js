/**
 * @file routes/compile.js
 * @description Document compile and export route (PDF, DOCX, ePub).
 *
 * POST /api/projects/:projectId/compile
 *
 * Body: { documentIds: number[], format: 'pdf' | 'docx' | 'epub' }
 *
 * Returns a binary file download with an appropriate Content-Type and a
 * server-generated Content-Disposition filename (never derived from raw
 * user input without sanitisation).
 *
 * Security notes:
 *  - Every documentId is validated to belong to the requesting user + project (IDOR prevention).
 *  - HTML passed to Puppeteer/epub is sanitised with DOMPurify (server-side).
 *  - Puppeteer runs with --no-sandbox because the Docker container runs as a
 *    non-root user (USER node). In production (Milestone 8) a custom Chrome
 *    seccomp profile must be applied; see docker-compose.yml security_opt.
 *  - Content-Disposition filename is stripped of path-traversal characters.
 *  - Document count is capped at 500 to prevent resource exhaustion.
 */

import { Router }          from 'express';
import { z }               from 'zod';
import puppeteer           from 'puppeteer';
import DOMPurify           from 'isomorphic-dompurify';
import EpubModule          from 'epub-gen-memory';
// epub-gen-memory is a CJS module. Bundlers (Vite/esbuild) wrap it as { default: fn };
// plain Node.js ESM interop gives the function directly. Handle both.
const epub = EpubModule.default ?? EpubModule;

import { getDb }           from '../db/migrate.js';
import { getDocumentsByIdsMap } from '../db/documentDb.js';
import { getUserById }     from '../db/userDb.js';
import { requireAuth }     from '../middleware/requireAuth.js';
import { loadOwnedProject, asyncHandler } from '../middleware/ownership.js';
import { pmToHtml }        from '../lib/pmToHtml.js';
import { safeParseContent } from '../lib/pmContent.js';
import { buildDocx }       from '../lib/pmToDocx.js';
import { buildMarkdown }   from '../lib/pmToMarkdown.js';
import { buildManuscript } from '../lib/buildManuscript.js';
import logger              from '../logger.js';

const router = Router();
router.use(requireAuth); // All compile routes require authentication

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Zod schema for the compile request body.
 * documentIds: 1–500 document IDs to include in the export.
 * format: target export format.
 */
const compileSchema = z.object({
  documentIds: z.array(z.number().int().positive()).min(1).max(500),
  format:      z.enum(['pdf', 'docx', 'epub', 'markdown', 'manuscript']),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generate a safe filename for the Content-Disposition header.
 * Strips path-traversal characters, replaces spaces with underscores,
 * appends the current date, and limits total length to 60 chars.
 *
 * @param {string} title - The project title (untrusted user content).
 * @param {string} ext   - File extension without the dot (e.g., 'pdf').
 * @returns {string} A safe filename string (e.g., 'My_Novel_2025-01-15.pdf').
 */
function safeFilename(title, ext) {
  const safe = String(title)
    .replace(/[^a-zA-Z0-9 \-_]/g, '')   // Strip anything that could be a path separator or injection
    .replace(/\s+/g, '_')
    .trim()
    .slice(0, 60) || 'export';           // Fallback to 'export' if nothing remains after stripping
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${safe}_${date}.${ext}`;
}

/**
 * Build a Content-Disposition header value with RFC 5987 Unicode filename support.
 * Produces both a plain ASCII filename= (for legacy clients) and filename*= (RFC 5987)
 * so Unicode project titles survive the download in modern browsers.
 */
function contentDisposition(asciiFilename, rawTitle, ext) {
  const date    = new Date().toISOString().slice(0, 10);
  const encoded = encodeURIComponent(`${rawTitle}_${date}.${ext}`);
  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encoded}`;
}

/**
 * Sanitise an HTML string through DOMPurify before passing it to Puppeteer or epub-gen.
 * Even though pmToHtml() already produces safe output, DOMPurify provides defense-in-depth
 * against any future changes to the HTML generation pipeline.
 *
 * @param {string} html - HTML string to sanitise.
 * @returns {string} Sanitised HTML safe for use in rendering contexts.
 */
function sanitise(html) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS:  ['p','h1','h2','h3','h4','h5','h6','strong','em','u','s',
                    'code','pre','ul','ol','li','blockquote','mark','br','hr','div'],
    ALLOWED_ATTR:  ['style'],
    ALLOWED_STYLES: {
      // Only allow text-align and background-color (for highlights) — no other CSS properties
      '*': { 'text-align': [/.*/], 'background-color': [/^#[0-9a-fA-F]{3,8}$/] },
    },
  });
}

/**
 * Print CSS injected into the Puppeteer HTML template.
 * Uses Georgia serif for a clean manuscript look.
 */
const PRINT_CSS = `
  @page { size: A4; margin: 2cm; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 12pt; line-height: 1.8; color: #000; max-width: 100%;
  }
  h1 { font-size: 18pt; margin: 24pt 0 12pt; page-break-after: avoid; }
  h2 { font-size: 15pt; margin: 18pt 0 9pt;  page-break-after: avoid; }
  h3 { font-size: 13pt; margin: 14pt 0 6pt;  page-break-after: avoid; }
  p  { margin: 0 0 0.5em; }
  .chapter-header {
    font-size: 16pt; font-weight: bold; margin-bottom: 1em;
    border-bottom: 1px solid #ccc; padding-bottom: 0.5em;
    page-break-before: always;
  }
  .chapter-header:first-child { page-break-before: avoid; }
  blockquote {
    border-left: 3px solid #ccc; padding-left: 1em;
    margin: 0.5em 0 0.5em 0; color: #444;
  }
  pre, code { font-family: 'Courier New', monospace; font-size: 10pt; }
  pre { background: #f5f5f5; padding: 1em; white-space: pre-wrap; }
  ul, ol { padding-left: 2em; }
  hr { border: none; border-top: 1px solid #ccc; margin: 1em 0; }
  mark { background: #ffd700; }
`;

/**
 * ePub stylesheet injected into each chapter by epub-gen-memory.
 * Simpler than PRINT_CSS since ePub readers have their own defaults.
 */
const EPUB_CSS = `
  body { font-family: serif; font-size: 100%; line-height: 1.6; }
  h1, h2, h3 { margin-top: 1.5em; }
  p { margin: 0.5em 0; }
  blockquote { border-left: 3px solid #ccc; padding-left: 1em; margin-left: 0; }
  code, pre { font-family: monospace; background: #f5f5f5; }
  pre { padding: 0.5em; white-space: pre-wrap; }
`;

// ── PDF concurrency guard ─────────────────────────────────────────────────────
// Cap simultaneous Puppeteer/Chromium launches at 2 to prevent an authenticated
// user from exhausting server memory with concurrent PDF compile requests (F-21).
let _pdfActive = 0;
const _pdfQueue = [];
function acquirePdfSlot() {
  return new Promise((resolve) => {
    if (_pdfActive < 2) { _pdfActive++; resolve(); }
    else _pdfQueue.push(resolve);
  });
}
function releasePdfSlot() {
  if (_pdfQueue.length > 0) { _pdfQueue.shift()(); }
  else { _pdfActive--; }
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/projects/:projectId/compile
 * Compile and export selected documents to PDF, DOCX, or ePub.
 */
router.post('/projects/:projectId/compile', asyncHandler(async (req, res) => {
  const db        = getDb();
  const projectId = Number(req.params.projectId);

  const project = await loadOwnedProject(db, projectId, req.user.id);

  const parsed = compileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  const { documentIds, format } = parsed.data;

  // One round-trip fetches every requested document. Ownership + project
  // scope are enforced here in app code (rather than via a WHERE clause)
  // so we can return a specific 403 mentioning which id failed.
  const docMap = await getDocumentsByIdsMap(db, documentIds);
  for (const docId of documentIds) {
    const doc = docMap.get(docId);
    // Missing, foreign owner, or wrong project all collapse into 403.
    // Reporting "not found" vs "forbidden" separately would leak existence
    // of other users' documents.
    if (!doc || doc.project_id !== projectId || doc.user_id !== req.user.id) {
      return res.status(403).json({ error: `Document ${docId} not accessible` });
    }
  }
  // Materialise documents in the order the caller requested — the compile
  // output (PDF chapter order, ePub spine, manuscript page sequence) must
  // match the user's selection, not the database's natural row order.
  const documents = documentIds.map((id) => docMap.get(id));

  // Build the chapter list: each chapter has a title and a parsed ProseMirror JSON tree
  const chapters = documents.map((doc) => ({
    title: doc.title,
    pmDoc: safeParseContent(doc.content),
  }));

  const totalWordCount = documents.reduce((sum, d) => sum + (d.word_count ?? 0), 0);

  try {
    const ext      = format === 'manuscript' ? 'docx' : format === 'markdown' ? 'md' : format;
    const rawTitle = format === 'manuscript' ? `${project.title} (Manuscript)` : project.title;
    const filename = format === 'manuscript'
      ? safeFilename(`${project.title} (Manuscript)`, 'docx')
      : safeFilename(project.title, ext);

    if (format === 'pdf') {
      // ── PDF via Puppeteer ────────────────────────────────────────────────
      // Build a single HTML document containing all chapters in order
      const bodyHtml = chapters.map(({ title, pmDoc }, i) => {
        const contentHtml = sanitise(pmToHtml(pmDoc ?? { type: 'doc', content: [] }));
        return `<div class="chapter-header"${i === 0 ? '' : ''}>${escapeHtml(title)}</div>\n${contentHtml}`;
      }).join('\n');

      const authorName = req.user?.display_name ?? '';
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>${escapeHtml(project.title)}</title>
        <meta name="author" content="${escapeHtml(authorName)}">
        <style>${PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`;

      // --no-sandbox is safe because the container runs as USER node (non-root).
      // PUPPETEER_EXECUTABLE_PATH points to system Chromium in Docker (set in Dockerfile).
      // Falls back to Puppeteer's bundled Chrome in local dev where the env var is unset.
      await acquirePdfSlot();
      const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        args: [
          // Sandbox is enabled via the Chrome seccomp profile in docker-compose.yml.
          // In local dev (no seccomp) the sandbox runs in user-namespace mode which
          // works without root privileges.
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
        timeout: 30000,
      });
      // Catch unexpected Chromium crashes without taking down the Node process
      browser.on('error', (err) => {
        logger.warn({ err: err.message }, 'puppeteer browser error');
      });
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '2cm', right: '2cm', bottom: '2cm', left: '2cm' },
        });
        res.set({
          'Content-Type':        'application/pdf',
          'Content-Disposition': contentDisposition(filename, rawTitle, 'pdf'),
          'Content-Length':      pdf.length,
        });
        res.send(Buffer.from(pdf));
      } finally {
        // Always close the browser, even if PDF generation throws
        await browser.close().catch((err) => {
          logger.warn({ err: err.message }, 'browser close error');
        });
        releasePdfSlot();
      }

    } else if (format === 'docx') {
      // ── DOCX via docx.js ──────────────────────────────────────────────────
      // buildDocx() maps each chapter's ProseMirror nodes to docx Paragraph/TextRun objects
      const buffer = await buildDocx(chapters, {
        projectTitle: project.title,
        author:       req.user.display_name ?? 'Author',
      });
      res.set({
        'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': contentDisposition(filename, rawTitle, 'docx'),
        'Content-Length':      buffer.length,
      });
      res.send(buffer);

    } else if (format === 'epub') {
      // ── ePub via epub-gen-memory ──────────────────────────────────────────
      // Group scenes under their nearest folder/chapter parent (Scrivener-style):
      // each folder/chapter node becomes one ePub chapter; its scenes are merged
      // into that chapter's content. Scenes with no folder/chapter parent remain
      // as standalone ePub chapters.
      // Collect the unique parent ids referenced by the selected docs, then
      // batch-fetch them. A scene's parent may live OUTSIDE the user's
      // selection (they exported a chapter's scenes but not the chapter
      // node itself), so we have to look up parents separately.
      const parentIds = [...new Set(documents.filter(d => d.parent_id).map(d => d.parent_id))];
      const parentDocMap = await getDocumentsByIdsMap(db, parentIds);
      // Re-check ownership and project scope on parents — the selected docs
      // were already vetted above, but their parent_ids are user-influenced
      // and could in principle point at another user's row.
      const parentMap = Object.fromEntries(
        [...parentDocMap.values()]
          .filter(d => d && d.user_id === req.user.id && d.project_id === projectId)
          .map(d => [d.id, d])
      );

      const groups = new Map(); // parentId → { title, scenes, firstIndex }
      const solo   = [];

      documents.forEach((doc, i) => {
        const parent = doc.parent_id ? parentMap[doc.parent_id] : null;
        if (parent && (parent.type === 'folder' || parent.type === 'chapter')) {
          if (!groups.has(doc.parent_id)) {
            groups.set(doc.parent_id, { title: parent.title, scenes: [], firstIndex: i });
          }
          groups.get(doc.parent_id).scenes.push(doc);
        } else {
          solo.push({ title: doc.title, scenes: [doc], firstIndex: i });
        }
      });

      const epubContent = [...groups.values(), ...solo]
        .sort((a, b) => a.firstIndex - b.firstIndex)
        .map(({ title, scenes }) => ({
          title: escapeHtml(title),
          content: sanitise(
            scenes.map(scene => {
              const pmDoc = safeParseContent(scene.content);
              const html = pmToHtml(pmDoc ?? { type: 'doc', content: [] });
              // Add scene title as sub-heading only when multiple scenes share a chapter
              return scenes.length > 1 ? `<h2>${escapeHtml(scene.title)}</h2>\n${html}` : html;
            }).join('\n')
          ),
        }));

      const epubData = await epub(
        {
          title:  project.title,
          author: req.user.display_name ?? 'Author',
          css:    EPUB_CSS,            // Applied to every chapter
        },
        epubContent,
      );

      const buffer = Buffer.from(epubData);
      res.set({
        'Content-Type':        'application/epub+zip',
        'Content-Disposition': contentDisposition(filename, rawTitle, 'epub'),
        'Content-Length':      buffer.length,
      });
      res.send(buffer);

    } else if (format === 'markdown') {
      // ── Markdown plain-text export ────────────────────────────────────────
      const buffer = buildMarkdown(chapters);
      res.set({
        'Content-Type':        'text/markdown; charset=utf-8',
        'Content-Disposition': contentDisposition(filename, rawTitle, 'md'),
        'Content-Length':      buffer.length,
      });
      res.send(buffer);

    } else if (format === 'manuscript') {
      // ── Standard Manuscript Format DOCX ──────────────────────────────────
      const msUser = await getUserById(db, req.user.id);
      const buffer = await buildManuscript(chapters, {
        projectTitle: project.title,
        legalName:    msUser.ms_legal_name || req.user.display_name || 'Author',
        penName:      msUser.ms_pen_name   || msUser.ms_legal_name || req.user.display_name || 'Author',
        address:      msUser.ms_address    || '',
        phone:        msUser.ms_phone      || '',
        email:        msUser.ms_email      || msUser.email || '',
        wordCount:    totalWordCount,
      });
      res.set({
        'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': contentDisposition(filename, rawTitle, 'docx'),
        'Content-Length':      buffer.length,
      });
      res.send(buffer);
    }

  } catch (err) {
    // Log format + user context only — never log document content
    logger.error({ format, projectId, uid: req.user.id, err: err.message }, 'compile error');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Export failed' });
    }
  }
}));

/**
 * HTML-encode a string for safe insertion into HTML text content.
 * Used for chapter titles inserted into the Puppeteer HTML template.
 *
 * @param {string} str - Raw string (e.g., a document title from the DB).
 * @returns {string} HTML-encoded string safe for text node insertion.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default router;
