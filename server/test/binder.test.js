import { describe, it, expect, afterAll } from 'vitest';
import { createTestDb } from './helpers/createTestDb.js';

process.env.NODE_ENV       = 'test';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';

const { Pool } = createTestDb();
const { initDb } = await import('../src/db/migrate.js');
await initDb(new Pool());

const { app, server } = await import('../src/index.js');
const { default: request } = await import('supertest');
const { getDb } = await import('../src/db/migrate.js');
const { makeTestUser } = await import('./helpers/makeTestUser.js');

afterAll(() => server.close());

// ── Helpers ───────────────────────────────────────────────────────────────────

let _userSeq = 0;
async function makeUser(name = 'User') {
  return makeTestUser(getDb(), name, `binder-${++_userSeq}`);
}

// Shorthand: returns req with auth header set.
function authed(req, headers) {
  return req.set(headers);
}

// ── GET /api/projects ─────────────────────────────────────────────────────────

describe('GET /api/projects', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });

  it('returns an empty list for a new user', async () => {
    const { headers } = await makeUser();
    const res = await request(app).get('/api/projects').set(headers);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/projects', () => {
  it('creates a project and returns it', async () => {
    const { headers } = await makeUser();
    const res = await authed(
      request(app).post('/api/projects').send({ title: 'My Novel' }),
      headers,
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'My Novel' });
    expect(res.body.id).toBeTypeOf('number');
  });

  it('returns 400 for a missing title', async () => {
    const { headers } = await makeUser();
    const res = await authed(request(app).post('/api/projects').send({}), headers);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a title that is too long', async () => {
    const { headers } = await makeUser();
    const res = await authed(
      request(app).post('/api/projects').send({ title: 'x'.repeat(201) }),
      headers,
    );
    expect(res.status).toBe(400);
  });
});

// ── PATCH /api/projects/:id ───────────────────────────────────────────────────

describe('PATCH /api/projects/:id', () => {
  it('renames an owned project', async () => {
    const { headers } = await makeUser();
    const create = await authed(
      request(app).post('/api/projects').send({ title: 'Old Name' }),
      headers,
    );
    const { id } = create.body;

    const res = await authed(
      request(app).patch(`/api/projects/${id}`).send({ title: 'New Name' }),
      headers,
    );
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New Name');
  });

  it("returns 403 when renaming another user's project", async () => {
    const a = await makeUser('Alice');
    const b = await makeUser('Bob');

    const create = await authed(
      request(app).post('/api/projects').send({ title: "Alice's Project" }),
      a.headers,
    );
    const { id } = create.body;

    const res = await authed(
      request(app).patch(`/api/projects/${id}`).send({ title: 'Hijacked' }),
      b.headers,
    );
    expect(res.status).toBe(403);
  });
});

// ── DELETE /api/projects/:id ──────────────────────────────────────────────────

describe('DELETE /api/projects/:id', () => {
  it('deletes an owned project', async () => {
    const { headers } = await makeUser();
    const create = await authed(
      request(app).post('/api/projects').send({ title: 'To Delete' }),
      headers,
    );
    const { id } = create.body;

    const del = await authed(request(app).delete(`/api/projects/${id}`), headers);
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/projects').set(headers);
    expect(list.body.find((p) => p.id === id)).toBeUndefined();
  });

  it("returns 403 when deleting another user's project", async () => {
    const a = await makeUser('Alice');
    const b = await makeUser('Bob');

    const create = await authed(
      request(app).post('/api/projects').send({ title: "Alice's" }),
      a.headers,
    );
    const { id } = create.body;

    const res = await authed(request(app).delete(`/api/projects/${id}`), b.headers);
    expect(res.status).toBe(403);
  });
});

// ── Documents ─────────────────────────────────────────────────────────────────

describe('GET /api/projects/:projectId/documents', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/projects/1/documents');
    expect(res.status).toBe(401);
  });

  it('returns the default scaffold for a new project', async () => {
    const { headers } = await makeUser();
    const { body: project } = await authed(
      request(app).post('/api/projects').send({ title: 'P' }),
      headers,
    );
    const res = await request(app)
      .get(`/api/projects/${project.id}/documents`)
      .set(headers);
    expect(res.status).toBe(200);
    // New projects are seeded with Story / Chapter 1 / Scene 1 + Notes / Characters / Research
    expect(res.body).toHaveLength(6);
    const titles = res.body.map((d) => d.title);
    expect(titles).toContain('Story');
    expect(titles).toContain('Chapter 1');
    expect(titles).toContain('Scene 1');
    expect(titles).toContain('Notes');
    expect(titles).toContain('Characters');
    expect(titles).toContain('Research');
  });

  it("returns 403 when accessing another user's project documents", async () => {
    const a = await makeUser('Alice');
    const b = await makeUser('Bob');

    const { body: project } = await authed(
      request(app).post('/api/projects').send({ title: 'Docs Project' }),
      a.headers,
    );

    const res = await request(app)
      .get(`/api/projects/${project.id}/documents`)
      .set(b.headers);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/projects/:projectId/documents', () => {
  it('creates a root document', async () => {
    const { headers } = await makeUser();
    const { body: project } = await authed(
      request(app).post('/api/projects').send({ title: 'P' }),
      headers,
    );

    const res = await authed(
      request(app)
        .post(`/api/projects/${project.id}/documents`)
        .send({ title: 'Chapter 1', type: 'scene' }),
      headers,
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Chapter 1', type: 'scene', parent_id: null });
  });

  it('creates a child document with valid parent_id', async () => {
    const { headers } = await makeUser();
    const { body: project } = await authed(
      request(app).post('/api/projects').send({ title: 'P' }),
      headers,
    );

    const { body: folder } = await authed(
      request(app)
        .post(`/api/projects/${project.id}/documents`)
        .send({ title: 'Part I', type: 'folder' }),
      headers,
    );

    const res = await authed(
      request(app)
        .post(`/api/projects/${project.id}/documents`)
        .send({ title: 'Scene 1', type: 'scene', parent_id: folder.id }),
      headers,
    );
    expect(res.status).toBe(201);
    expect(res.body.parent_id).toBe(folder.id);
  });

  it('returns 400 for an invalid type', async () => {
    const { headers } = await makeUser();
    const { body: project } = await authed(
      request(app).post('/api/projects').send({ title: 'P' }),
      headers,
    );

    const res = await authed(
      request(app)
        .post(`/api/projects/${project.id}/documents`)
        .send({ title: 'X', type: 'invalid' }),
      headers,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when parent_id belongs to another user's document", async () => {
    const a = await makeUser('Alice');
    const b = await makeUser('Bob');

    const { body: projectA } = await authed(
      request(app).post('/api/projects').send({ title: 'A Project' }),
      a.headers,
    );
    const { body: projectB } = await authed(
      request(app).post('/api/projects').send({ title: 'B Project' }),
      b.headers,
    );
    const { body: docA } = await authed(
      request(app)
        .post(`/api/projects/${projectA.id}/documents`)
        .send({ title: 'A Doc', type: 'folder' }),
      a.headers,
    );

    // Bob tries to use Alice's document as a parent inside Bob's project
    const res = await authed(
      request(app)
        .post(`/api/projects/${projectB.id}/documents`)
        .send({ title: 'Bad', type: 'scene', parent_id: docA.id }),
      b.headers,
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/documents/:id', () => {
  it('renames a document', async () => {
    const { headers } = await makeUser();
    const { body: project } = await authed(
      request(app).post('/api/projects').send({ title: 'P' }),
      headers,
    );
    const { body: doc } = await authed(
      request(app)
        .post(`/api/projects/${project.id}/documents`)
        .send({ title: 'Old', type: 'scene' }),
      headers,
    );

    const res = await authed(
      request(app).patch(`/api/documents/${doc.id}`).send({ title: 'New' }),
      headers,
    );
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New');
  });

  it("returns 403 when patching another user's document", async () => {
    const a = await makeUser('Alice');
    const b = await makeUser('Bob');

    const { body: project } = await authed(
      request(app).post('/api/projects').send({ title: 'P' }),
      a.headers,
    );
    const { body: doc } = await authed(
      request(app)
        .post(`/api/projects/${project.id}/documents`)
        .send({ title: 'Alice Doc', type: 'scene' }),
      a.headers,
    );

    const res = await authed(
      request(app).patch(`/api/documents/${doc.id}`).send({ title: 'Hijacked' }),
      b.headers,
    );
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/documents/:id', () => {
  it('deletes an owned document', async () => {
    const { headers } = await makeUser();
    const { body: project } = await authed(
      request(app).post('/api/projects').send({ title: 'P' }),
      headers,
    );
    const { body: doc } = await authed(
      request(app)
        .post(`/api/projects/${project.id}/documents`)
        .send({ title: 'To Delete', type: 'scene' }),
      headers,
    );

    const del = await authed(request(app).delete(`/api/documents/${doc.id}`), headers);
    expect(del.status).toBe(204);
  });

  it("returns 403 when deleting another user's document", async () => {
    const a = await makeUser('Alice');
    const b = await makeUser('Bob');

    const { body: project } = await authed(
      request(app).post('/api/projects').send({ title: 'P' }),
      a.headers,
    );
    const { body: doc } = await authed(
      request(app)
        .post(`/api/projects/${project.id}/documents`)
        .send({ title: 'A Doc', type: 'scene' }),
      a.headers,
    );

    const res = await authed(request(app).delete(`/api/documents/${doc.id}`), b.headers);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/documents/reorder', () => {
  it('reorders owned documents', async () => {
    const { headers } = await makeUser();
    const { body: project } = await authed(
      request(app).post('/api/projects').send({ title: 'P' }),
      headers,
    );
    const { body: d1 } = await authed(
      request(app)
        .post(`/api/projects/${project.id}/documents`)
        .send({ title: 'D1', type: 'scene', sort_order: 0 }),
      headers,
    );
    const { body: d2 } = await authed(
      request(app)
        .post(`/api/projects/${project.id}/documents`)
        .send({ title: 'D2', type: 'scene', sort_order: 1 }),
      headers,
    );

    const res = await authed(
      request(app)
        .patch('/api/documents/reorder')
        .send([{ id: d1.id, sort_order: 1 }, { id: d2.id, sort_order: 0 }]),
      headers,
    );
    expect(res.status).toBe(204);
  });

  it("returns 403 when reorder payload includes another user's document", async () => {
    const a = await makeUser('Alice');
    const b = await makeUser('Bob');

    const { body: pA } = await authed(
      request(app).post('/api/projects').send({ title: 'PA' }),
      a.headers,
    );
    const { body: docA } = await authed(
      request(app)
        .post(`/api/projects/${pA.id}/documents`)
        .send({ title: 'A Doc', type: 'scene' }),
      a.headers,
    );

    const { body: pB } = await authed(
      request(app).post('/api/projects').send({ title: 'PB' }),
      b.headers,
    );
    const { body: docB } = await authed(
      request(app)
        .post(`/api/projects/${pB.id}/documents`)
        .send({ title: 'B Doc', type: 'scene' }),
      b.headers,
    );

    // Bob includes Alice's doc ID in his reorder — should be rejected
    const res = await authed(
      request(app)
        .patch('/api/documents/reorder')
        .send([{ id: docA.id, sort_order: 0 }, { id: docB.id, sort_order: 1 }]),
      b.headers,
    );
    expect(res.status).toBe(403);
  });
});

// ── Synopsis field ────────────────────────────────────────────────────────────

describe('PATCH /api/documents/:id — synopsis', () => {
  async function makeDocInProject(headers) {
    const { body: project } = await authed(
      request(app).post('/api/projects').send({ title: 'P' }), headers,
    );
    const { body: doc } = await authed(
      request(app)
        .post(`/api/projects/${project.id}/documents`)
        .send({ title: 'Scene', type: 'scene' }),
      headers,
    );
    return { project, doc };
  }

  it('new documents include synopsis defaulting to empty string', async () => {
    const { headers } = await makeUser();
    const { doc } = await makeDocInProject(headers);
    expect(doc.synopsis).toBe('');
  });

  it('saves and returns synopsis', async () => {
    const { headers } = await makeUser();
    const { doc } = await makeDocInProject(headers);

    const res = await authed(
      request(app).patch(`/api/documents/${doc.id}`).send({ synopsis: 'A tense opening.' }),
      headers,
    );
    expect(res.status).toBe(200);
    expect(res.body.synopsis).toBe('A tense opening.');
  });

  it('rejects synopsis longer than 500 characters', async () => {
    const { headers } = await makeUser();
    const { doc } = await makeDocInProject(headers);

    const res = await authed(
      request(app).patch(`/api/documents/${doc.id}`).send({ synopsis: 'x'.repeat(501) }),
      headers,
    );
    expect(res.status).toBe(400);
  });

  it('accepts synopsis of exactly 500 characters', async () => {
    const { headers } = await makeUser();
    const { doc } = await makeDocInProject(headers);

    const res = await authed(
      request(app).patch(`/api/documents/${doc.id}`).send({ synopsis: 'x'.repeat(500) }),
      headers,
    );
    expect(res.status).toBe(200);
  });

  it('synopsis persists and appears in the document tree', async () => {
    const { headers } = await makeUser();
    const { project, doc } = await makeDocInProject(headers);

    await authed(
      request(app).patch(`/api/documents/${doc.id}`).send({ synopsis: 'The hero arrives.' }),
      headers,
    );

    const tree = await request(app)
      .get(`/api/projects/${project.id}/documents`)
      .set(headers);
    const found = tree.body.find((d) => d.id === doc.id);
    expect(found.synopsis).toBe('The hero arrives.');
  });

  it('synopsis can be cleared to an empty string', async () => {
    const { headers } = await makeUser();
    const { doc } = await makeDocInProject(headers);

    await authed(
      request(app).patch(`/api/documents/${doc.id}`).send({ synopsis: 'Initial text.' }),
      headers,
    );

    const res = await authed(
      request(app).patch(`/api/documents/${doc.id}`).send({ synopsis: '' }),
      headers,
    );
    expect(res.status).toBe(200);
    expect(res.body.synopsis).toBe('');
  });
});

// ── POST /api/projects/:projectId/search ─────────────────────────────────────

describe('POST /api/projects/:projectId/search', () => {
  it('returns matches for a term found in project documents', async () => {
    const { headers } = await makeUser();
    const { body: project } = await authed(
      request(app).post('/api/projects').send({ title: 'Search Test' }),
      headers,
    );

    // Write content to the default scaffold scene.
    const tree = await authed(
      request(app).get(`/api/projects/${project.id}/documents`),
      headers,
    );
    const scene = tree.body.find((d) => d.type === 'scene');
    const content = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The wizard cast a spell.' }] }],
    });
    await authed(
      request(app).patch(`/api/documents/${scene.id}/content`).send({ content, word_count: 5 }),
      headers,
    );

    const res = await authed(
      request(app).post(`/api/projects/${project.id}/search`).send({ term: 'wizard' }),
      headers,
    );
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].matches.length).toBeGreaterThan(0);
  });

  it('returns empty results when term is not found', async () => {
    const { headers } = await makeUser();
    const { body: project } = await authed(
      request(app).post('/api/projects').send({ title: 'Empty Search' }),
      headers,
    );

    const res = await authed(
      request(app).post(`/api/projects/${project.id}/search`).send({ term: 'xyznotfound' }),
      headers,
    );
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
  });

  it('returns 400 for an empty search term', async () => {
    const { headers } = await makeUser();
    const { body: project } = await authed(
      request(app).post('/api/projects').send({ title: 'P' }),
      headers,
    );

    const res = await authed(
      request(app).post(`/api/projects/${project.id}/search`).send({ term: '' }),
      headers,
    );
    expect(res.status).toBe(400);
  });

  // security: IDOR — Bob cannot search Alice's project documents
  it("returns 403 when searching another user's project", async () => {
    const a = await makeUser('Alice');
    const b = await makeUser('Bob');

    const { body: project } = await authed(
      request(app).post('/api/projects').send({ title: 'Alice Project' }),
      a.headers,
    );

    const res = await authed(
      request(app).post(`/api/projects/${project.id}/search`).send({ term: 'the' }),
      b.headers,
    );
    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/projects/1/search').send({ term: 'hello' });
    expect(res.status).toBe(401);
  });
});
