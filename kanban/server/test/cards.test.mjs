import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createApp } from '../index.js';
import { initDb, closeDb, createCard } from '../db/queries.js';
import { initWs, closeWs } from '../ws/broadcaster.js';

async function startTestServerWithWs(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      initWs(server);
      resolve({ server, baseUrl: `http://localhost:${port}`, wsUrl: `ws://localhost:${port}` });
    });
  });
}

async function stopTestServer(server) {
  await closeWs();
  return new Promise((resolve) => server.close(resolve));
}

function connectWsClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function waitForMessage(ws) {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString())));
  });
}

function closeWsClient(ws) {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    ws.once('close', resolve);
    ws.close();
  });
}

function withTimeout(promise, ms = 500) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)),
  ]);
}

// ---------------------------------------------------------------------------
// Suite 1: POST /api/cards
// ---------------------------------------------------------------------------
describe('POST /api/cards', () => {
  let server, baseUrl, wsUrl;
  before(async () => { initDb(':memory:'); ({ server, baseUrl, wsUrl } = await startTestServerWithWs(createApp())); });
  after(async () => { await stopTestServer(server); closeDb(); });

  it('returns 201 with created card on valid request', async () => {
    const res = await fetch(`${baseUrl}/api/cards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'My Card' }) });
    assert.strictEqual(res.status, 201);
  });

  it('response body has id, title, assignee, column, position, description, created_at', async () => {
    const res = await fetch(`${baseUrl}/api/cards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Full Card', assignee: 'Alice', description: 'Desc' }) });
    const body = await res.json();
    assert.ok(body.id); assert.strictEqual(body.title, 'Full Card'); assert.strictEqual(body.assignee, 'Alice');
    assert.ok(body.column); assert.ok(typeof body.position === 'number'); assert.ok(body.created_at);
  });

  it('returns 400 when title is missing', async () => {
    const res = await fetch(`${baseUrl}/api/cards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    assert.strictEqual(res.status, 400);
  });

  it('400 response body has "error" field', async () => {
    const res = await fetch(`${baseUrl}/api/cards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const body = await res.json();
    assert.strictEqual(typeof body.error, 'string');
  });

  it('broadcasts card:created event after successful creation', async () => {
    const ws = await connectWsClient(wsUrl);
    const msgPromise = waitForMessage(ws);
    await fetch(`${baseUrl}/api/cards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Broadcast Card' }) });
    const msg = await withTimeout(msgPromise);
    assert.strictEqual(msg.event, 'card:created');
    await closeWsClient(ws);
  });

  it('card:created payload matches the created card', async () => {
    const ws = await connectWsClient(wsUrl);
    const msgPromise = waitForMessage(ws);
    const res = await fetch(`${baseUrl}/api/cards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Payload Check' }) });
    const card = await res.json();
    const msg = await withTimeout(msgPromise);
    assert.strictEqual(msg.payload.id, card.id);
    assert.strictEqual(msg.payload.title, 'Payload Check');
    await closeWsClient(ws);
  });

  it('does not broadcast on validation failure (400)', async () => {
    const ws = await connectWsClient(wsUrl);
    const unexpected = [];
    ws.on('message', (d) => unexpected.push(JSON.parse(d.toString())));
    await fetch(`${baseUrl}/api/cards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(unexpected.length, 0);
    await closeWsClient(ws);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: PATCH /api/cards/:id
// ---------------------------------------------------------------------------
describe('PATCH /api/cards/:id', () => {
  let server, baseUrl, wsUrl, cardId;
  before(async () => {
    initDb(':memory:');
    cardId = createCard({ title: 'Original' }).id;
    ({ server, baseUrl, wsUrl } = await startTestServerWithWs(createApp()));
  });
  after(async () => { await stopTestServer(server); closeDb(); });

  it('returns 200 with updated card', async () => {
    const res = await fetch(`${baseUrl}/api/cards/${cardId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Updated' }) });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.title, 'Updated');
  });

  it('returns 404 when card not found', async () => {
    const res = await fetch(`${baseUrl}/api/cards/no-such-id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'X' }) });
    assert.strictEqual(res.status, 404);
  });

  it('404 response body has "error" field', async () => {
    const res = await fetch(`${baseUrl}/api/cards/no-such-id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'X' }) });
    const body = await res.json(); assert.strictEqual(typeof body.error, 'string');
  });

  it('broadcasts card:updated event after successful update', async () => {
    const ws = await connectWsClient(wsUrl);
    const msgPromise = waitForMessage(ws);
    await fetch(`${baseUrl}/api/cards/${cardId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignee: 'Bob' }) });
    const msg = await withTimeout(msgPromise);
    assert.strictEqual(msg.event, 'card:updated');
    await closeWsClient(ws);
  });

  it('card:updated payload contains updated card data', async () => {
    const ws = await connectWsClient(wsUrl);
    const msgPromise = waitForMessage(ws);
    const res = await fetch(`${baseUrl}/api/cards/${cardId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: 'New desc' }) });
    const card = await res.json();
    const msg = await withTimeout(msgPromise);
    assert.strictEqual(msg.payload.id, card.id);
    assert.strictEqual(msg.payload.description, 'New desc');
    await closeWsClient(ws);
  });

  it('does not broadcast when card not found', async () => {
    const ws = await connectWsClient(wsUrl);
    const unexpected = [];
    ws.on('message', (d) => unexpected.push(JSON.parse(d.toString())));
    await fetch(`${baseUrl}/api/cards/no-such-id`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'X' }) });
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(unexpected.length, 0);
    await closeWsClient(ws);
  });

  it('does not broadcast card:updated when body has no recognized fields (no DB write)', async () => {
    // updateCard with no recognized fields returns card unchanged without writing to DB;
    // task requirement: "broadcasts only happen after successful database writes"
    const ws = await connectWsClient(wsUrl);
    const unexpected = [];
    ws.on('message', (d) => unexpected.push(JSON.parse(d.toString())));
    await fetch(`${baseUrl}/api/cards/${cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unknownField: 'value' }),
    });
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(unexpected.length, 0);
    await closeWsClient(ws);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: DELETE /api/cards/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/cards/:id', () => {
  let server, baseUrl, wsUrl;
  before(async () => { initDb(':memory:'); ({ server, baseUrl, wsUrl } = await startTestServerWithWs(createApp())); });
  after(async () => { await stopTestServer(server); closeDb(); });

  it('returns 204 on successful deletion', async () => {
    const { id } = createCard({ title: 'Delete Me' });
    const res = await fetch(`${baseUrl}/api/cards/${id}`, { method: 'DELETE' });
    assert.strictEqual(res.status, 204);
  });

  it('204 response has no body', async () => {
    const { id } = createCard({ title: 'Delete Me 2' });
    const res = await fetch(`${baseUrl}/api/cards/${id}`, { method: 'DELETE' });
    assert.strictEqual(await res.text(), '');
  });

  it('returns 404 when card not found', async () => {
    const res = await fetch(`${baseUrl}/api/cards/no-such-id`, { method: 'DELETE' });
    assert.strictEqual(res.status, 404);
  });

  it('404 response body has "error" field', async () => {
    const res = await fetch(`${baseUrl}/api/cards/no-such-id`, { method: 'DELETE' });
    const body = await res.json(); assert.strictEqual(typeof body.error, 'string');
  });

  it('broadcasts card:deleted event after successful deletion', async () => {
    const { id } = createCard({ title: 'Broadcast Delete' });
    const ws = await connectWsClient(wsUrl);
    const msgPromise = waitForMessage(ws);
    await fetch(`${baseUrl}/api/cards/${id}`, { method: 'DELETE' });
    const msg = await withTimeout(msgPromise);
    assert.strictEqual(msg.event, 'card:deleted');
    await closeWsClient(ws);
  });

  it('card:deleted payload contains the deleted card id', async () => {
    const { id } = createCard({ title: 'Delete Payload' });
    const ws = await connectWsClient(wsUrl);
    const msgPromise = waitForMessage(ws);
    await fetch(`${baseUrl}/api/cards/${id}`, { method: 'DELETE' });
    const msg = await withTimeout(msgPromise);
    assert.strictEqual(msg.payload.id, id);
    await closeWsClient(ws);
  });

  it('does not broadcast when card not found', async () => {
    const ws = await connectWsClient(wsUrl);
    const unexpected = [];
    ws.on('message', (d) => unexpected.push(JSON.parse(d.toString())));
    await fetch(`${baseUrl}/api/cards/no-such-id`, { method: 'DELETE' });
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(unexpected.length, 0);
    await closeWsClient(ws);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: PATCH /api/cards/:id/move
// ---------------------------------------------------------------------------
describe('PATCH /api/cards/:id/move', () => {
  let server, baseUrl, wsUrl;
  before(async () => { initDb(':memory:'); ({ server, baseUrl, wsUrl } = await startTestServerWithWs(createApp())); });
  after(async () => { await stopTestServer(server); closeDb(); });

  it('returns 200 with moved card', async () => {
    const { id } = createCard({ title: 'Move Me', column: 'ready' });
    const res = await fetch(`${baseUrl}/api/cards/${id}/move`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ column: 'done', position: 0 }) });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.column, 'done');
  });

  it('returns 400 when column is missing', async () => {
    const { id } = createCard({ title: 'Move Validation' });
    const res = await fetch(`${baseUrl}/api/cards/${id}/move`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position: 0 }) });
    assert.strictEqual(res.status, 400);
  });

  it('returns 400 when position is missing', async () => {
    const { id } = createCard({ title: 'Move Validation 2' });
    const res = await fetch(`${baseUrl}/api/cards/${id}/move`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ column: 'done' }) });
    assert.strictEqual(res.status, 400);
  });

  it('position: 0 is valid (move to first)', async () => {
    const { id } = createCard({ title: 'Move Zero' });
    const res = await fetch(`${baseUrl}/api/cards/${id}/move`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ column: 'ready', position: 0 }) });
    assert.strictEqual(res.status, 200);
  });

  it('400 response body has "error" field', async () => {
    const { id } = createCard({ title: 'Move Error' });
    const res = await fetch(`${baseUrl}/api/cards/${id}/move`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const body = await res.json(); assert.strictEqual(typeof body.error, 'string');
  });

  it('returns 404 when card not found', async () => {
    const res = await fetch(`${baseUrl}/api/cards/no-such-id/move`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ column: 'done', position: 0 }) });
    assert.strictEqual(res.status, 404);
  });

  it('broadcasts card:moved event after successful move', async () => {
    const { id } = createCard({ title: 'Move Broadcast', column: 'ready' });
    const ws = await connectWsClient(wsUrl);
    const msgPromise = waitForMessage(ws);
    await fetch(`${baseUrl}/api/cards/${id}/move`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ column: 'in_progress', position: 0 }) });
    const msg = await withTimeout(msgPromise);
    assert.strictEqual(msg.event, 'card:moved');
    await closeWsClient(ws);
  });

  it('card:moved payload contains card with updated column', async () => {
    const { id } = createCard({ title: 'Move Payload', column: 'ready' });
    const ws = await connectWsClient(wsUrl);
    const msgPromise = waitForMessage(ws);
    const res = await fetch(`${baseUrl}/api/cards/${id}/move`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ column: 'done', position: 0 }) });
    const card = await res.json();
    const msg = await withTimeout(msgPromise);
    assert.strictEqual(msg.payload.id, card.id);
    assert.strictEqual(msg.payload.column, 'done');
    await closeWsClient(ws);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: POST /api/cards/:id/comments (broadcast)
// ---------------------------------------------------------------------------
describe('POST /api/cards/:id/comments (broadcast)', () => {
  let server, baseUrl, wsUrl, cardId;
  before(async () => {
    initDb(':memory:');
    cardId = createCard({ title: 'Comment Target' }).id;
    ({ server, baseUrl, wsUrl } = await startTestServerWithWs(createApp()));
  });
  after(async () => { await stopTestServer(server); closeDb(); });

  it('broadcasts comment:created event after successful comment creation', async () => {
    const ws = await connectWsClient(wsUrl);
    const msgPromise = waitForMessage(ws);
    await fetch(`${baseUrl}/api/cards/${cardId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: 'Alice', content: 'Hello WS' }) });
    const msg = await withTimeout(msgPromise);
    assert.strictEqual(msg.event, 'comment:created');
    await closeWsClient(ws);
  });

  it('comment:created payload matches created comment with card_id', async () => {
    const ws = await connectWsClient(wsUrl);
    const msgPromise = waitForMessage(ws);
    const res = await fetch(`${baseUrl}/api/cards/${cardId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: 'Bob', content: 'Payload test' }) });
    const comment = await res.json();
    const msg = await withTimeout(msgPromise);
    assert.strictEqual(msg.payload.id, comment.id);
    assert.strictEqual(msg.payload.card_id, cardId);
    assert.strictEqual(msg.payload.author, 'Bob');
    await closeWsClient(ws);
  });

  it('HTTP response is still 201 when no WS clients are connected', async () => {
    // broadcast() safely iterates empty clients Set — try-catch also wraps it defensively
    const res = await fetch(`${baseUrl}/api/cards/${cardId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: 'Carol', content: 'No WS' }) });
    assert.strictEqual(res.status, 201);
  });

  it('does not broadcast on 400 (missing author)', async () => {
    const ws = await connectWsClient(wsUrl);
    const unexpected = [];
    ws.on('message', (d) => unexpected.push(JSON.parse(d.toString())));
    await fetch(`${baseUrl}/api/cards/${cardId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'No author' }) });
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(unexpected.length, 0);
    await closeWsClient(ws);
  });

  it('does not broadcast on 404 (card not found)', async () => {
    const ws = await connectWsClient(wsUrl);
    const unexpected = [];
    ws.on('message', (d) => unexpected.push(JSON.parse(d.toString())));
    await fetch(`${baseUrl}/api/cards/no-such-id/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: 'Alice', content: 'Hello' }) });
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(unexpected.length, 0);
    await closeWsClient(ws);
  });
});
