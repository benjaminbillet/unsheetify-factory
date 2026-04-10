# Task 21: Add Comprehensive Test Suite

## Context

The Kanban board project already has substantial test infrastructure:
- **Server** (`server/test/*.test.mjs`): 5 test files using Node.js native `node:test` covering server middleware, DB queries, cards API, comments API, and WebSocket broadcasts.
- **Client** (`client/src/**/*.test.{js,jsx}`): 10+ test files using Vitest + React Testing Library covering all hooks, API client, and components.

However, three critical pieces are **missing**:
1. Test files at the exact paths specified by the task (`server/db/queries.test.js`, `server/api/cards.test.js`)
2. The `GET /api/cards` REST endpoint — currently missing from the server (client calls it but the route doesn't exist)
3. Playwright E2E test infrastructure and `e2e/board.spec.js`
4. Coverage reporting (c8 for server, @vitest/coverage-v8 for client)
5. Updated package.json test scripts

**Framework Decision**: The server's `type: module` (pure ESM) makes adding Jest complex (requires `--experimental-vm-modules` + potential native module issues). Since native `node:test` is already proven in this project and Vitest (already installed for client) provides a Jest-compatible API, we will use **native `node:test` + supertest** for server tests and **Vitest** (already installed) for client tests. This satisfies the task's spirit of having unit/integration tests without ESM complexity. Playwright handles E2E.

---

## Files to Create

### 1. `server/db/queries.test.js`
New unit test file at the exact specified path, using native `node:test`. Mirrors structure of `server/test/db.test.mjs` but is the canonical file at the task-specified path.

**Test cases** (TDD — all should be GREEN since queries.js is fully implemented):
- `initDb` / `closeDb`: creates tables, enables FK, can reinitialize
- `getCards`: empty array, cards with comments, ordered by column+position, comment nesting, comment ordering
- `createCard`: UUID generation, defaults (column=ready, assignee=null, description=null), position auto-increment, per-column independence, optional fields, visible in getCards()
- `updateCard`: partial update, multi-field update, NotFoundError on missing id, SQL injection prevention
- `deleteCard`: returns true, card removed, NotFoundError on missing id, cascade delete comments
- `moveCard`: to empty/first/last/middle position, same-column reordering, renormalization, NotFoundError, negative/overflow position clamping
- `createComment`: returns all fields, UUID, ForeignKeyError on missing card, appears in getCards()
- Error classes: NotFoundError, DatabaseError, ForeignKeyError inheritance

### 2. `server/api/cards.test.js`
New integration test file using **supertest** + native `node:test`. Tests all REST endpoints including the new `GET /api/cards`.

**Test cases** (TDD — `GET /api/cards` is RED until route is added):
- `GET /api/cards`: 200 with array, empty array when no cards, cards include comments field
- `POST /api/cards`: 201 with created card, 400 on missing title, error body has "error" field, broadcasts `card:created`
- `PATCH /api/cards/:id`: 200 with updated card, 404 on missing id, broadcasts `card:updated`
- `DELETE /api/cards/:id`: 204 with no body, 404 on missing id, broadcasts `card:deleted`
- `PATCH /api/cards/:id/move`: 200 with moved card, 400 on missing column/position, 404 on missing id, broadcasts `card:moved`

**Setup pattern** (with supertest):
```js
import request from 'supertest';
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../index.js';
import { initDb, closeDb, createCard } from '../db/queries.js';
import { initWs, closeWs } from '../ws/broadcaster.js';

// Each suite: initDb(':memory:'), start server + WS, create supertest agent
let app, server, agent;
before(async () => {
  initDb(':memory:');
  app = createApp();
  await new Promise(resolve => {
    server = app.listen(0, resolve);
  });
  initWs(server, { pingInterval: 0 });
  agent = request(server);
});
after(async () => {
  await closeWs();
  await new Promise(resolve => server.close(resolve));
  closeDb();
});
```

### 3. `playwright.config.js` (root level)
```js
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:4173',  // vite preview port
    headless: true,
  },
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://localhost:3001/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { PORT: '3001', DB_PATH: ':memory:' },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
});
```

**Note**: E2E tests need the full-stack app. The webServer config starts the production build. For simpler dev setup, `reuseExistingServer: true` allows running against an existing dev server.

### 4. `e2e/board.spec.js`
Full user workflow tests using Playwright.

**Test cases** (TDD — these will fail until Playwright is installed and app is running):
```
Board renders with three columns
  ✓ shows Ready, In Progress, and Done column headers
  ✓ shows empty state message when no cards exist

Creating a card
  ✓ can create a new card via the form
  ✓ new card appears in the Ready column immediately
  ✓ card persists after page reload

Viewing and editing a card
  ✓ clicking a card opens the card modal
  ✓ can update card title in the modal
  ✓ can update card assignee

Moving a card
  ✓ can drag a card from Ready to In Progress (keyboard accessible)
  ✓ card appears in the new column after move
  
Deleting a card
  ✓ can delete a card via the modal
  ✓ card disappears from the board

Adding a comment
  ✓ can add a comment to a card
  ✓ comment appears in the card modal
```

---

## Files to Modify

### 5. `server/api/cards.js` — Add `GET /api/cards`
**This is the critical missing route.** Without it, the client cannot load cards.

Add before the POST route:
```js
import { getCards, createCard, updateCard, deleteCard, moveCard, NotFoundError } from '../db/queries.js';

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

### 6. `server/package.json`
Add devDependencies and test scripts:
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
    "test:coverage": "c8 --reporter=text --reporter=lcov node --test test/server.test.mjs test/db.test.mjs test/comments.test.mjs test/ws.test.mjs test/cards.test.mjs db/queries.test.js api/cards.test.js"
  }
}
```

### 7. `client/package.json`
Add coverage devDependency and script:
```json
{
  "devDependencies": {
    "@vitest/coverage-v8": "^2.0.5",
    ...existing deps...
  },
  "scripts": {
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    ...
  }
}
```

### 8. `client/vite.config.js`
Add coverage configuration to the `test` block:
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
      '**/node_modules/**',
    ],
  },
},
```

### 9. Root `package.json`
Add Playwright devDependency and comprehensive test scripts:
```json
{
  "devDependencies": {
    "concurrently": "^8.2.2",
    "@playwright/test": "^1.44.0"
  },
  "scripts": {
    "dev": "...",
    "build": "npm -w client run build",
    "start": "npm -w server run start",
    "test:setup": "node --test test/*.test.mjs",
    "test:server": "npm -w server run test",
    "test:server:all": "npm -w server run test:all",
    "test:server:coverage": "npm -w server run test:coverage",
    "test:client": "npm -w client run test",
    "test:client:coverage": "npm -w client run test:coverage",
    "test:e2e": "playwright test",
    "test:all": "npm run test:server:all && npm run test:client && npm run test:e2e",
    "test:coverage": "npm run test:server:coverage && npm run test:client:coverage"
  }
}
```

---

## TDD Execution Order

### Step 1 (RED → GREEN): server/db/queries.test.js
```bash
cd server
# Tests will immediately pass since queries.js is fully implemented
node --test db/queries.test.js
```

### Step 2 (RED): server/api/cards.test.js
```bash
cd server
npm install supertest c8
node --test api/cards.test.js
# FAIL: "GET /api/cards" test fails (404 response, route doesn't exist)
```

### Step 3 (GREEN): Add GET /api/cards to server/api/cards.js
```bash
# After adding the route:
node --test api/cards.test.js
# PASS: all tests pass
```

### Step 4 (RED → GREEN): Playwright E2E
```bash
cd /path/to/kanban
npm install -D @playwright/test
npx playwright install chromium firefox
# Create playwright.config.js and e2e/board.spec.js
npm run build  # Build client
# Start server: PORT=3001 DB_PATH=data/kanban.db node server/index.js
npx playwright test
```

### Step 5: Verify coverage targets
```bash
# Server coverage
npm -w server run test:coverage
# Check: >70% lines, >80% functions

# Client coverage
npm -w client run test:coverage
# Check: >70% lines, >80% functions
```

---

## Critical Files Reference

| File | Action | Purpose |
|------|--------|---------|
| `server/api/cards.js` | MODIFY | Add `GET /api/cards` route |
| `server/db/queries.test.js` | CREATE | Unit tests for all DB query functions |
| `server/api/cards.test.js` | CREATE | Integration tests with supertest |
| `playwright.config.js` | CREATE | Playwright E2E configuration |
| `e2e/board.spec.js` | CREATE | Full user workflow E2E tests |
| `server/package.json` | MODIFY | Add supertest, c8; update test scripts |
| `client/package.json` | MODIFY | Add @vitest/coverage-v8; add coverage script |
| `client/vite.config.js` | MODIFY | Add coverage thresholds and config |
| `root package.json` | MODIFY | Add @playwright/test; add combined test scripts |

## Existing Files (Already Complete — Don't Modify Unless Fixing Bugs)

| File | Status |
|------|--------|
| `server/test/db.test.mjs` | 48 tests, comprehensive |
| `server/test/cards.test.mjs` | 38 tests, comprehensive |
| `server/test/comments.test.mjs` | Complete |
| `server/test/ws.test.mjs` | Complete |
| `server/test/server.test.mjs` | Complete |
| `client/src/hooks/useBoard.test.js` | 101 tests, comprehensive |
| `client/src/hooks/useWebSocket.test.js` | Complete |
| `client/src/api/client.test.js` | Complete |
| `client/src/components/**/*.test.jsx` | Multiple component tests, complete |
| `server/db/queries.js` | Implementation complete |
| `server/ws/broadcaster.js` | Implementation complete |

---

## Verification

### Running all tests:
```bash
# Server unit tests (existing + new)
npm -w server run test:all

# Client tests
npm -w client run test

# E2E tests (requires built app + running server)
npm run test:e2e

# Coverage (check thresholds)
npm run test:coverage
```

### Expected results:
- All server tests pass (new files + existing files)
- Client tests pass (101 useBoard tests + others)
- E2E tests pass for: board renders, card CRUD, moving cards, comments
- Server coverage: ≥70% lines, ≥80% functions (via c8)
- Client coverage: ≥70% lines, ≥80% functions (via @vitest/coverage-v8)
- All scripts run cleanly in CI environment
