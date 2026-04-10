import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import { createApp } from '../index.js';
import { initDb, closeDb, createCard } from '../db/queries.js';
// NOTE: initWs is NOT needed — broadcast() safely iterates an empty clients Set
// when initWs has not been called, so no broadcast errors will occur.

let request;
let server;

before(async () => {
  initDb(':memory:');
  const app = createApp();
  await new Promise(resolve => { server = app.listen(0, resolve); });
  request = supertest(server);
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  closeDb();
});

// ─── GET /api/cards ───────────────────────────────────────────────────────────
// ORDER MATTERS: "empty array" test must run before any card is created.
describe('GET /api/cards', () => {
  it('(1st) returns 200 with an empty array when no cards exist', async () => {
    const res = await request.get('/api/cards');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it('(2nd) returns 200 with Content-Type application/json', async () => {
    const res = await request.get('/api/cards');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('application/json'));
  });

  it('(3rd) returns card with comments array after createCard()', async () => {
    createCard({ title: 'Test Card' });
    const res = await request.get('/api/cards');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
    const card = res.body.find(c => c.title === 'Test Card');
    assert.ok(card, 'Test Card should be in the response');
    assert.ok(Array.isArray(card.comments), 'card should have a comments array');
  });
});

// ─── POST /api/cards ──────────────────────────────────────────────────────────
describe('POST /api/cards', () => {
  it('returns 201 with created card on valid request', async () => {
    const res = await request.post('/api/cards').send({ title: 'My Card' });
    assert.equal(res.status, 201);
  });

  it('response body has all required fields', async () => {
    const res = await request.post('/api/cards').send({ title: 'My Card' });
    const body = res.body;
    assert.ok(body.id,          'id should be present');
    assert.ok(body.title,       'title should be present');
    assert.ok('assignee'    in body, 'assignee field should exist');
    assert.ok('column'      in body, 'column field should exist');
    assert.ok('position'    in body, 'position field should exist');
    assert.ok('description' in body, 'description field should exist');
    assert.ok('created_at'  in body, 'created_at field should exist');
  });

  it('returns 400 when title is missing', async () => {
    const res = await request.post('/api/cards').send({});
    assert.equal(res.status, 400);
  });

  it('400 response body has an error string field', async () => {
    const res = await request.post('/api/cards').send({});
    assert.equal(typeof res.body.error, 'string');
  });
});

// ─── PATCH /api/cards/:id ─────────────────────────────────────────────────────
describe('PATCH /api/cards/:id', () => {
  let cardId;

  beforeEach(() => {
    cardId = createCard({ title: 'Original' }).id;
  });

  it('returns 200 with updated card', async () => {
    const res = await request.patch(`/api/cards/${cardId}`).send({ title: 'Updated' });
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'Updated');
  });

  it('returns 404 when card not found', async () => {
    const res = await request.patch('/api/cards/no-such-id').send({ title: 'X' });
    assert.equal(res.status, 404);
  });

  it('404 response body has an error string field', async () => {
    const res = await request.patch('/api/cards/no-such-id').send({ title: 'X' });
    assert.equal(typeof res.body.error, 'string');
  });
});

// ─── DELETE /api/cards/:id ────────────────────────────────────────────────────
describe('DELETE /api/cards/:id', () => {
  let cardId;

  beforeEach(() => {
    cardId = createCard({ title: 'To Delete' }).id;
  });

  it('returns 204 on successful deletion', async () => {
    const res = await request.delete(`/api/cards/${cardId}`);
    assert.equal(res.status, 204);
  });

  it('204 response has no body (empty text)', async () => {
    const res = await request.delete(`/api/cards/${cardId}`);
    assert.equal(res.status, 204);
    assert.equal(res.text, '');
  });

  it('returns 404 when card not found', async () => {
    const res = await request.delete('/api/cards/no-such-id');
    assert.equal(res.status, 404);
  });
});

// ─── PATCH /api/cards/:id/move ────────────────────────────────────────────────
describe('PATCH /api/cards/:id/move', () => {
  let cardId;

  beforeEach(() => {
    cardId = createCard({ column: 'ready', title: 'Movable' }).id;
  });

  it('returns 200 with moved card', async () => {
    const res = await request
      .patch(`/api/cards/${cardId}/move`)
      .send({ column: 'done', position: 0 });
    assert.equal(res.status, 200);
  });

  it('200 response body column reflects the target column value', async () => {
    const res = await request
      .patch(`/api/cards/${cardId}/move`)
      .send({ column: 'done', position: 0 });
    assert.equal(res.body.column, 'done');
  });

  it('returns 400 when column is missing from body', async () => {
    const res = await request
      .patch(`/api/cards/${cardId}/move`)
      .send({ position: 0 });
    assert.equal(res.status, 400);
  });

  it('returns 400 when position is missing from body', async () => {
    const res = await request
      .patch(`/api/cards/${cardId}/move`)
      .send({ column: 'done' });
    assert.equal(res.status, 400);
  });

  it('position: 0 is valid (move to first) — returns 200', async () => {
    const res = await request
      .patch(`/api/cards/${cardId}/move`)
      .send({ column: 'done', position: 0 });
    assert.equal(res.status, 200);
  });

  it('returns 404 when card not found', async () => {
    const res = await request
      .patch('/api/cards/no-such-id/move')
      .send({ column: 'done', position: 0 });
    assert.equal(res.status, 404);
  });
});
