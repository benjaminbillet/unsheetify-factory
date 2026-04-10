# QA Report — Task 17: Add WebSocket Event Broadcasting to API Routes

**Date:** 2026-04-10  
**Reviewer:** QA Agent  
**Task:** Integrate WebSocket broadcasting into all card and comment mutation endpoints  
**Status:** PASS (with observations)

---

## 1. Project Structure Overview

```
kanban-board-17/
└── kanban/
    ├── package.json              (workspace root: "kanban-app")
    ├── client/
    │   ├── package.json          (kanban-client)
    │   ├── eslint.config.js
    │   ├── vite.config.js
    │   └── src/
    │       ├── api/client.js + client.test.js
    │       ├── hooks/useBoard.js + useBoard.test.js
    │       └── App.jsx + App.test.jsx
    ├── server/
    │   ├── package.json          (kanban-server)
    │   ├── index.js
    │   ├── api/
    │   │   ├── cards.js          ← primary file under review
    │   │   └── comments.js       ← primary file under review
    │   ├── db/queries.js
    │   ├── ws/broadcaster.js
    │   └── test/
    │       ├── cards.test.mjs    ← new WS integration tests
    │       ├── comments.test.mjs
    │       ├── ws.test.mjs
    │       ├── db.test.mjs
    │       └── server.test.mjs
    └── test/
        ├── setup.test.mjs
        └── client.setup.test.mjs
```

---

## 2. What Was Implemented

### `kanban/server/api/cards.js`

- `broadcast` is imported from `../ws/broadcaster.js` at the top of the file.
- **POST /api/cards**: After `createCard()` succeeds, `broadcast('card:created', card)` is called inside a nested `try { ... } catch { /* isolate */ }` block. The broadcast is placed after the DB write and before `res.status(201).json(card)`.
- **PATCH /api/cards/:id**: After `updateCard()` succeeds, `broadcast('card:updated', card)` fires only when the request body contains at least one field from `CARD_UPDATE_ALLOWED` (`['title','assignee','column','description','position']`). The same inline try-catch pattern is used. If the body has no recognized fields, `updateCard` in `db/queries.js` returns the card without executing any `UPDATE` SQL, and no broadcast is emitted.
- **DELETE /api/cards/:id**: After `deleteCard()` succeeds, `broadcast('card:deleted', { id: req.params.id })` fires. Same try-catch pattern.
- **PATCH /api/cards/:id/move**: After `moveCard()` succeeds, `broadcast('card:moved', card)` fires. Same try-catch pattern.

### `kanban/server/api/comments.js`

- `broadcast` is imported from `../ws/broadcaster.js`.
- **POST /api/cards/:id/comments**: After `createComment()` succeeds, `broadcast('comment:created', comment)` fires inside the same inline try-catch pattern.

### `kanban/server/ws/broadcaster.js`

- `broadcast(event, payload)` serializes `{ event, payload }` as JSON and iterates the internal `clients` Set. Only sends to clients with `readyState === 1` (OPEN). Per-client `client.send()` errors are caught and suppressed so a single bad client cannot crash the broadcaster. The broadcaster exports `initWs`, `broadcast`, and `closeWs`.

---

## 3. Commands Found and Executed

| Command | Location | Script |
|---|---|---|
| `npm test` (server) | `kanban/server/package.json` | `node --test test/server.test.mjs test/db.test.mjs test/comments.test.mjs test/ws.test.mjs test/cards.test.mjs` |
| `npm test` (client) | `kanban/client/package.json` | `vitest run` |
| `npm run lint` (client) | `kanban/client/package.json` | `eslint src` |
| `npm run test:setup` | `kanban/package.json` (workspace root) | `node --test test/*.test.mjs` |
| `npm run build` | `kanban/package.json` (workspace root) | `npm -w client run build` |

No `Makefile` was found. There is no typecheck script (no TypeScript used in this project).

---

## 4. Command Results

### `npm test` (server) — ✅ PASS

All 146 tests across 27 suites passed. This includes:

- Suite **"POST /api/cards"** (7 tests): all pass, including:
  - `broadcasts card:created event after successful creation`
  - `card:created payload matches the created card`
  - `does not broadcast on validation failure (400)`
- Suite **"PATCH /api/cards/:id"** (7 tests): all pass, including:
  - `broadcasts card:updated event after successful update`
  - `does not broadcast when card not found`
  - `does not broadcast card:updated when body has no recognized fields (no DB write)`
- Suite **"DELETE /api/cards/:id"** (7 tests): all pass, including:
  - `broadcasts card:deleted event after successful deletion`
  - `card:deleted payload contains the deleted card id`
- Suite **"PATCH /api/cards/:id/move"** (8 tests): all pass, including:
  - `broadcasts card:moved event after successful move`
  - `card:moved payload contains card with updated column`
- Suite **"POST /api/cards/:id/comments (broadcast)"** (5 tests): all pass, including:
  - `broadcasts comment:created event after successful comment creation`
  - `HTTP response is still 201 when no WS clients are connected`
  - `does not broadcast on 400`
  - `does not broadcast on 404`
- All WebSocket unit tests (`ws.test.mjs`), DB tests, and server tests also pass.

### `npm test` (client) — ✅ PASS

95 tests across 3 test files passed:
- `src/api/client.test.js`: 27 tests passed
- `src/App.test.jsx`: 4 tests passed
- `src/hooks/useBoard.test.js`: 64 tests passed

### `npm run lint` (client) — ✅ PASS

ESLint ran with no errors or warnings against `src/`.

### `npm run test:setup` (workspace root) — ✅ PASS

49 tests across 9 suites all passed (dependency checks, directory structure, package.json validation, vite config proxy).

### `npm run build` — ✅ PASS

Vite production build completed successfully in ~225ms. Output artifacts written to `client/dist/`.

---

## 5. Issues Found

### Issue 1 — MEDIUM: `card:deleted` payload uses `req.params.id` (route string) instead of a DB-returned value

**Location**: `kanban/server/api/cards.js` — DELETE handler

```js
try { broadcast('card:deleted', { id: req.params.id }); } catch { /* isolate */ }
```

The `req.params.id` is always a `string` (URL parameter). The other broadcasts pass the actual DB-returned object (`card`), which ensures the payload reflects what was stored. The delete route is the only endpoint that constructs the payload manually rather than using a DB-returned value. In practice, both the route param and the stored UUID are the same string value, so tests pass. However, if the ID type or normalization ever changes, this could silently diverge. A cleaner approach would be to confirm the deleted ID from the DB-returned value (e.g., the result of `deleteCard()`) rather than the raw route parameter.

---

### Issue 2 — LOW: `CARD_UPDATE_ALLOWED` list is duplicated between route handler and `db/queries.js`

**Locations**:
- `kanban/server/api/cards.js`, line ~23: `const CARD_UPDATE_ALLOWED = ['title', 'assignee', 'column', 'description', 'position'];`
- `kanban/server/db/queries.js`, line ~90: `const allowed = ['title', 'assignee', 'column', 'description', 'position'];`

The route handler defines its own copy of the allowed-fields list to decide whether a DB write occurred and therefore whether to broadcast. This creates a maintenance hazard: if the allowed fields in `db/queries.js` are updated (e.g., a new field added), the route handler's guard condition would need to be updated independently, or broadcasts could be suppressed for new valid fields. There is no single source of truth for the allowlist. A cleaner design would export the allowed list from `db/queries.js` and import it in the route handler.

---

### Issue 3 — LOW: No tests for broadcast error isolation (the inner try-catch)

The inline `try { broadcast(...); } catch { /* isolate */ }` pattern is implemented consistently across all 5 mutation endpoints. However, no test verifies that a `broadcast()` error (e.g., if the broadcaster itself threw synchronously) would be swallowed without disrupting the HTTP response. The existing tests only verify that the broadcast fires when no error occurs and that the HTTP response is unaffected when no WS clients are connected (which does not throw). A test that mocks `broadcast` to throw and asserts the API still returns `2xx` would give full confidence in the isolation contract stated in Subtask 3.

---

### Issue 4 — LOW: Missing `npm install` — client tests cannot run in a fresh environment

**Observation**: The workspace's `node_modules` does not contain client devDependencies (vitest, jsdom, testing-library, etc.) and the client's `node_modules` directory is absent entirely. Running `npm test` in a clean checkout fails with `vitest: command not found` until `npm install` is run at the workspace root. This is not a code defect, but it is an environment reproducibility concern.

---

## 6. Overall Assessment

**The implementation is correct and complete.** All five required broadcast calls are present (`card:created`, `card:updated`, `card:deleted`, `card:moved`, `comment:created`), the `broadcast` function is properly imported in both route files, and all broadcasts occur strictly after successful database writes. The error isolation pattern (inline nested try-catch around each broadcast call) is applied consistently across all five mutation endpoints, ensuring that a broadcast failure cannot affect the HTTP response to the client.

All 146 server tests pass, all 95 client tests pass, lint reports zero issues, and the production build succeeds.

The substantive observations (payload construction on delete using a raw route parameter, duplicated allowed-fields list, and missing catch-block isolation test) are design-level concerns that do not cause any current test failures but represent future maintenance risk.

**Verdict: PASS** — All checks pass. Issues noted are non-blocking observations.
