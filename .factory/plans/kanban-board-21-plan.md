# Task 21: Add Comprehensive Test Suite

## Context

The Kanban board project already has substantial test infrastructure:
- **Server** (`server/test/*.test.mjs`): 5 test files using Node.js native `node:test` covering server middleware, DB queries, cards API (POST/PATCH/DELETE/move + WebSocket broadcasts), comments API, and WebSocket broadcasts.
- **Client** (`client/src/**/*.test.{js,jsx}`): 10+ test files using Vitest + React Testing Library covering all hooks (101 tests in `useBoard.test.js`), API client, and all components.

**Missing pieces that must be added:**
1. `server/db/queries.test.js` — test file at the exact task-specified path
2. `server/api/cards.test.js` — test file at the exact task-specified path (with supertest)
3. `GET /api/cards` REST route — **critically missing from the server** (the client calls it; the route doesn't exist in `server/api/cards.js`)
4. Playwright E2E infrastructure (`playwright.config.mjs`, `e2e/board.spec.js`)
5. Coverage configuration (c8 for server, @vitest/coverage-v8 for client)
6. Updated package.json test scripts

**Framework Decision** (important for implementing LLM):
- **Client**: Vitest is already installed and provides a Jest-compatible API. It satisfies the task's "Jest for React hooks" requirement. No additional Jest installation is needed on the client side.
- **Server**: The server is pure ESM (`"type": "module"`). Adding Jest to ESM requires `--experimental-vm-modules` and creates compatibility issues with native addons (`better-sqlite3`). The project already uses native `node:test` for all 5 server test files. **Use native `node:test` + `supertest` for the new server test files** — consistent with existing infrastructure, no ESM incompatibility. Do NOT install Jest for the server.
- **E2E**: Playwright (`@playwright/test`).
- **No `jest.config.js` is needed** — Vitest is configured inside `client/vite.config.js`.

**Known UI limitation**: `Board.jsx` does not implement drag-and-drop or any UI mechanism to move cards between columns (it doesn't even destructure `moveCard` from `useBoard()`). E2E tests must not include a "move card" test.

---

## Files to Create

### 1. `server/db/queries.test.js`
New unit test file at the exact specified path using native `node:test`. This is the canonical task-required file (distinct from `server/test/db.test.mjs` which can remain in place).

**Import style** (follow existing server test pattern):
```js
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initDb, closeDb, getDb,
  getCards, createCard, updateCard, deleteCard, moveCard, createComment,
  NotFoundError, DatabaseError, ForeignKeyError,
} from './queries.js';  // relative path from server/db/
```

**Test suites and cases** (all GREEN immediately since `queries.js` is fully implemented):

**ALL suites below (except `initDb / closeDb` which manages its own lifecycle per-test) must use:**
```js
beforeEach(() => initDb(':memory:'));
afterEach(() => closeDb());
```
This is mandatory — `queries.js` exposes a module-level `db` singleton; without reset between tests, tests share state and produce false results.

`initDb / closeDb` (each test manages its own db lifecycle inline):
- `initDb(':memory:')` returns a Database instance
- creates `cards` table
- creates `comments` table
- enables foreign keys (pragma returns 1)
- `closeDb()` closes the database (subsequent `prepare()` throws)
- can call `initDb` again after `closeDb`

`getCards` (uses `beforeEach/afterEach` described above):
- returns empty array when no cards
- returns cards with empty `comments` array
- returns cards ordered by column then position
- nests comments under the correct card
- comments are ordered by `created_at` within a card

`createCard` (uses `beforeEach/afterEach`):
- returns card with all required fields (id, title, assignee, column, position, description, created_at)
- generates a valid UUID v4 for id
- sets `created_at` to a recent Unix timestamp in ms
- defaults column to `'ready'`
- defaults assignee and description to null
- assigns position `1.0` to the first card in a column
- assigns `max+1` to subsequent cards in the same column
- positions are independent per column
- stores optional fields (assignee, description) when provided
- card appears in `getCards()` after creation

`updateCard` (uses `beforeEach/afterEach`; also create a card in `beforeEach` and store its id):
- updates title and returns the updated card
- partial update does not modify unspecified fields
- can update multiple fields at once
- returned card matches state in database
- throws `NotFoundError` for a non-existent id
- error message contains the id
- ignores fields not in the allowlist (SQL injection prevention)

`deleteCard` (uses `beforeEach/afterEach`; also create a card in `beforeEach` and store its id):
- returns `true` on successful deletion
- card no longer appears in `getCards()` after deletion
- throws `NotFoundError` for a non-existent id
- throws `NotFoundError` if card was already deleted
- cascade-deletes associated comments when card is deleted (use `getDb().prepare(...)` to query `comments` table directly)

`moveCard` (uses `beforeEach/afterEach`):
- moves card to empty column
- moves card to first position in populated column
- moves card to last position in populated column
- moves card to middle position in column
- returned card reflects updated column and position
- moves card within same column to later position
- moves card within same column to earlier position
- renormalizes column when position gap falls below 0.001 (insert cards with tiny gap directly via `getDb().prepare(...)`)
- throws `NotFoundError` for a non-existent card id
- negative position value treated as first position
- position beyond end treated as last position

`createComment` (uses `beforeEach/afterEach`; also create a parent card in `beforeEach` and store its id):
- returns comment with all fields (id, card_id, author, content, created_at)
- generates a valid UUID v4 for comment id
- sets `created_at` to a recent timestamp
- comment appears nested under the card in `getCards()`
- multiple comments accumulate under the card
- throws `ForeignKeyError` for a non-existent cardId
- `ForeignKeyError` is also an instance of `DatabaseError`

`Error Classes` (no DB setup needed):
- `NotFoundError` is instanceof Error with correct name and message
- `ForeignKeyError` is instanceof `DatabaseError` and `Error`

**How to run** (from `server/` directory):
```bash
node --test db/queries.test.js
```

---

### 2. `server/api/cards.test.js`
New integration test file using **supertest** + native `node:test`. Focuses on **HTTP behaviour only** (status codes, response body shape). WebSocket broadcast behaviour is already fully covered in `server/test/cards.test.mjs` — do NOT duplicate those tests here.

**Import style**:
```js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import { createApp } from '../index.js';
import { initDb, closeDb, createCard } from '../db/queries.js';
// NOTE: initWs is NOT needed — broadcast() safely iterates an empty clients Set
// when initWs has not been called (no broadcast errors will occur)
```

**Setup pattern** (one shared server for all suites in this file):
```js
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
```

**Test suites and cases** (note: `GET /api/cards` tests are RED until the route is added):

`GET /api/cards` (TDD RED until route is added to `server/api/cards.js`):

**Order matters**: the "empty array" test must be the very first test in this suite — before any other test creates a card.

- (1st) returns 200 with an empty array `[]` when no cards exist
- (2nd) returns 200 with an array response (Content-Type: application/json)
- (3rd) after calling `createCard({ title: 'Test' })` directly, GET returns that card with a `comments` array field

`POST /api/cards`:
- returns 201 with created card on valid request — send `{ title: 'My Card' }`, assert `res.status === 201`
- response body has: id, title, assignee, column, position, description, created_at
- returns 400 when title is missing (send `{}`)
- 400 response body has an `error` string field

`PATCH /api/cards/:id`:
- create a card with `createCard({ title: 'Original' })` in `beforeEach`, store the id
- returns 200 with updated card — send `{ title: 'Updated' }`, assert `res.status === 200` and `res.body.title === 'Updated'`
- returns 404 when card not found — send `PATCH /api/cards/no-such-id` with `{ title: 'X' }`, assert status 404
- 404 response body has an `error` string field

`DELETE /api/cards/:id`:
- create a card with `createCard()` in `beforeEach`, use that id
- returns 204 on successful deletion
- 204 response has no body (empty string)
- returns 404 when card not found

`PATCH /api/cards/:id/move`:
- create a card with `createCard({ column: 'ready' })` in `beforeEach`
- returns 200 with moved card
- 200 response body column reflects the target column value
- returns 400 when `column` is missing from body
- returns 400 when `position` is missing from body
- `position: 0` is valid (move to first) — returns 200
- returns 404 when card not found

**How to run** (from `server/` directory):
```bash
node --test api/cards.test.js
```

---

### 3. `playwright.config.mjs` (root level of the kanban/ project)

**Must use `.mjs` extension**: the root `package.json` has no `"type": "module"`, so `.js` files at the root are treated as CommonJS. Using `import/export` in a `.js` file causes a `SyntaxError`. Playwright auto-discovers `playwright.config.mjs` without needing `--config`.

```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,   // REQUIRED: forces sequential project execution so all browsers share the
                // in-memory DB without race conditions (each project starts after the previous
                // project fully finishes and the DB is clean)
  use: {
    baseURL: 'http://localhost:3001',   // server serves built client in production mode
    headless: true,
  },
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://localhost:3001/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      PORT: '3001',
      DB_PATH: ':memory:',
      NODE_ENV: 'production',   // REQUIRED: makes server/index.js serve client/dist static files
    },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox',  use: { browserName: 'firefox'  } },
    // Safari/WebKit omitted — not available on Linux CI environments
  ],
});
```

**Why `workers: 1` is required**: The tests use `test.describe.configure({ mode: 'serial' })` and share a single in-memory DB. Without `workers: 1`, Playwright would run the `chromium` and `firefox` projects concurrently (using multiple CPU workers), causing them to race each other on the shared DB. With `workers: 1`, Chromium's full test run completes first (ending with the card deleted, leaving the DB empty), then Firefox's full run starts from a clean state.

**Why `NODE_ENV: 'production'` is required**: `server/index.js` checks `process.env.NODE_ENV === 'production'` to decide whether to serve static files from `client/dist`. Without this, the server never serves the React app and every page navigation returns a 404 JSON response.

**Why `baseURL` is port 3001**: `npm start` runs `node server/index.js` which binds to port 3001. In production mode the server serves both the API and the built React client from the same port. There is no separate Vite preview server.

---

### 4. `e2e/board.spec.js`
Full user workflow tests. Create the `e2e/` directory first (it does not currently exist).

**Playwright imports** — every test file must start with:
```js
import { test, expect } from '@playwright/test';
```

**Known selectors from the React components** (use these exact values in tests):
- Column sections: `page.getByRole('region', { name: 'Ready' })` — Column renders `<section aria-label={title}>`
- Empty column state: `page.getByText('No cards')` — Column renders `<p className="column-empty">No cards</p>`
- Create form **toggle** button: `page.getByRole('button', { name: '+ Add card' })` — exact text from `CreateCardForm.jsx`
- Title input (create form or modal edit): `page.getByLabel('Title')` — `aria-label="Title"`
- Assignee input: `page.getByLabel('Assignee')` — `aria-label="Assignee"`
- Create form **submit** button: `page.getByRole('button', { name: 'Add card' })` — exact text `'Add card'` (distinct from toggle `'+ Add card'`)
- Card tile: `page.getByRole('button', { name: cardTitle })` — CardTile renders `role="button"` with `aria-label={card.title}`
- Modal: `page.getByRole('dialog')` — CardModal renders `role="dialog"`
- Modal close: `page.getByLabel('Close')` — `aria-label="Close"`
- Edit title button: `page.getByLabel('Edit title')` — `aria-label="Edit title"`
- Edit assignee button: `page.getByLabel('Edit assignee')` — `aria-label="Edit assignee"`
- Save button (in modal): `page.getByLabel('Save')` — `aria-label="Save"`
- Delete button: `page.getByLabel('Delete')` — `aria-label="Delete"`
- Confirm delete button: `page.getByLabel('Confirm delete')` — `aria-label="Confirm delete"`
- Comment author input: `page.getByLabel('Author name')` — `aria-label="Author name"`
- Comment text input: `page.getByLabel('Comment')` — `aria-label="Comment"`
- Comment submit button: `page.getByRole('button', { name: 'Add Comment' })` — exact text from `CommentList.jsx` line 80 (`'Add Comment'` with capital C); fallback: `page.locator('.comment-form button[type="submit"]')`
- Comment items: `page.getByTestId('comment')` — CommentList renders `data-testid="comment"` on each `<li>`

**NOTE: Moving cards between columns is NOT testable via E2E.** `Board.jsx` does not implement drag-and-drop or any UI mechanism to move cards; `moveCard` is not destructured in Board. Omit any move-card E2E scenarios.

**Test isolation strategy**: All tests are in one file, which runs sequentially in one Playwright worker. The in-memory DB is shared across all tests. Tests that assume an empty DB (e.g. "shows No cards") must run first. Tests that need a card must create one themselves. Use `test.describe.configure({ mode: 'serial' })` at the top of the file to guarantee sequential ordering.

**Test suites with step-by-step interactions**:

```
import { test, expect } from '@playwright/test';
test.describe.configure({ mode: 'serial' });

test.describe('Board renders', () => {
  test('shows three column headers', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Ready' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'In Progress' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible();
  });

  test('shows No cards empty state when DB is empty', async ({ page }) => {
    await page.goto('/');
    // All three columns should show the empty state on a fresh in-memory DB
    await expect(page.getByText('No cards').first()).toBeVisible();
  });
});

test.describe('Creating a card', () => {
  test('toggle button opens the create card form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '+ Add card' }).click();
    await expect(page.getByLabel('Title')).toBeVisible();
  });

  test('submitting creates a card in the Ready column', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '+ Add card' }).click();
    await page.getByLabel('Title').fill('My E2E Card');
    await page.getByRole('button', { name: 'Add card' }).click();
    // Card tile appears in the Ready column
    const readyColumn = page.getByRole('region', { name: 'Ready' });
    await expect(readyColumn.getByRole('button', { name: 'My E2E Card' })).toBeVisible();
  });

  test('created card persists after page reload', async ({ page }) => {
    // Assumes 'My E2E Card' was created in the previous test (serial mode)
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'My E2E Card' })).toBeVisible();
  });
});

test.describe('Viewing a card', () => {
  test('clicking a card opens a modal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'My E2E Card' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('Editing a card', () => {
  test('can update card title', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'My E2E Card' }).click();
    await page.getByLabel('Edit title').click();
    await page.getByLabel('Title').fill('Updated Title');
    await page.getByLabel('Save').click();
    // Modal stays open with new title; board also reflects it
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Close').click();
    await expect(page.getByRole('button', { name: 'Updated Title' })).toBeVisible();
  });

  test('can update card assignee', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Updated Title' }).click();
    await page.getByLabel('Edit assignee').click();
    await page.getByLabel('Assignee').fill('Alice');
    await page.getByLabel('Save').click();
    // Assignee name now visible in the modal
    await expect(page.getByRole('dialog')).toContainText('Alice');
    await page.getByLabel('Close').click();
  });
});

test.describe('Adding a comment', () => {
  test('can add a comment to a card', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Updated Title' }).click();
    await page.getByLabel('Author name').fill('Tester');
    await page.getByLabel('Comment').fill('This is a test comment');
    await page.getByRole('button', { name: 'Add Comment' }).click();  // capital C
    await expect(page.getByTestId('comment')).toBeVisible();
    await expect(page.getByTestId('comment')).toContainText('This is a test comment');
  });
});

test.describe('Deleting a card', () => {
  test('can delete a card', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Updated Title' }).click();
    await page.getByLabel('Delete').click();
    await page.getByLabel('Confirm delete').click();
    // Modal closes, card is gone from the board
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Updated Title' })).not.toBeVisible();
  });
});
```

**Note on serial test dependency**: The tests above share state intentionally (serial mode, shared in-memory DB). Each suite picks up where the previous left off. If you need to run a subset of tests, create the prerequisite card in that suite's `test.beforeEach`.

---

## Files to Modify

### 5. `server/api/cards.js` — Add `GET /api/cards` route

This is the critical missing implementation. Without it, the TDD red phase for `server/api/cards.test.js` fails as expected, and the green phase adds this route.

**Also update the import line** at the top to add `getCards`:

```js
// Change this:
import { createCard, updateCard, deleteCard, moveCard, NotFoundError } from '../db/queries.js';

// To this:
import { getCards, createCard, updateCard, deleteCard, moveCard, NotFoundError } from '../db/queries.js';
```

**Add this route as the first route** in the router (before the POST route):
```js
// GET /api/cards
router.get('/cards', (_req, res, next) => {
  try {
    const cards = getCards();
    return res.status(200).json(cards);
  } catch (err) {
    next(err);
  }
});
```

---

### 6. `server/package.json`

Add devDependencies and new test scripts. Keep the existing `"test"` script unchanged:

```json
{
  "devDependencies": {
    "nodemon": "^3.1.0",
    "supertest": "^7.0.0",
    "c8": "^10.1.0"
  },
  "scripts": {
    "dev": "nodemon index.js",
    "start": "node index.js",
    "test": "node --test test/server.test.mjs test/db.test.mjs test/comments.test.mjs test/ws.test.mjs test/cards.test.mjs",
    "test:unit": "node --test db/queries.test.js",
    "test:integration": "node --test api/cards.test.js",
    "test:all": "node --test test/server.test.mjs test/db.test.mjs test/comments.test.mjs test/ws.test.mjs test/cards.test.mjs db/queries.test.js api/cards.test.js",
    "test:coverage": "c8 --lines 70 --functions 80 --reporter=text --reporter=lcov node --test test/server.test.mjs test/db.test.mjs test/comments.test.mjs test/ws.test.mjs test/cards.test.mjs db/queries.test.js api/cards.test.js"
  }
}
```

**Note**: `--lines 70 --functions 80` makes c8 exit non-zero if thresholds are not met, which is required for CI gate enforcement.

---

### 7. `client/package.json`

Add `@vitest/coverage-v8` devDependency and `test:coverage` script:

```json
{
  "devDependencies": {
    "@vitest/coverage-v8": "^2.0.5"
  },
  "scripts": {
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

### 8. `client/vite.config.js`

Add `coverage` block inside the existing `test` config:

```js
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: ['./src/test-setup.js'],
  coverage: {
    provider: 'v8',
    reporter: ['text', 'lcov'],
    thresholds: {
      lines: 70,
      functions: 80,
    },
    exclude: [
      'src/test-setup.js',
      '**/*.test.{js,jsx}',
      'src/main.jsx',
    ],
  },
},
```

---

### 9. Root `package.json`

Add `@playwright/test` devDependency and test scripts. Preserve existing scripts:

```json
{
  "devDependencies": {
    "concurrently": "^8.2.2",
    "@playwright/test": "^1.44.0"
  },
  "scripts": {
    "dev": "concurrently -n server,client -c blue,green \"npm -w server run dev\" \"npm -w client run dev\"",
    "build": "npm -w client run build",
    "start": "npm -w server run start",
    "test:setup": "node --test test/*.test.mjs",
    "test:server": "npm -w server run test",
    "test:server:all": "npm -w server run test:all",
    "test:server:coverage": "npm -w server run test:coverage",
    "test:client": "npm -w client run test",
    "test:client:coverage": "npm -w client run test:coverage",
    "test:e2e": "playwright test",
    "test:all": "npm run test:server:all && npm run test:client",
    "test:coverage": "npm run test:server:coverage && npm run test:client:coverage"
  }
}
```

**Note**: `test:all` runs server + client unit/integration tests only (not E2E, since E2E requires a build). Run E2E separately with `npm run test:e2e`.

---

## TDD Execution Order

### Step 1 (RED → GREEN immediately): `server/db/queries.test.js`
```bash
# Install nothing (node:test is built-in)
# Create server/db/queries.test.js
node --test server/db/queries.test.js
# All tests PASS immediately (queries.js is fully implemented)
```

### Step 2 (RED): `server/api/cards.test.js`
```bash
cd kanban
npm install -w server --save-dev supertest c8
# Create server/api/cards.test.js
node --test server/api/cards.test.js
# FAIL: GET /api/cards returns 404 — route not in server/api/cards.js yet
```

### Step 3 (GREEN): Add `GET /api/cards` to `server/api/cards.js`
```bash
# Edit server/api/cards.js: add getCards import and GET route
node --test server/api/cards.test.js
# All tests PASS
```

### Step 4 (subtask 4 verification): Confirm client hook tests pass
```bash
npm -w client run test
# Expected: all 101+ tests in useBoard.test.js and others pass
```

### Step 5 (RED → GREEN): Playwright E2E
```bash
npm install -D @playwright/test
npx playwright install chromium firefox   # install both project browsers
# Create e2e/ directory
# Create playwright.config.mjs   (NOT .js — root is CJS)
# Create e2e/board.spec.js
npm run build
npx playwright test
# Tests pass when server serves built client correctly
```

### Step 6: Coverage
```bash
npm install -w client --save-dev @vitest/coverage-v8
# Update client/vite.config.js with coverage config
npm -w server run test:coverage   # check server thresholds met
npm -w client run test:coverage   # check client thresholds met
```

---

## Critical Files Reference

| File | Action | Purpose |
|------|--------|---------|
| `server/api/cards.js` | MODIFY | Add `GET /api/cards` route + `getCards` import |
| `server/db/queries.test.js` | CREATE | Unit tests for all DB query functions (node:test) |
| `server/api/cards.test.js` | CREATE | HTTP integration tests with supertest (node:test) |
| `playwright.config.mjs` | CREATE | Playwright E2E configuration (`.mjs` required — root is CJS) |
| `e2e/board.spec.js` | CREATE | Full user workflow E2E tests |
| `server/package.json` | MODIFY | Add supertest + c8; add test scripts with thresholds |
| `client/package.json` | MODIFY | Add @vitest/coverage-v8; add test:coverage script |
| `client/vite.config.js` | MODIFY | Add coverage thresholds (70% lines, 80% functions) |
| `root package.json` | MODIFY | Add @playwright/test; add combined test scripts |

## Existing Files (Do Not Modify Unless Fixing a Bug)

| File | Status |
|------|--------|
| `server/test/db.test.mjs` | 48 tests, comprehensive — not replaced, kept as-is |
| `server/test/cards.test.mjs` | 38 tests, covers POST/PATCH/DELETE/move + WS broadcasts |
| `server/test/comments.test.mjs` | Complete |
| `server/test/ws.test.mjs` | Complete |
| `server/test/server.test.mjs` | Complete |
| `client/src/hooks/useBoard.test.js` | 101 tests — subtask 4 is already satisfied |
| `client/src/hooks/useWebSocket.test.js` | Complete |
| `client/src/api/client.test.js` | Complete |
| `client/src/components/**/*.test.jsx` | Multiple component tests, complete |
| `server/db/queries.js` | Implementation complete |
| `server/ws/broadcaster.js` | Implementation complete |

---

## Verification

```bash
# 1. Server unit tests (existing suite + new files)
npm -w server run test:all

# 2. Client tests (includes the 101-test useBoard suite)
npm -w client run test

# 3. E2E tests (must build first; uses in-memory DB)
npm run build && npm run test:e2e

# 4. Coverage (server ≥70% lines, ≥80% functions; client same)
npm run test:coverage
```

### Expected results:
- Server: all existing tests pass + new `server/db/queries.test.js` + `server/api/cards.test.js` pass
- Client: all vitest tests pass
- E2E: board renders, card creation, card editing, card deletion, comment addition all pass
- Server c8 exits 0 (thresholds met: ≥70% lines, ≥80% functions)
- Client vitest coverage exits 0 (thresholds met: ≥70% lines, ≥80% functions)
