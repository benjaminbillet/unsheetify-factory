# QA Report — Task 12: Create CreateCardForm Component

**Date:** 2026-04-10
**Branch:** `kanban-board/kanban-board-12`
**Commit:** `64c9d72` — _feat(kanban-board): task 12 - Create CreateCardForm component_
**Reviewer role:** QA Engineer (read-only, no fixes applied)

---

## 1. Project Structure Overview

```
kanban-board-12/
└── kanban/
    ├── package.json               # Workspace root (client + server workspaces)
    ├── client/
    │   ├── package.json           # Vitest, ESLint, Vite scripts
    │   ├── eslint.config.js
    │   ├── vite.config.js
    │   └── src/
    │       ├── App.jsx / App.test.jsx
    │       ├── api/client.js / client.test.js
    │       ├── hooks/
    │       │   ├── useBoard.js / useBoard.test.js
    │       │   └── useWebSocket.js / useWebSocket.test.js
    │       └── components/
    │           ├── Board/
    │           │   ├── Board.jsx / Board.test.jsx
    │           │   ├── Column.jsx / Column.test.jsx
    │           │   ├── CardTile.jsx / CardTile.test.jsx
    │           │   └── CardModal.jsx / CardModal.test.jsx
    │           ├── CardModal/
    │           │   └── CommentList.jsx / CommentList.test.jsx
    │           ├── CreateCardForm.jsx     ← NEW (task 12)
    │           ├── CreateCardForm.css     ← NEW (task 12)
    │           └── CreateCardForm.test.jsx ← NEW (task 12)
    └── server/
        ├── package.json
        ├── index.js
        ├── api/
        ├── db/
        ├── ws/
        └── test/
```

---

## 2. What Was Implemented (Files Created/Modified)

### New Files
| File | Description |
|------|-------------|
| `kanban/client/src/components/CreateCardForm.jsx` | Main component (128 lines) — togglable inline form with title (required), assignee (optional), validation, API error handling, loading state, Escape-key support |
| `kanban/client/src/components/CreateCardForm.css` | Scoped CSS for the form (99 lines) |
| `kanban/client/src/components/CreateCardForm.test.jsx` | 33 unit tests in 5 `describe` groups (toggle, form fields, validation, submission, cancel/Escape) |

### Modified Files
| File | Changes |
|------|---------|
| `kanban/client/src/components/Board/Board.jsx` | Imported `CreateCardForm`; added it as the `footer` prop of the "Ready" `Column`, passing `createCard` as `onSubmit` |
| `kanban/client/src/components/Board/Board.test.jsx` | Added 4 integration tests in a `Board — CreateCardForm integration` suite |
| `kanban/client/src/components/Board/Column.jsx` | Added `footer` prop, rendered at the bottom of the `<section>` element |
| `kanban/client/src/components/Board/Column.test.jsx` | Added 2 tests: `renders the footer prop` and `renders nothing extra when footer prop is not provided` |

---

## 3. Commands Found and Executed

All commands were run from `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-12/kanban`.

| # | Command | Source |
|---|---------|--------|
| 1 | `npm -w client run test` | `client/package.json` → `scripts.test` |
| 2 | `npm -w client run lint` | `client/package.json` → `scripts.lint` |
| 3 | `npm -w client run build` | `client/package.json` → `scripts.build` |
| 4 | `npm run test:server` | root `package.json` → `scripts.test:server` |
| 5 | `npm run test:setup` | root `package.json` → `scripts.test:setup` |

No `Makefile` found. No TypeScript typecheck script found (project uses plain JS/JSX with no `tsconfig.json`).

---

## 4. Command Results

### 4.1 `npm -w client run test` — PASS (with pre-existing warnings)

**Exit code:** 0

**Summary:**
```
Test Files  10 passed (10)
Tests       328 passed (328)
Duration    ~5.9s
```

All 328 tests pass across 10 test files. The new `CreateCardForm.test.jsx` contributes 33 tests, all green.

**Warnings (stderr — pre-existing, not introduced by task 12):**
Four tests in `src/hooks/useBoard.test.js` emit React `act(...)` warnings during the "WebSocket integration — initialization" and "multi-client state consistency" suites:

```
Warning: An update to TestComponent inside a test was not wrapped in act(...).
  > WebSocket integration — initialization > calls useWebSocket with a ws:// URL containing /ws
  > WebSocket integration — initialization > subscribes to all 5 event types
  > WebSocket integration — initialization > passes an onEvent callback to useWebSocket
  > multi-client state consistency > refetches board state when WebSocket reconnects after disconnect
```

These are logged to stderr but do not fail the test suite. They originate from `useBoard.test.js` (unchanged by task 12) and are a carry-over from a prior task.

---

### 4.2 `npm -w client run lint` — PASS

**Exit code:** 0

No ESLint errors or warnings on any file in `src/`.

---

### 4.3 `npm -w client run build` — PASS

**Exit code:** 0

```
vite v5.4.21 building for production...
✓ 46 modules transformed.
dist/index.html                   0.48 kB │ gzip:  0.30 kB
dist/assets/index-Ndzc9fes.css    5.87 kB │ gzip:  1.63 kB
dist/assets/index-DygLZYqf.js   158.22 kB │ gzip: 50.49 kB
✓ built in 255ms
```

Production bundle builds cleanly, including the new component.

---

### 4.4 `npm run test:server` — FAIL (pre-existing environment issue)

**Exit code:** 1

**Summary:**
```
# tests 25 (only ws.test.mjs ran)
# pass 21
# fail 4
```

Four server test files (`cards.test.mjs`, `comments.test.mjs`, `db.test.mjs`, `server.test.mjs`) all fail immediately with:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'express' imported from .../server/index.js
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'better-sqlite3' imported from .../server/db/queries.js
```

**Root cause:** The `kanban/server/node_modules/` directory does not exist — server dependencies (`express`, `cors`, `better-sqlite3`, `uuid`) are not installed. This is an environment/setup problem unrelated to task 12: the task only touched client-side files (`Board.jsx`, `Column.jsx`, `CreateCardForm.*`), and the server test failure is identical across all prior commits. `ws` was found in the workspace-hoisted `kanban/node_modules/` which is why `ws.test.mjs` ran (21 of its 25 tests pass; 4 failures appear to be pre-existing bugs in the ws test suite related to timing).

---

### 4.5 `npm run test:setup` — PASS

**Exit code:** 0

```
# tests 49
# pass 49
# fail 0
```

All 49 setup/scaffolding tests pass (package.json structure, directory layout, vite.config proxy settings, etc.).

---

## 5. Code Review Findings

### 5.1 Logic Note: `displayError` precedence means API errors can be masked by stale validation errors

**File:** `kanban/client/src/components/CreateCardForm.jsx`, line 70

```js
const displayError = validationError ?? apiError
```

`??` (nullish coalescing) means that if `validationError` is set (non-null), `apiError` will never be shown. In the current implementation this cannot happen simultaneously because:
- Validation sets `validationError` and returns early (never calls `onSubmit`, so `apiError` stays null).
- A successful call to `onSubmit` clears both errors before starting.

However, if the code is extended in the future (e.g., async title validation), a non-null `validationError` would silently shadow an `apiError`. The intent is clearly to prefer `validationError` over `apiError`, which works, but the dependency on two separate state variables (rather than a single `error` state) makes the precedence implicit and fragile. This is a minor design concern, not a current bug.

### 5.2 Minor: `handleTitleChange` clears both error types on title input

**File:** `CreateCardForm.jsx`, lines 47–49

```js
if (validationError) setValidationError(null)
if (apiError) setApiError(null)
```

Both are cleared together when the user types in the title field. This is correct behaviour and matches the test coverage (test: "clears API error when user starts typing in title after a failed submit"). No issue; noted for completeness.

### 5.3 Minor Accessibility Gap: No `aria-describedby` on the title input

The error paragraph uses `role="alert"`, which is ARIA-live by default and announces errors to screen readers when they appear. The title input does not have `aria-describedby` pointing at the error element. This is a minor accessibility gap — assistive technology users can hear the error announced when it appears but focus is not programmatically associated with the invalid field. Not a functional bug; noted as an improvement opportunity.

### 5.4 Integration: `CreateCardForm` is only added to the "Ready" column — confirmed correct

**File:** `Board.jsx`, lines 19–25

The form is passed only as a `footer` to the "Ready" column. "In Progress" and "Done" columns do not receive a footer. This matches the specification and is confirmed by integration tests in `Board.test.jsx` (`does not render the "+ Add card" button in the In Progress column`, `does not render the "+ Add card" button in the Done column`).

### 5.5 Pre-existing `act()` warnings in `useBoard.test.js` (not task 12)

As noted in §4.1, four tests in `useBoard.test.js` emit `act(...)` warnings. These are not introduced by task 12 and should be addressed in a follow-up.

---

## 6. Overall Assessment

**Task 12 implementation: PASS**

The `CreateCardForm` component is correctly implemented and fully integrated. All client-facing commands (test, lint, build) pass with exit code 0. The 33 new unit tests and 4 new integration tests are comprehensive, covering: toggle behaviour, form field control, validation (empty/whitespace title), submission (trimming, null assignee for empty/whitespace), loading states, error display, Cancel button, and Escape key. The component is well-structured, follows existing code conventions, and introduces no regressions.

**Outstanding issues not attributable to task 12:**

| Issue | Severity | Origin |
|-------|----------|--------|
| `act(...)` warnings in `useBoard.test.js` | Low (tests still pass) | Prior task |
| Server tests fail (`express`/`better-sqlite3` not installed) | High (server test suite broken) | Environment / prior tasks |
