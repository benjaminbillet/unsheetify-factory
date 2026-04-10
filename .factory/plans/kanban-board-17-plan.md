# Plan: Add WebSocket Event Broadcasting to API Routes (Task #17)

## Context

The kanban board server already has a WebSocket broadcaster (`server/ws/broadcaster.js`) with a `broadcast(event, payload)` function implemented in task #16. The goal is to wire this broadcaster into the card and comment HTTP route handlers so that all clients receive real-time events whenever a card or comment is mutated. This task also requires creating the `cards.js` route file, which does not exist yet.

Strict TDD is required: write failing tests first, then implement to make them pass.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `server/test/cards.test.mjs` | **CREATE** — new test file covering card endpoints + all broadcast assertions |
| `server/api/cards.js` | **CREATE** — new Express router for card CRUD + move endpoints with broadcast calls |
| `server/api/comments.js` | **MODIFY** — add `broadcast('comment:created', comment)` after successful creation |
| `server/index.js` | **MODIFY** — import and mount `cardsRouter` under `/api` |
| `server/package.json` | **MODIFY** — add `test/cards.test.mjs` to the test script |

All paths relative to: `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-17/kanban/server/`

---

## Key Reusable Code (Do Not Reinvent)

- `broadcast(event, payload)` — exported from `../ws/broadcaster.js`; synchronous; already handles per-client send errors internally; safe to call when no clients are connected
- `initWs(server)`, `closeWs()` — from `../ws/broadcaster.js`; needed in test lifecycle
- `createCard`, `updateCard`, `deleteCard`, `moveCard`, `createComment` — from `../db/queries.js`
- `NotFoundError`, `ForeignKeyError` — from `../db/queries.js`; used for 404 responses
- `createApp()` — from `../index.js`; returns Express app without WebSocket

---

## Step-by-Step TDD Execution

### Step 1 — Write `server/test/cards.test.mjs` (RED)

Create this file with all tests. They will all fail (routes 404, broadcasts never arrive) until implementation is done.

**Imports and shared helpers:**

```javascript
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
```

**IMPORTANT pattern:** Always register `waitForMessage(ws)` *before* dispatching the `fetch()` call — the broadcast arrives asynchronously and the listener must be in place first.

---

**Test Suite 1 — `POST /api/cards`:**

```javascript
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
```

**Test Suite 2 — `PATCH /api/cards/:id`:**

```javascript
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
```

**Test Suite 3 — `DELETE /api/cards/:id`:**

```javascript
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
```

**Test Suite 4 — `PATCH /api/cards/:id/move`:**

```javascript
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
```

**Test Suite 5 — `POST /api/cards/:id/comments` broadcast (in `cards.test.mjs`):**

```javascript
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
```

---

### Step 2 — Confirm RED

Run `node --test test/cards.test.mjs` from `server/` directory.

Expected: all tests fail (404s for card endpoints; timeouts on broadcast tests).

---

### Step 3 — Create `server/api/cards.js` (GREEN for subtask 1)

```javascript
import { Router } from 'express';
import { createCard, updateCard, deleteCard, moveCard, NotFoundError } from '../db/queries.js';
import { broadcast } from '../ws/broadcaster.js';

const router = Router();

// POST /api/cards
router.post('/cards', (req, res, next) => {
  const { title, assignee, column, description } = req.body ?? {};
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }
  try {
    const card = createCard({ title, assignee, column, description });
    try { broadcast('card:created', card); } catch { /* isolate broadcast errors */ }
    return res.status(201).json(card);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/cards/:id
const CARD_UPDATE_ALLOWED = ['title', 'assignee', 'column', 'description', 'position'];
router.patch('/cards/:id', (req, res, next) => {
  const updateData = req.body ?? {};
  try {
    const card = updateCard(req.params.id, updateData);
    // Only broadcast when at least one recognized field was in the request body,
    // meaning updateCard actually performed a DB write. An empty or unrecognized-only
    // body causes updateCard to return the card unchanged (no DB write), so no broadcast.
    if (Object.keys(updateData).some(k => CARD_UPDATE_ALLOWED.includes(k))) {
      try { broadcast('card:updated', card); } catch { /* isolate broadcast errors */ }
    }
    return res.status(200).json(card);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

// DELETE /api/cards/:id
router.delete('/cards/:id', (req, res, next) => {
  try {
    deleteCard(req.params.id);
    try { broadcast('card:deleted', { id: req.params.id }); } catch { /* isolate */ }
    return res.status(204).send();
  } catch (err) {
    if (err instanceof NotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

// PATCH /api/cards/:id/move
router.patch('/cards/:id/move', (req, res, next) => {
  const { column, position } = req.body ?? {};
  if (!column || position === undefined || position === null) {
    return res.status(400).json({ error: 'column and position are required' });
  }
  try {
    const card = moveCard(req.params.id, column, position);
    try { broadcast('card:moved', card); } catch { /* isolate */ }
    return res.status(200).json(card);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

export default router;
```

**Key design decisions:**
- `position === undefined || position === null` check allows `position: 0` (move to first position) — do NOT use `!position`
- Inner `try { broadcast(...) } catch {}` is defensive; `broadcast()` itself already isolates per-client errors, but outer try-catch guards against any unexpected throw from the broadcaster
- Route `PATCH /cards/:id/move` does not conflict with `PATCH /cards/:id` because Express correctly treats `/move` as a literal path segment, not matched by `:id` in the parent route
- `PATCH /cards/:id` only broadcasts when the body contains at least one recognized field (`CARD_UPDATE_ALLOWED`). When `updateCard` is called with no recognized fields it returns the existing card without writing to the DB — the task requirement "broadcasts only happen after successful database writes" forbids broadcasting in that case

---

### Step 4 — Update `server/api/comments.js` (GREEN for subtask 2)

Add one import line and one broadcast call:

```javascript
import { Router } from 'express';
import { createComment, ForeignKeyError } from '../db/queries.js';
import { broadcast } from '../ws/broadcaster.js';   // ADD THIS LINE

const router = Router();

router.post('/cards/:id/comments', (req, res, next) => {
  const { author, content } = req.body ?? {};

  if (!author || !content) {
    return res.status(400).json({ error: 'author and content are required' });
  }

  try {
    const comment = createComment(req.params.id, { author, content });
    try { broadcast('comment:created', comment); } catch { /* isolate broadcast errors */ }   // ADD THIS LINE
    return res.status(201).json(comment);
  } catch (err) {
    if (err instanceof ForeignKeyError) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

export default router;
```

The existing `comments.test.mjs` tests remain green because `broadcast()` safely no-ops when no WS clients are connected (tests use bare `createApp()` without `initWs`).

---

### Step 5 — Update `server/index.js`

Add two lines — import and mount:

```javascript
// After existing: import commentsRouter from './api/comments.js';
import cardsRouter from './api/cards.js';

// In createApp(), after: app.use('/api', commentsRouter);
app.use('/api', cardsRouter);
```

---

### Step 6 — Update `server/package.json` test script

```json
"test": "node --test test/server.test.mjs test/db.test.mjs test/comments.test.mjs test/ws.test.mjs test/cards.test.mjs"
```

`cards.test.mjs` goes last to avoid WebSocket singleton state leaking into `ws.test.mjs`.

---

## Verification

Run the full test suite from `server/`:

```bash
cd /Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-17/kanban/server
node --test test/server.test.mjs test/db.test.mjs test/comments.test.mjs test/ws.test.mjs test/cards.test.mjs
```

Expected: all tests pass with 0 failures. Specifically:
- `comments.test.mjs` — all 9 existing HTTP tests still pass (broadcast is a no-op with no WS clients)
- `ws.test.mjs` — all existing broadcaster tests still pass (no changes to `broadcaster.js`)
- `cards.test.mjs` — all new tests pass, including:
  - HTTP 201/200/204/400/404 responses for each endpoint
  - `card:created`, `card:updated`, `card:deleted`, `card:moved`, `comment:created` WS events fired with correct payloads
  - No broadcast on validation errors (400) or not-found errors (404)
  - API returns success even with no WS clients connected (resilience)
