# QA Report — Task 22: Add Inline Editing Functionality

**Date:** 2026-04-10  
**Branch:** `kanban-board/kanban-board-22` (commit `e04fadb`)  
**Reviewer role:** QA Engineer (read-only, no fixes applied)

---

## 1. Scope

Task 22 adds inline click-to-edit capability to `CardTile` and `CardModal` components. The following files were changed:

| File | Change |
|------|--------|
| `kanban/client/src/components/Board/CardTile.jsx` | Full rewrite — click-to-edit for title and assignee |
| `kanban/client/src/components/Board/CardModal.jsx` | Extended with inline editing for title and assignee |
| `kanban/client/src/components/Board/CardTile.css` | Added `.card-tile-editing`, `.card-tile-field-edit`, `.card-tile-error` |
| `kanban/client/src/components/Board/CardTile.test.jsx` | 37 new inline-editing tests (38 total) |
| `kanban/client/src/components/Board/CardModal.test.jsx` | 68 tests covering modal inline editing |
| `kanban/client/src/components/Board/Column.jsx` | Forwards `onUpdate` prop to `CardTile` |
| `kanban/client/src/components/Board/Board.jsx` | Passes `onUpdate={updateCard}` to all 3 `Column` instances |

---

## 2. Commands Found and Executed

All commands were run from `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-22/kanban`.

| # | Command | Source | Purpose |
|---|---------|--------|---------|
| 1 | `npm -w client run lint` | `client/package.json` → `scripts.lint` | ESLint on `src/` |
| 2 | `npm -w client run test` | `client/package.json` → `scripts.test` | Vitest client unit tests |
| 3 | `npm -w client run build` | `client/package.json` → `scripts.build` | Vite production build |
| 4 | `npm run test:setup` | Root `package.json` → `scripts.test:setup` | Node built-in tests for project structure/config |
| 5 | `npm run test:server` | Root `package.json` → `scripts.test:server` | Node built-in tests for server API/DB/WebSocket |

---

## 3. Command Results

### 3.1 Lint — `npm -w client run lint`

**Result: ✅ PASS**

ESLint completed with no errors or warnings. Exit code 0.

```
> kanban-client@1.0.0 lint
> eslint src
```

---

### 3.2 Client Tests — `npm -w client run test`

**Result: ✅ PASS**

All 11 test suites pass with 402 individual tests.

```
 ✓ src/api/client.test.js                             (27 tests)
 ✓ src/hooks/useWebSocket.test.js                     (42 tests)
 ✓ src/components/Board/CardTile.test.jsx             (38 tests)
 ✓ src/components/CreateCardForm.test.jsx             (33 tests)
 ✓ src/components/CardModal/CommentList.test.jsx      (32 tests)
 ✓ src/components/CardModal/BlockEditor.test.jsx      (32 tests)
 ✓ src/components/Board/Board.test.jsx                (17 tests)
 ✓ src/components/Board/Column.test.jsx               ( 8 tests)
 ✓ src/components/Board/CardModal.test.jsx            (68 tests)
 ✓ src/App.test.jsx                                   ( 4 tests)
 ✓ src/hooks/useBoard.test.js                        (101 tests)

 Test Files  11 passed (11)
      Tests  402 passed (402)
   Duration  5.91s
```

Note: Several `act(...)` warnings appear in stderr from `useBoard.test.js` WebSocket integration tests. These are pre-existing warnings from before task 22 and do not cause test failures.

**Task-22-specific suites:**

| Suite | Tests | Coverage |
|-------|-------|----------|
| `CardTile.test.jsx` | 38 (37 new) | Click-to-edit entry, mutual exclusivity, Enter/Escape/blur, validation, error handling, CSS class, saving indicator |
| `CardModal.test.jsx` | 68 | Edit button, Save/Cancel, blur suppression, Escape intercept, block editor awareness, validation, error handling, loading state, mutual exclusivity |

---

### 3.3 Client Build — `npm -w client run build`

**Result: ✅ PASS**

```
vite v5.4.21 building for production...
✓ 558 modules transformed.
dist/index.html                     0.48 kB │ gzip:   0.30 kB
dist/assets/index-Dbm5wWgb.css     30.18 kB │ gzip:   6.08 kB
dist/assets/module-BvCTiNll.js     77.23 kB │ gzip:  27.78 kB
dist/assets/native-B5Vb9Oiz.js    380.35 kB │ gzip:  82.06 kB
dist/assets/index-CYxwf42u.js   1,356.65 kB │ gzip: 419.35 kB

(!) Some chunks are larger than 500 kB after minification.
✓ built in 1.47s
```

The chunk-size advisory warning is pre-existing — it originates from the `@blocknote` rich-text editor introduced in task 14, not from task 22 changes. The build succeeds.

---

### 3.4 Setup/Integration Tests — `npm run test:setup`

**Result: ✅ PASS**

```
# tests 76
# suites 13
# pass 76
# fail 0
# duration_ms 53ms
```

All 76 structural tests pass (package.json shape, Docker config, directory structure, vite proxy settings, etc.).

---

### 3.5 Server Tests — `npm run test:server`

**Result: ✅ PASS**

```
# tests 148
# suites 28
# pass 148
# fail 0
# duration_ms 2814ms
```

All 148 server tests pass across 28 suites covering: POST/PATCH/DELETE card routes, comments, database queries, WebSocket setup, broadcast, heartbeat, and client disconnection cleanup.

---

## 4. Implementation Review

### 4.1 CardTile — Inline Editing (`CardTile.jsx`)

All task requirements are correctly implemented:

- **Click-to-edit:** Clicking the `<h3>` title or `<p>` assignee replaces the element with an `<input>`. `e.stopPropagation()` on both handlers prevents the card-level `onCardClick` from firing.
- **Mutual exclusivity:** Opening title edit closes assignee edit and vice versa, resetting the alternate field's value.
- **Focus management:** Two `useEffect` hooks trigger `.focus()` on the appropriate input ref when edit mode is entered.
- **Enter saves / Escape cancels:** `onKeyDown` sets `skipBlurRef.current = true` before calling save/cancel to prevent the subsequent `onBlur` from triggering a duplicate save.
- **Blur auto-saves:** `onBlur` checks the skip-blur ref before invoking the save handler.
- **Separate skip-blur refs:** `skipTitleBlurRef` and `skipAssigneeBlurRef` are kept separate — no cross-field interference.
- **Validation:** `editTitle.trim() === ''` blocks the API call and displays `role="alert"` error. Empty assignee is mapped to `null`.
- **Error handling:** `try-catch` wraps `onUpdate()`. On failure: edit mode is preserved with the typed value intact, and the error message is displayed in `role="alert"`.
- **Loading state:** `isSaving` toggles a `<span aria-label="Saving">Saving…</span>` indicator.
- **Visual feedback:** `card-tile-editing` CSS class is applied to the tile wrapper when either field is active.

### 4.2 CardModal — Inline Editing (`CardModal.jsx`)

All task requirements are correctly implemented:

- **Edit button pattern:** Static title/assignee display includes an "Edit" button. Clicking it activates the corresponding input with Save and Cancel buttons.
- **Focus management:** Same `useEffect` pattern as CardTile.
- **Double-save prevention:** Save and Cancel buttons use `onMouseDown` to set `skipBlurRef.current = true` before the input's `onBlur` fires, preventing an unwanted auto-save.
- **Escape key:** A `document.addEventListener` effect intercepts Escape: cancels the active field edit (without closing the modal), or falls through to `onClose()` when no field is being edited and the block editor is idle.
- **Block editor awareness:** `onEditingChange={setIsEditingDescription}` is passed to `BlockEditor` so that Escape does not close the modal while the block editor has an active edit session.
- **Validation and error handling:** Same `trim() === ''` check and `role="alert"` pattern as CardTile. On API failure, edit mode is preserved with the typed value intact for retry.
- **Loading state:** Save button text changes to "Saving…" and is disabled while `isSaving` is true.
- **Mutual exclusivity:** Handled symmetrically — opening one field closes the other.

### 4.3 Column and Board Wiring

`Column.jsx` correctly accepts and forwards `onUpdate` to each `CardTile`. `Board.jsx` now passes `onUpdate={updateCard}` to all three `Column` instances (Ready, In Progress, Done). Previously, In Progress and Done columns did not pass this prop; without it, CardTile's save handlers would silently throw because `onUpdate` was `undefined`.

---

## 5. Overall Assessment

| Check | Result | Notes |
|-------|--------|-------|
| ESLint | ✅ PASS | No errors or warnings |
| Client unit tests (402 tests) | ✅ PASS | All 11 suites pass |
| Client production build | ✅ PASS | Bundle succeeds; chunk-size advisory is pre-existing |
| Setup/integration tests (76 tests) | ✅ PASS | All structural checks pass |
| Server tests (148 tests) | ✅ PASS | All API, DB, and WebSocket tests pass |
| Click-to-edit — CardTile | ✅ Correct | All behaviors implemented and tested |
| Click-to-edit — CardModal | ✅ Correct | All behaviors implemented and tested |
| Enter / Escape / blur | ✅ Correct | Implemented in both components with correct skip-blur guard |
| Empty title validation | ✅ Correct | `trim() === ''` + `role="alert"` in both components |
| Error handling + error display | ✅ Correct | `try-catch` + `role="alert"` in both components |
| Error-path: edit mode preserved | ✅ Correct | Both components stay in edit mode on API failure |
| Loading state | ✅ Correct | "Saving…" indicator in both components |
| Rollback on Escape | ✅ Correct | Restores `card.title` / `card.assignee` in both components |
| Visual feedback (CSS class) | ✅ Correct | `card-tile-editing` applied during tile edit mode |
| Board/Column prop wiring | ✅ Correct | `onUpdate` forwarded to all three columns and all card tiles |

**All checks pass. The task 22 implementation is functionally correct, fully tested, and introduces no regressions.**
