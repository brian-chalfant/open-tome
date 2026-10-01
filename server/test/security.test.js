import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createTestDb } from './helpers/createTestDb.js';

process.env.NODE_ENV       = 'test';
process.env.ALLOWED_ORIGIN = 'http://localhost:5173';

const { Pool } = createTestDb();
const { initDb } = await import('../src/db/migrate.js');
await initDb(new Pool());

const { app, server } = await import('../src/index.js');
const { default: request } = await import('supertest');
const { default: WebSocket } = await import('ws');
const { getDb } = await import('../src/db/migrate.js');
const { makeTestUser } = await import('./helpers/makeTestUser.js');

let port;
beforeAll(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
afterAll(() => server.close());

let _seq = 0;
const makeUser = (name = 'User') => makeTestUser(getDb(), name, `sec-${++_seq}`);

async function makeProject(headers, title = 'Novel') {
  const res = await request(app).post('/api/projects').set(headers).send({ title });
  return res.body;
}

async function makeDoc(headers, projectId, body = {}) {
  const res = await request(app)
    .post(`/api/projects/${projectId}/documents`).set(headers).send({ title: 'Doc', ...body });
  return res.body;
}

function openSocket(userId, origin) {
  const headers = { cookie: `x-test-user-id=${userId}` };
  if (origin) headers.origin = origin;
  return new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
}

describe('WebSocket hardening', () => {
  it('survives non-object JSON messages and keeps serving saves', async () => {
    const { user, headers } = await makeUser();
    const project = await makeProject(headers);
    const doc = await makeDoc(headers, project.id);

    const ws = openSocket(user.id, 'http://localhost:5173');
    await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });

    for (const frame of ['null', '42', '"str"', '[]']) ws.send(frame);

    const ack = new Promise((resolve) => ws.on('message', (d) => {
      const msg = JSON.parse(d.toString());
      if (msg.type === 'ack') resolve(msg);
    }));
    ws.send(JSON.stringify({ type: 'save', documentId: doc.id, content: null, wordCount: 1e12 }));
    expect((await ack).documentId).toBe(doc.id);
    ws.close();

    const res = await request(app).get(`/api/documents/${doc.id}/content`).set(headers);
    expect(res.body.word_count).toBe(10_000_000);
  });

  it('rejects upgrades from a foreign Origin', async () => {
    const { user } = await makeUser();
    const ws = openSocket(user.id, 'https://evil.example');
    const status = await new Promise((resolve) => {
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode));
      ws.on('error', () => resolve('error'));
    });
    expect(status).toBe(403);
  });
});

describe('PATCH /api/documents/:id — cross-tenant references', () => {
  it("rejects another user's label_id and status_id", async () => {
    const alice = await makeUser('Alice');
    const bob   = await makeUser('Bob');
    const aProj = await makeProject(alice.headers);
    const bProj = await makeProject(bob.headers);
    const bDoc  = await makeDoc(bob.headers, bProj.id);

    const label = (await request(app).post(`/api/projects/${aProj.id}/labels`)
      .set(alice.headers).send({ name: 'Secret', color: '#123456' })).body;
    const [status] = (await request(app).get(`/api/projects/${aProj.id}/statuses`).set(alice.headers)).body;

    const r1 = await request(app).patch(`/api/documents/${bDoc.id}`).set(bob.headers).send({ label_id: label.id });
    expect(r1.status).toBe(400);
    const r2 = await request(app).patch(`/api/documents/${bDoc.id}`).set(bob.headers).send({ status_id: status.id });
    expect(r2.status).toBe(400);
  });

  it('accepts a label from the same project', async () => {
    const { headers } = await makeUser();
    const proj  = await makeProject(headers);
    const doc   = await makeDoc(headers, proj.id);
    const label = (await request(app).post(`/api/projects/${proj.id}/labels`)
      .set(headers).send({ name: 'Mine', color: '#123456' })).body;
    const res = await request(app).patch(`/api/documents/${doc.id}`).set(headers).send({ label_id: label.id });
    expect(res.status).toBe(200);
    expect(res.body.label_id).toBe(label.id);
  });
});

describe('PATCH /api/documents/:id — parent cycles', () => {
  it('rejects making a document its own parent or a child of its descendant', async () => {
    const { headers } = await makeUser();
    const proj   = await makeProject(headers);
    const parent = await makeDoc(headers, proj.id, { type: 'folder' });
    const child  = await makeDoc(headers, proj.id, { parent_id: parent.id });

    const self = await request(app).patch(`/api/documents/${parent.id}`).set(headers).send({ parent_id: parent.id });
    expect(self.status).toBe(400);
    const loop = await request(app).patch(`/api/documents/${parent.id}`).set(headers).send({ parent_id: child.id });
    expect(loop.status).toBe(400);
  });
});

describe('Out-of-range integers', () => {
  it('rejects an import with sort_order beyond int32 instead of crashing', async () => {
    const { headers } = await makeUser();
    const res = await request(app).post('/api/projects/import').set(headers).send({
      version: 1,
      app: 'open-tome',
      project: {
        title: 'Imported',
        documents: [{ clientId: 1, parentClientId: null, title: 'A', type: 'scene', sort_order: 1e12 }],
      },
    });
    expect(res.status).toBe(400);
  });
});
