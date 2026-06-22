import { describe, it, expect, afterAll } from 'vitest';
import { createTestDb } from './helpers/createTestDb.js';

process.env.NODE_ENV       = 'test';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';

const { Pool } = createTestDb();
const { initDb } = await import('../src/db/migrate.js');
await initDb(new Pool());

const { app, server } = await import('../src/index.js');
const { default: request } = await import('supertest');
const { getDb }             = await import('../src/db/migrate.js');
const { makeTestUser }      = await import('./helpers/makeTestUser.js');

afterAll(() => server.close());

// ── Helpers ───────────────────────────────────────────────────────────────────

let _userSeq = 0;
async function makeUser(name = 'User') {
  return makeTestUser(getDb(), name, `compile-${++_userSeq}`);
}

function authed(req, headers) {
  return req.set(headers);
}

// Creates a project + one scene document. Returns { projectId, docId }.
async function makeProjectWithScene(headers, projectTitle = 'Test Novel') {
  const proj = await authed(
    request(app).post('/api/projects').send({ title: projectTitle }),
    headers,
  );
  const doc = await authed(
    request(app)
      .post(`/api/projects/${proj.body.id}/documents`)
      .send({ title: 'Scene 1', type: 'scene' }),
    headers,
  );
  return { projectId: proj.body.id, docId: doc.body.id };
}

// Extracts the bare filename from a Content-Disposition header value.
function getFilename(res) {
  const cd = res.headers['content-disposition'] ?? '';
  const m  = cd.match(/filename="?([^";]+)"?/);
  return m ? m[1] : null;
}

const TODAY = new Date().toISOString().slice(0, 10);

// ── Validation ────────────────────────────────────────────────────────────────

describe('POST /api/projects/:id/compile — validation', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/projects/1/compile')
      .send({ documentIds: [1], format: 'docx' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for a nonexistent project', async () => {
    const { headers } = await makeUser();
    const res = await authed(
      request(app).post('/api/projects/999999/compile').send({ documentIds: [1], format: 'docx' }),
      headers,
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when another user owns the project", async () => {
    const alice = await makeUser('Alice');
    const bob   = await makeUser('Bob');
    const { projectId, docId } = await makeProjectWithScene(alice.headers);
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: [docId], format: 'docx' }),
      bob.headers,
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when format is missing', async () => {
    const { headers } = await makeUser();
    const { projectId, docId } = await makeProjectWithScene(headers);
    const res = await authed(
      request(app).post(`/api/projects/${projectId}/compile`).send({ documentIds: [docId] }),
      headers,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when format is invalid', async () => {
    const { headers } = await makeUser();
    const { projectId, docId } = await makeProjectWithScene(headers);
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: [docId], format: 'rtf' }),
      headers,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when documentIds is an empty array', async () => {
    const { headers } = await makeUser();
    const { projectId } = await makeProjectWithScene(headers);
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: [], format: 'docx' }),
      headers,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when documentIds exceeds 500 entries (schema fires before IDOR check)', async () => {
    const { headers } = await makeUser();
    const { projectId } = await makeProjectWithScene(headers);
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: Array.from({ length: 501 }, (_, i) => i + 1), format: 'docx' }),
      headers,
    );
    expect(res.status).toBe(400);
  });
});

// ── IDOR ──────────────────────────────────────────────────────────────────────

describe('POST /api/projects/:id/compile — IDOR', () => {
  it("returns 403 when a documentId belongs to another user", async () => {
    const alice = await makeUser('Alice');
    const bob   = await makeUser('Bob');

    const { docId: aliceDocId }       = await makeProjectWithScene(alice.headers);
    const { projectId: bobProjectId } = await makeProjectWithScene(bob.headers);

    const res = await authed(
      request(app)
        .post(`/api/projects/${bobProjectId}/compile`)
        .send({ documentIds: [aliceDocId], format: 'docx' }),
      bob.headers,
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not accessible/i);
  });

  it("returns 403 when a documentId belongs to a different project of the same user", async () => {
    const { headers } = await makeUser();
    const { projectId: projectA, docId: docA } = await makeProjectWithScene(headers, 'Project A');
    const { docId: docB } = await makeProjectWithScene(headers, 'Project B');

    // POST to projectA but include a doc from projectB
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectA}/compile`)
        .send({ documentIds: [docB], format: 'docx' }),
      headers,
    );
    expect(res.status).toBe(403);

    // Confirm the inverse: own doc in own project is fine
    const ok = await authed(
      request(app)
        .post(`/api/projects/${projectA}/compile`)
        .send({ documentIds: [docA], format: 'docx' }),
      headers,
    );
    expect(ok.status).toBe(200);
  });

  it('returns 403 when a documentId does not exist in the database', async () => {
    const { headers } = await makeUser();
    const { projectId } = await makeProjectWithScene(headers);
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: [99999999], format: 'docx' }),
      headers,
    );
    expect(res.status).toBe(403);
  });
});

// ── DOCX ──────────────────────────────────────────────────────────────────────

describe('POST /api/projects/:id/compile — DOCX', () => {
  it('returns 200 with the correct Content-Type', async () => {
    const { headers } = await makeUser();
    const { projectId, docId } = await makeProjectWithScene(headers);
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: [docId], format: 'docx' }),
      headers,
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(
      /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/,
    );
  });

  it('returns a Content-Disposition header with a .docx filename containing today\'s date', async () => {
    const { headers } = await makeUser();
    const { projectId, docId } = await makeProjectWithScene(headers);
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: [docId], format: 'docx' }),
      headers,
    );
    const filename = getFilename(res);
    expect(filename).toMatch(/\.docx$/);
    expect(filename).toContain(TODAY);
  });
});

// ── ePub ──────────────────────────────────────────────────────────────────────

describe('POST /api/projects/:id/compile — ePub', () => {
  it('returns 200 with Content-Type application/epub+zip', async () => {
    const { headers } = await makeUser();
    const { projectId, docId } = await makeProjectWithScene(headers);
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: [docId], format: 'epub' }),
      headers,
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/epub\+zip/);
  });

  it('returns a .epub filename in Content-Disposition', async () => {
    const { headers } = await makeUser();
    const { projectId, docId } = await makeProjectWithScene(headers);
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: [docId], format: 'epub' }),
      headers,
    );
    expect(getFilename(res)).toMatch(/\.epub$/);
  });

  it('groups scenes under their folder parent without error', async () => {
    const { headers } = await makeUser();
    const proj = await authed(
      request(app).post('/api/projects').send({ title: 'Grouped Novel' }),
      headers,
    );
    const projectId = proj.body.id;

    // Create a folder then two scene children
    const folder = await authed(
      request(app)
        .post(`/api/projects/${projectId}/documents`)
        .send({ title: 'Chapter 1', type: 'folder' }),
      headers,
    );
    const scene1 = await authed(
      request(app)
        .post(`/api/projects/${projectId}/documents`)
        .send({ title: 'Scene 1', type: 'scene', parent_id: folder.body.id }),
      headers,
    );
    const scene2 = await authed(
      request(app)
        .post(`/api/projects/${projectId}/documents`)
        .send({ title: 'Scene 2', type: 'scene', parent_id: folder.body.id }),
      headers,
    );

    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: [scene1.body.id, scene2.body.id], format: 'epub' }),
      headers,
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/epub\+zip/);
  });
});

// ── Markdown ──────────────────────────────────────────────────────────────────

describe('POST /api/projects/:id/compile — Markdown', () => {
  it('returns 200 with Content-Type text/markdown', async () => {
    const { headers } = await makeUser();
    const { projectId, docId } = await makeProjectWithScene(headers);
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: [docId], format: 'markdown' }),
      headers,
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/markdown/);
  });

  it('returns a .md filename in Content-Disposition', async () => {
    const { headers } = await makeUser();
    const { projectId, docId } = await makeProjectWithScene(headers);
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: [docId], format: 'markdown' }),
      headers,
    );
    expect(getFilename(res)).toMatch(/\.md$/);
  });
});

// ── Manuscript ────────────────────────────────────────────────────────────────

describe('POST /api/projects/:id/compile — Manuscript', () => {
  it('returns 200 with DOCX Content-Type for manuscript format', async () => {
    const { headers } = await makeUser();
    const { projectId, docId } = await makeProjectWithScene(headers);
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: [docId], format: 'manuscript' }),
      headers,
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(
      /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/,
    );
  });

  it('returns a filename containing "Manuscript" with a .docx extension', async () => {
    const { headers } = await makeUser();
    const { projectId, docId } = await makeProjectWithScene(headers);
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: [docId], format: 'manuscript' }),
      headers,
    );
    const filename = getFilename(res);
    expect(filename).toMatch(/Manuscript/i);
    expect(filename).toMatch(/\.docx$/);
  });
});

// ── PDF ───────────────────────────────────────────────────────────────────────

// PDF requires a real Chromium binary (PUPPETEER_EXECUTABLE_PATH) which is not
// available in the plain Node test environment. Expected: status 200,
// Content-Type 'application/pdf', .pdf extension in Content-Disposition.
it.todo('PDF format — needs Chromium');

// ── safeFilename (via Content-Disposition header) ─────────────────────────────

describe('safeFilename — path safety (via Content-Disposition)', () => {
  it('strips path-traversal characters from the project title', async () => {
    const { headers } = await makeUser();
    const { projectId, docId } = await makeProjectWithScene(headers, '../evil/file');
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: [docId], format: 'markdown' }),
      headers,
    );
    const filename = getFilename(res);
    expect(filename).not.toContain('..');
    expect(filename).not.toContain('/');
    expect(filename).not.toContain('\\');
    expect(filename).toMatch(/\.md$/);
  });

  it('replaces spaces with underscores', async () => {
    const { headers } = await makeUser();
    const { projectId, docId } = await makeProjectWithScene(headers, 'My Novel');
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: [docId], format: 'docx' }),
      headers,
    );
    expect(getFilename(res)).toContain('My_Novel');
  });

  it('truncates the safe portion to 60 characters', async () => {
    const { headers } = await makeUser();
    const longTitle = 'A'.repeat(80);
    const { projectId, docId } = await makeProjectWithScene(headers, longTitle);
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: [docId], format: 'docx' }),
      headers,
    );
    const filename = getFilename(res);
    // Remove _YYYY-MM-DD.ext suffix to isolate the safe title portion
    const safePortion = filename.replace(/_\d{4}-\d{2}-\d{2}\.\w+$/, '');
    expect(safePortion.length).toBeLessThanOrEqual(60);
  });

  it('falls back to "export" when the title contains only special characters', async () => {
    const { headers } = await makeUser();
    const { projectId, docId } = await makeProjectWithScene(headers, '!@#$%');
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectId}/compile`)
        .send({ documentIds: [docId], format: 'docx' }),
      headers,
    );
    expect(getFilename(res)).toMatch(/^export_/);
  });
});
