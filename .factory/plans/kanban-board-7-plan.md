# Plan: Create REST API Routes for Comments (Task 7)

## Context

The Kanban board backend has a fully-implemented database layer (`server/db/queries.js`) with `createComment(cardId, data)` and custom error classes (`ForeignKeyError`, `NotFoundError`, `DatabaseError`), but no HTTP API routes yet. The `server/api/` directory exists but is empty. This task wires the existing DB function into an Express router and mounts it on the main app, following TDD (tests written first, failing, then made green).

---

## Critical Files

| File | Action |
|------|--------|
| `server/test/comments.test.mjs` | **Create** — integration tests (write first, RED) |
| `server/api/comments.js` | **Create** — Express router implementation |
| `server/index.js` | **Modify** — add import + `app.use('/api', commentsRouter)` |
| `server/package.json` | **Modify** — add `comments.test.mjs` to test script |

**Reference only (no changes):**
- `server/db/queries.js` — provides `createComment`, `ForeignKeyError`, `initDb`, `closeDb`, `createCard`, `getCards`
- `server/test/server.test.mjs` — test pattern to follow (startTestServer, stopServer helpers)

---

## Subtask 1: Write Failing Tests (RED)

### Create `server/test/comments.test.mjs`

Pattern: mirrors `server/test/server.test.mjs`. Use `describe`/`it`/`before`/`after` from `node:test`. Call `initDb(':memory:')` before `createApp()` in the `before` hook (DB singleton must be ready before requests hit the handler). Create a real card in `before` to use its ID in happy-path tests.

```javascript
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
```

**Verify RED:** Run `node --test test/comments.test.mjs` from `server/` — all tests should fail with "Cannot find module" or route-not-found errors.

---

## Subtask 2: Implement Router (GREEN)

### Create `server/api/comments.js`

```javascript
import { Router } from 'express';
import { createComment, ForeignKeyError } from '../db/queries.js';

const router = Router();

router.post('/cards/:id/comments', (req, res, next) => {
  const { author, content } = req.body ?? {};

  if (!author || !content) {
    return res.status(400).json({ error: 'author and content are required' });
  }

  try {
    const comment = createComment(req.params.id, { author, content });
    return res.status(201).json(comment);
  } catch (err) {
    if (err instanceof ForeignKeyError) {
      return res.status(404).json({ error: err.message });
    }
    next(err); // passes to Express error handler → 500
  }
});

export default router;
```

**Design rationale:**
- Validation (`!author || !content`) runs before any DB call — cheap and catches empty strings too.
- Card existence is checked implicitly via `ForeignKeyError` thrown by `createComment` — race-condition-safe and avoids a redundant `getCards()` full scan.
- Non-FK errors propagate to the existing `index.js` error handler via `next(err)`.
- Router uses prefix-less paths (`/cards/:id/comments`) because it will be mounted at `/api`.

### Modify `server/index.js`

Add import at top and mount inside `createApp()` before the 404 handler:

**At top of file (after existing imports):**
```javascript
import commentsRouter from './api/comments.js';
```

**Inside `createApp()`, after `app.use(express.json())` and before `app.get('/health', ...)`:**
```javascript
app.use('/api', commentsRouter);
```

Exact insertion point in `index.js` — after line 19 (`app.use(express.json());`):
```javascript
  app.use(express.json());

  // ── API Routes ────────────────────────────────────────────────────────────
  app.use('/api', commentsRouter);

  // ── Routes ────────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => res.json({ ok: true }));
```

**Verify GREEN:** Run `node --test test/comments.test.mjs` from `server/` — all tests should pass.

---

## Subtask 3: Wire Up Test Script and Final Verification

### Modify `server/package.json`

Update the `test` script to include the new test file:

```json
"test": "node --test test/server.test.mjs test/db.test.mjs test/comments.test.mjs"
```

**Verify full suite:** Run `npm test` from `server/` — all three test files should pass.

---

## TDD Execution Order

```
1. [RED]    Create server/test/comments.test.mjs with all test cases
2.          Run: node --test test/comments.test.mjs  →  all fail (route doesn't exist)
3. [GREEN]  Create server/api/comments.js with the POST handler
4. [GREEN]  Modify server/index.js: add import + app.use('/api', commentsRouter)
5.          Run: node --test test/comments.test.mjs  →  all pass
6. [WIRE]   Update server/package.json test script to include comments.test.mjs
7.          Run: npm test (from server/)  →  all 3 test files pass
```

---

## Verification

1. `node --test test/comments.test.mjs` — all comments integration tests pass
2. `npm test` (from `server/`) — full test suite (server + db + comments) passes
3. Manual smoke test: `curl -X POST http://localhost:3001/api/cards/<valid-id>/comments -H 'Content-Type: application/json' -d '{"author":"Alice","content":"Hello"}'` returns 201 with comment object
