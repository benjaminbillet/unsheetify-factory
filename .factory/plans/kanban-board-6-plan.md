# Task 6: Create REST API Routes for Cards

## Context
The kanban board backend (Express + SQLite) already has a working database layer (`server/db/queries.js`) with fully implemented `getCards()`, `createCard()`, `updateCard()`, and `deleteCard()` functions, along with custom error classes (`NotFoundError`, `DatabaseError`). The server factory (`server/index.js`) exposes `createApp()` with CORS, JSON body parsing, and a global error handler that returns `{ error: string }` with `err.status || err.statusCode || 500`. The `server/api/` directory is empty and ready for route modules. This task wires the DB layer to HTTP by implementing REST routes and mounting them under `/api`.

---

## Files to Create
- `server/api/cards.js` — Express Router with CRUD handlers (routes at `/cards` and `/cards/:id`)
- `server/test/cards.test.mjs` — Integration tests (Node built-in `node:test` + `supertest`)

## Files to Modify
- `server/index.js` — Import and mount the cards router at `/api` (before the 404 handler)
- `server/package.json` — Add `supertest` to `devDependencies`; add `cards.test.mjs` to test script

---

## Mount Path (critical)

The task requires mounting at the `/api` path:

**`server/index.js`**:
```js
app.use('/api', cardsRouter);   // ← mount at /api, NOT /api/cards
```

**`server/api/cards.js`**:
```js
router.get('/cards', ...);      // → GET  /api/cards
router.post('/cards', ...);     // → POST /api/cards
router.patch('/cards/:id', ...);// → PATCH  /api/cards/:id
router.delete('/cards/:id', ...);// → DELETE /api/cards/:id
```

This produces the final URLs `GET /api/cards`, `POST /api/cards`, `PATCH /api/cards/:id`, `DELETE /api/cards/:id`.

---

## TDD Plan

### Subtask 1 — Basic CRUD endpoints

#### 1a. Write tests first (`server/test/cards.test.mjs`)

**Imports and supertest pattern:**
```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../index.js';
import { initDb, closeDb, createCard } from '../db/queries.js';
```

Each `describe` block follows this lifecycle:
```js
let app;
before(() => { initDb(':memory:'); app = createApp(); });
after(() => closeDb());
// tests use: request(app).get('/api/cards')  ← no server.listen() needed
```

**Describe block layout for Subtask 1 — three separate blocks:**

**Block A — `GET /api/cards` (empty DB)**
```js
describe('GET /api/cards', () => {
  let app;
  before(() => { initDb(':memory:'); app = createApp(); });
  after(() => closeDb());

  // tests:
  // - returns 200
  // - returns an array
  // - returns empty array on empty DB
});
```

**Block B — `POST /api/cards` (fresh DB)**
```js
describe('POST /api/cards', () => {
  let app;
  before(() => { initDb(':memory:'); app = createApp(); });
  after(() => closeDb());

  // tests:
  // - returns 201 with valid title
  // - returned body has id, title, column, position, created_at fields
  // - returned body.comments is an empty array
});
```

**Block C — `PATCH and DELETE /api/cards/:id` (pre-seeded DB)**
```js
describe('PATCH and DELETE /api/cards/:id', () => {
  let app, existingCard;
  before(() => {
    initDb(':memory:');
    app = createApp();
    existingCard = createCard({ title: 'Seed card' }); // ← pre-create for happy-path tests
  });
  after(() => closeDb());

  // tests:
  // - PATCH returns 200 with updated card
  // - PATCH updated card reflects new title in response
  // - DELETE returns 204
  // - DELETE response body is empty
});
```

#### 1b. Implement `server/api/cards.js` (skeleton without validation)

```js
import { Router } from 'express';
import { getCards, createCard, updateCard, deleteCard, NotFoundError }
  from '../db/queries.js';

const router = Router();

router.get('/cards', (req, res, next) => { ... });
router.post('/cards', (req, res, next) => { ... });
router.patch('/cards/:id', (req, res, next) => { ... });
router.delete('/cards/:id', (req, res, next) => { ... });

export default router;
```

#### 1c. Mount router in `server/index.js`

Add import and mount **after** `app.use(express.json())` and **before** the 404 handler:
```js
import cardsRouter from './api/cards.js';
// inside createApp():
app.use('/api', cardsRouter);
```

---

### Subtask 2 — Input validation

#### 2a. Write failing tests (new describe block in cards.test.mjs)

**Block D — `POST /api/cards validation` (fresh DB)**
```js
describe('POST /api/cards validation', () => {
  let app;
  before(() => { initDb(':memory:'); app = createApp(); });
  after(() => closeDb());

  // tests:
  // - POST without body returns 400
  // - POST with missing title field returns 400
  // - POST with empty string title ("") returns 400
  // - POST with whitespace-only title ("   ") returns 400
  // - 400 response body has { error: string } field
});
```

#### 2b. Add validation to POST handler

Manual validation in the `router.post('/cards', ...)` route:
```js
const { title, assignee, column, description } = req.body ?? {};
if (!title || typeof title !== 'string' || title.trim() === '') {
  return res.status(400).json({ error: 'title is required' });
}
```

---

### Subtask 3 — DB integration

#### 3a. Write failing tests (new describe blocks in cards.test.mjs)

**Block E — `GET /api/cards DB integration` (pre-seeded DB)**
```js
describe('GET /api/cards DB integration', () => {
  let app;
  before(() => {
    initDb(':memory:');
    app = createApp();
    createCard({ title: 'Pre-seeded card' }); // ← verify GET returns this
  });
  after(() => closeDb());

  // tests:
  // - returns the pre-seeded card
  // - each card has a comments array
});
```

**Block F — `POST /api/cards DB persistence` (fresh DB)**
```js
describe('POST /api/cards DB persistence', () => {
  let app;
  before(() => { initDb(':memory:'); app = createApp(); });
  after(() => closeDb());

  // tests (sequential within the block):
  // - POST creates card; subsequent GET returns that card
  // - POST-created card has correct title
});
```

**Block G — `PATCH/DELETE 404 for unknown IDs` (fresh DB)**
```js
describe('PATCH and DELETE 404 for unknown IDs', () => {
  let app;
  before(() => { initDb(':memory:'); app = createApp(); });
  after(() => closeDb());

  // tests:
  // - PATCH /api/cards/nonexistent-id returns 404
  // - DELETE /api/cards/nonexistent-id returns 404
});
```

**Block H — `PATCH/DELETE happy path` (pre-seeded DB)**
```js
describe('PATCH and DELETE happy path', () => {
  let app, card;
  before(() => {
    initDb(':memory:');
    app = createApp();
    card = createCard({ title: 'Original title' });
  });
  after(() => closeDb());

  // tests:
  // - PATCH updates title; response body has new title
  // - DELETE removes card; subsequent GET does not include it
});
```

#### 3b. Wire up error handling in PATCH and DELETE handlers

```js
} catch (err) {
  if (err instanceof NotFoundError) {
    return res.status(404).json({ error: err.message });
  }
  next(err); // passes 500-class errors to global error handler
}
```

---

### Subtask 4 — Proper HTTP status codes & error response format

#### 4a. Write failing tests (new describe block)

**Block I — `Error response format` (fresh DB)**
```js
describe('Error response format', () => {
  let app;
  before(() => { initDb(':memory:'); app = createApp(); });
  after(() => closeDb());

  // tests:
  // - PATCH unknown ID: response has Content-Type application/json
  // - DELETE unknown ID: response has Content-Type application/json
  // - 404 response body is { error: string }
  // - 400 response body is { error: string }
});
```

#### 4b. Verify consistency

- All error responses use `{ error: '<message>' }` (consistent with existing global handler in `index.js`)
- 400 for validation failures (missing/empty title)
- 404 for `NotFoundError` caught in route handlers
- 500 for unexpected errors forwarded via `next(err)` to global error handler

---

## Complete Implementation

### `server/api/cards.js`

```js
import { Router } from 'express';
import { getCards, createCard, updateCard, deleteCard, NotFoundError }
  from '../db/queries.js';

const router = Router();

// GET /api/cards
router.get('/cards', (req, res, next) => {
  try {
    res.json(getCards());
  } catch (err) { next(err); }
});

// POST /api/cards
router.post('/cards', (req, res, next) => {
  try {
    const { title, assignee, column, description } = req.body ?? {};
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'title is required' });
    }
    const card = createCard({ title: title.trim(), assignee, column, description });
    // createCard() returns a raw DB row without comments; add comments: [] for
    // a consistent response shape with GET /api/cards (which uses getCards()).
    res.status(201).json({ ...card, comments: [] });
  } catch (err) { next(err); }
});

// PATCH /api/cards/:id
router.patch('/cards/:id', (req, res, next) => {
  try {
    const card = updateCard(req.params.id, req.body ?? {});
    res.json(card);
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    next(err);
  }
});

// DELETE /api/cards/:id
router.delete('/cards/:id', (req, res, next) => {
  try {
    deleteCard(req.params.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    next(err);
  }
});

export default router;
```

### `server/index.js` changes

```js
// Add import near top (after existing imports):
import cardsRouter from './api/cards.js';

// Add inside createApp(), after app.use(express.json()) and before the 404 handler:
app.use('/api', cardsRouter);
```

### `server/package.json` changes

Add `supertest` to `devDependencies`:
```json
"devDependencies": {
  "nodemon": "^3.1.0",
  "supertest": "^7.0.0"
}
```

Update the `test` script to include the new test file:
```json
"test": "node --test test/server.test.mjs test/db.test.mjs test/cards.test.mjs"
```

---

## Critical Files

| File | Action | Purpose |
|------|--------|---------|
| `server/api/cards.js` | **Create** | Express Router — routes at `/cards` and `/cards/:id` |
| `server/test/cards.test.mjs` | **Create** | Integration tests (9 describe blocks, ~25 test cases) |
| `server/index.js` | **Modify** | `app.use('/api', cardsRouter)` before 404 handler |
| `server/package.json` | **Modify** | Add supertest dev dep; extend test script |

## Reusable Utilities (from `server/db/queries.js`)

- `getCards()` — returns all cards with nested `comments` array
- `createCard(data)` — `{ title, assignee?, column?, description? }` → raw card row (no `comments` field — POST handler adds `comments: []` manually)
- `updateCard(id, data)` — partial update, throws `NotFoundError` if card absent
- `deleteCard(id)` — throws `NotFoundError` if card absent, returns `true`
- `NotFoundError` — use `instanceof` check in catch blocks to return 404
- `initDb(':memory:')` / `closeDb()` — test DB lifecycle (module-level singleton)

---

## Verification

### Run tests
```bash
cd server && npm install   # picks up supertest
npm test                   # runs all 3 test files
```
All three files must pass: `server.test.mjs`, `db.test.mjs`, `cards.test.mjs`

### Manual smoke test (server running)
```bash
cd server && npm run dev

# GET — should return []
curl http://localhost:3001/api/cards

# POST — should return 201 with card object
curl -X POST http://localhost:3001/api/cards \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test card"}'

# POST without title — should return 400
curl -X POST http://localhost:3001/api/cards \
  -H 'Content-Type: application/json' \
  -d '{}'

# PATCH unknown ID — should return 404
curl -X PATCH http://localhost:3001/api/cards/nonexistent \
  -H 'Content-Type: application/json' \
  -d '{"title":"Updated"}'

# DELETE unknown ID — should return 404
curl -X DELETE http://localhost:3001/api/cards/nonexistent
```
