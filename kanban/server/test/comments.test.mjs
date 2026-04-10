import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../index.js';
import { initDb, closeDb, createCard, getCards } from '../db/queries.js';

async function startTestServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () =>
      resolve({ server, baseUrl: `http://localhost:${server.address().port}` })
    );
  });
}
function stopServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

describe('POST /api/cards/:id/comments', () => {
  let server, baseUrl, cardId;

  before(async () => {
    initDb(':memory:');
    const card = createCard({ title: 'Test Card' });
    cardId = card.id;
    const app = createApp();
    ({ server, baseUrl } = await startTestServer(app));
  });

  after(async () => {
    await stopServer(server);
    closeDb();
  });

  // Happy path
  it('returns 201 with created comment on valid request', async () => {
    const res = await fetch(`${baseUrl}/api/cards/${cardId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: 'Alice', content: 'Hello' }),
    });
    assert.strictEqual(res.status, 201);
  });

  it('response body has id, card_id, author, content, created_at fields', async () => {
    const res = await fetch(`${baseUrl}/api/cards/${cardId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: 'Bob', content: 'World' }),
    });
    const body = await res.json();
    assert.ok(body.id, 'Expected body.id to exist');
    assert.ok(body.card_id, 'Expected body.card_id to exist');
    assert.strictEqual(body.author, 'Bob');
    assert.strictEqual(body.content, 'World');
    assert.ok(body.created_at, 'Expected body.created_at to exist');
  });

  it('card_id in response matches the :id param', async () => {
    const res = await fetch(`${baseUrl}/api/cards/${cardId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: 'Carol', content: 'Test' }),
    });
    const body = await res.json();
    assert.strictEqual(body.card_id, cardId);
  });

  // Validation: missing fields → 400
  it('returns 400 when author is missing', async () => {
    const res = await fetch(`${baseUrl}/api/cards/${cardId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'No author here' }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('returns 400 when content is missing', async () => {
    const res = await fetch(`${baseUrl}/api/cards/${cardId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: 'Alice' }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('returns 400 when both author and content are missing', async () => {
    const res = await fetch(`${baseUrl}/api/cards/${cardId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 400);
  });

  it('400 response body has "error" field', async () => {
    const res = await fetch(`${baseUrl}/api/cards/${cardId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: 'Alice' }),
    });
    const body = await res.json();
    assert.strictEqual(typeof body.error, 'string');
  });

  // Card not found → 404
  it('returns 404 when card does not exist', async () => {
    const res = await fetch(`${baseUrl}/api/cards/nonexistent-id/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: 'Alice', content: 'Hello' }),
    });
    assert.strictEqual(res.status, 404);
  });

  it('404 response body has "error" field', async () => {
    const res = await fetch(`${baseUrl}/api/cards/nonexistent-id/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: 'Alice', content: 'Hello' }),
    });
    const body = await res.json();
    assert.strictEqual(typeof body.error, 'string');
  });

  // Verify comment appears in card data (task test strategy requirement)
  it('created comment appears in card comments when cards are fetched', async () => {
    const author = 'Dave';
    const content = 'DB check comment';
    await fetch(`${baseUrl}/api/cards/${cardId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author, content }),
    });
    const cards = getCards();
    const card = cards.find(c => c.id === cardId);
    assert.ok(card, 'Card should exist in getCards() result');
    const found = card.comments.find(c => c.author === author && c.content === content);
    assert.ok(found, 'Created comment should appear nested in card.comments');
  });
});
