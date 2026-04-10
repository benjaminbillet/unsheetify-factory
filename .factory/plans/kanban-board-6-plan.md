# Plan: Create REST API Routes for Cards (Task 6)

## Context

This task implements Express REST API routes for card CRUD operations on a kanban board server. The server uses Express + better-sqlite3 + WebSocket broadcasts. After exploring the codebase, **all implementation files already exist and appear complete**:

- `server/api/cards.js` — full Express router (GET, POST, PATCH, DELETE, PATCH/move)
- `server/api/cards.test.js` — 19 supertest integration tests
- `server/test/cards.test.mjs` — 25+ broader integration tests (with WS broadcast assertions)
- `server/index.js` — already mounts cardsRouter at `/api`
- `server/db/queries.js` — `getCards`, `createCard`, `updateCard`, `deleteCard`, `moveCard`, `NotFoundError`

The agent must follow TDD: **run tests first**, confirm green state, and fix anything that fails before marking subtasks complete.

---

## Critical Files

| File | Role |
|------|------|
| `server/api/cards.js` | Express router — primary implementation target |
| `server/api/cards.test.js` | Supertest integration tests (run with `npm run test:integration`) |
| `server/test/cards.test.mjs` | Broader integration tests incl. WS (run with `npm test`) |
| `server/index.js` | Mounts routers, defines `createApp()` |
| `server/db/queries.js` | DB functions: `getCards`, `createCard`, `updateCard`, `deleteCard`, `moveCard`, `NotFoundError` |
| `server/package.json` | Test scripts |

---

## TDD Execution Plan

### Subtask 1 — Basic CRUD Endpoints

**Red phase: Identify expected tests**

Tests already exist in `server/api/cards.test.js`:
- `GET /api/cards` → 200 + empty array, `application/json` header, returns cards with `comments[]`
- `POST /api/cards` → 201 + card body (id, title, assignee, column, position, description, created_at)
- `PATCH /api/cards/:id` → 200 + updated card
- `DELETE /api/cards/:id` → 204 + empty body

**Green phase: Run and verify**

```bash
cd server && npm run test:integration
```

**Expected implementation** (already in `server/api/cards.js`):
```js
router.get('/cards', (_req, res, next) => { /* calls getCards() */ });
router.post('/cards', (req, res, next) => { /* calls createCard() */ });
router.patch('/cards/:id', (req, res, next) => { /* calls updateCard() */ });
router.delete('/cards/:id', (req, res, next) => { /* calls deleteCard() */ });
```

**If tests fail:** The router in `server/api/cards.js` must export `default router` and `server/index.js` must mount it with `app.use('/api', cardsRouter)`. Both already exist — check import paths and ESM syntax.

---

### Subtask 2 — Input Validation Middleware

**Red phase tests** (in `server/api/cards.test.js`):
- `POST /api/cards` with `{}` → 400 with `{ error: string }`
- `PATCH /api/cards/:id/move` missing `column` → 400
- `PATCH /api/cards/:id/move` missing `position` → 400
- `PATCH /api/cards/:id/move` with `position: 0` → 200 (falsy-safe check)

**Implementation** (already in `server/api/cards.js`):
```js
// POST validation
if (!title) return res.status(400).json({ error: 'title is required' });

// PATCH /move validation  
if (!column || position === undefined || position === null)
  return res.status(400).json({ error: 'column and position are required' });
```

Note: Manual validation used (no `express-validator` needed). The position check uses `=== undefined || === null` (not falsy) to allow `position: 0`.

**Run subtask 2 tests:**
```bash
cd server && npm run test:integration
```

---

### Subtask 3 — Database Integration

**Red phase tests** (in `server/api/cards.test.js` + `server/test/cards.test.mjs`):
- POST creates card persisted in DB (card appears in subsequent GET)
- PATCH updates DB record (updated title returned in response)
- DELETE removes card (subsequent operations return 404)
- DB initialized with `:memory:` in tests for isolation

**Implementation** (already in `server/api/cards.js`):
```js
import { getCards, createCard, updateCard, deleteCard, moveCard, NotFoundError }
  from '../db/queries.js';
```

Tests use in-process DB with `initDb(':memory:')` before each suite. The `createApp()` factory creates the app without binding DB — DB is initialized separately in `before()` hook.

**Run broader integration tests:**
```bash
cd server && npm test
```

---

### Subtask 4 — HTTP Status Codes and Error Responses

**Red phase tests** (in `server/api/cards.test.js`):
- `PATCH /api/cards/no-such-id` → 404 + `{ error: string }`
- `DELETE /api/cards/no-such-id` → 404 + `{ error: string }`
- `POST /api/cards` with `{}` → 400 + `{ error: string }`
- Server errors → 500 (via Express error handler in `server/index.js`)

**Implementation** (already in `server/api/cards.js`):
```js
// NotFoundError → 404
} catch (err) {
  if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
  next(err); // all other errors → 500 via error handler
}
```

**Error handler** (already in `server/index.js`):
```js
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});
```

**Router mounting** (already in `server/index.js`):
```js
app.use('/api', commentsRouter);
app.use('/api', cardsRouter);
```

**Run full test suite:**
```bash
cd server && npm run test:all
```

---

## Execution Order (Agent Steps)

1. **Run integration tests** to establish current baseline:
   ```bash
   cd server && npm run test:integration 2>&1
   ```

2. **Run full test suite** to check all test files:
   ```bash
   cd server && npm run test:all 2>&1
   ```

3. **If all tests pass** → implementation is complete; verify subtask requirements are fully satisfied.

4. **If any test fails**, follow TDD for that specific failing test:
   a. Read the failing test carefully
   b. Identify what the implementation is missing or wrong
   c. Fix the minimum code in `server/api/cards.js` or `server/index.js` to make it pass
   d. Re-run tests to confirm green

5. **Run coverage check** to confirm thresholds are met (70% lines, 80% functions):
   ```bash
   cd server && npm run test:coverage 2>&1
   ```

---

## Verification

End-to-end verification:

```bash
# 1. Unit integration tests (supertest)
cd server && npm run test:integration

# 2. Full test suite (includes WS broadcast tests)
cd server && npm run test:all

# 3. Optional: coverage report
cd server && npm run test:coverage
```

All 19 tests in `api/cards.test.js` and all tests in `test/cards.test.mjs` must pass green.

**Expected passing tests per endpoint:**

| Endpoint | Tests | Expected |
|----------|-------|----------|
| GET /api/cards | 3 | 200, application/json, cards with comments |
| POST /api/cards | 4 | 201, field shape, 400 missing title, error string |
| PATCH /api/cards/:id | 3 | 200 updated, 404 not found, error string |
| DELETE /api/cards/:id | 3 | 204, empty body, 404 not found |
| PATCH /api/cards/:id/move | 6 | 200, column value, 400 col missing, 400 pos missing, pos:0 valid, 404 |
