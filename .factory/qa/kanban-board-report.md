# QA Report — Task 11: Create CardModal Component for Card Details

**Date:** 2026-04-10
**Reviewer:** QA Agent
**Task:** Build modal component for viewing and editing card details
**Branch:** kanban-board/kanban-board-11
**Status:** PASS with one notable deviation

---

## 1. Project Structure Overview

```
kanban-board-11/
└── kanban/
    ├── package.json              (workspace root: "kanban-app")
    ├── client/
    │   ├── package.json          (kanban-client)
    │   ├── eslint.config.js
    │   ├── vite.config.js        (test: vitest, environment: jsdom)
    │   └── src/
    │       ├── components/Board/
    │       │   ├── CardModal.jsx        ← primary file under review
    │       │   ├── CardModal.css        ← styles under review
    │       │   ├── CardModal.test.jsx   ← test suite (55 tests)
    │       │   ├── Board.jsx            ← integration point
    │       │   ├── Board.test.jsx
    │       │   ├── Column.jsx / .css / .test.jsx
    │       │   └── CardTile.jsx / .css / .test.jsx
    │       ├── hooks/useBoard.js + useWebSocket.js (with tests)
    │       ├── api/client.js + client.test.js
    │       └── App.jsx + App.test.jsx
    ├── server/
    │   └── (no node_modules — dependencies not installed)
    └── test/
```

No TypeScript in this project (no typecheck command). No Makefile.

---

## 2. Commands Found and Executed

| Command | Location | Script | Scope |
|---|---|---|---|
| `npm -w client run test` | `kanban/package.json` | `vitest run` | All client tests |
| `npm -w client run lint` | `kanban/package.json` | `eslint src` | Client source |
| `npm run build` | `kanban/package.json` | `npm -w client run build` | Client production build |
| `npm run test:setup` | `kanban/package.json` | `node --test test/*.test.mjs` | Project setup validation |
| `npm run test:server` | `kanban/package.json` | `npm -w server run test` | Server tests |

---

## 3. Command Results

### `npm -w client run test` — PASS

All 220 tests across 8 test files passed. The `CardModal.test.jsx` suite contributed 55 tests:

```
✓ src/api/client.test.js                     (27 tests)    7ms
✓ src/components/Board/CardTile.test.jsx      (9 tests)   57ms
✓ src/hooks/useWebSocket.test.js             (42 tests)   82ms
✓ src/components/Board/Column.test.jsx        (6 tests)   90ms
✓ src/App.test.jsx                            (4 tests)   54ms
✓ src/components/Board/Board.test.jsx        (13 tests)  113ms
✓ src/components/Board/CardModal.test.jsx    (55 tests)  310ms
✓ src/hooks/useBoard.test.js                 (64 tests) 3060ms

Test Files  8 passed (8)
     Tests  220 passed (220)
  Duration  3.93s
```

### `npm -w client run lint` — PASS

ESLint ran with zero errors or warnings. Exit code 0, no output.

### `npm run build` — PASS

Vite production build completed in ~253ms:

```
dist/index.html                   0.48 kB │ gzip:  0.30 kB
dist/assets/index-GUy2npcC.css    3.94 kB │ gzip:  1.29 kB
dist/assets/index-BnjTzzql.js   152.30 kB │ gzip: 48.79 kB
✓ built in 253ms
```

### `npm run test:setup` — PASS

All 49 project-setup validation tests passed across 9 suites (dependency checks, script checks, directory structure checks, vite config checks).

### `npm run test:server` — FAIL (pre-existing, unrelated to this task)

4 server test suites failed with `ERR_MODULE_NOT_FOUND` for `express` and `better-sqlite3`. The root cause is that server-side `node_modules` are not installed in this worktree. The WebSocket suite (ws.test.mjs) has 21 passing tests. The 4 failing test files (server.test.mjs, db.test.mjs, comments.test.mjs, cards.test.mjs) all fail because the server package's `node_modules` directory does not exist. This is a pre-existing environment issue unrelated to the CardModal component.

---

## 4. Requirements Verification

### Requirement 1 — `CardModal.jsx` exists at `client/src/components/CardModal/CardModal.jsx`

**Status: DEVIATION — file exists but at wrong path**

The task specification states the file should be created at:
```
client/src/components/CardModal/CardModal.jsx
```

The actual file location is:
```
client/src/components/Board/CardModal.jsx
```

The file was co-located with the Board component directory rather than in its own dedicated `CardModal/` subdirectory. There is no `client/src/components/CardModal/` directory at all. The CSS companion file is similarly at `client/src/components/Board/CardModal.css`.

The co-location approach is functional and the component is fully integrated and tested, but it deviates from the path specified in the task requirements.

### Requirement 2 — React Portal is used for rendering

**Status: PASS**

`createPortal` is imported from `react-dom` and used to render the modal content into `document.body`:

```js
import { createPortal } from 'react-dom'
// ...
return createPortal(
  <div className="modal-overlay" onClick={onClose}>
    ...
  </div>,
  document.body
)
```

The portal behavior is explicitly tested in the `CardModal — portal` describe block (2 tests), verifying that the modal renders outside the React root container and is cleaned up on unmount.

### Requirement 3 — Editable fields for title and assignee exist

**Status: PASS**

Both fields are implemented with a view/edit toggle pattern:
- **Title:** View mode shows an `<h2>` heading with an "Edit title" button. Edit mode shows a text `<input>` with `aria-label="Title"`, a Save button, and a Cancel button.
- **Assignee:** View mode shows a `<p>` with the assignee name (or "Unassigned" if null) and an "Edit assignee" button. Edit mode shows a text `<input>` with `aria-label="Assignee"`, a Save button, and a Cancel button.

The two fields have mutual exclusivity: opening one edit closes the other. This is implemented in both directions (opening title edit closes assignee edit; opening assignee edit closes title edit).

Both editable fields are covered by 14 tests each in the `CardModal — edit title` and `CardModal — edit assignee` describe blocks, all passing.

### Requirement 4 — Description display area exists

**Status: PASS**

The description is rendered as a read-only paragraph:

```jsx
<p className="modal-description">{card.description ?? 'No description'}</p>
```

It is styled with `font-size: 0.875rem`, `line-height: 1.5`, and appropriate color. Tests verify both the presence of a description string and the fallback "No description" text when `description` is null.

The description is read-only (display-only). The task specifies "description display area" without requiring editability, so this is compliant.

### Requirement 5 — Comments section exists

**Status: PASS**

A `<section className="modal-comments">` contains a "Comments" heading (`<h3>`), a list of comments (`<ul className="modal-comments-list">`), and a "No comments yet" fallback. Each comment item renders author, timestamp (via `toLocaleString()`), and content.

7 tests in the `CardModal — comments` describe block cover: heading presence, rendering author/content/timestamp for each comment, ordering, and the empty-state fallback.

### Requirement 6 — Save/cancel functionality for edits

**Status: PASS**

Both title and assignee edits have Save and Cancel buttons:

- **Save:** Calls `onUpdate(card.id, { field: newValue })` asynchronously. Disables buttons and shows "Saving…" while the promise is pending. Exits edit mode on success. Stays in edit mode on rejection and shows an error alert with `role="alert"`. Title save validates that the value is non-empty (shows "Title is required" without calling `onUpdate`).
- **Cancel:** Restores the original value from the `card` prop and exits edit mode without calling `onUpdate`.
- **Enter key:** In both input fields, `onKeyDown` calls the save handler when `Enter` is pressed.

All save/cancel behaviors are covered by the test suites and all tests pass.

### Requirement 7 — Delete card button with confirmation exists

**Status: PASS**

The delete flow is a two-step confirmation:
1. A "Delete" button (`className="modal-delete"`, `aria-label="Delete"`) is visible by default.
2. Clicking it shows a confirmation region with text "Are you sure you want to delete this card?" and two buttons: "Confirm delete" and "Keep card".
3. "Keep card" dismisses the confirmation and returns to normal view.
4. "Confirm delete" calls `onDelete(card.id)`. On success, calls `onClose()`. On failure, shows an error alert, dismisses the confirmation region, and returns to view mode.

8 tests in the `CardModal — delete` describe block cover all branches, all passing.

### Requirement 8 — Keyboard shortcut: Escape to close

**Status: PASS**

A `useEffect` attaches a `keydown` listener on `document`:

```js
function onKey(e) {
  if (e.key !== 'Escape') return
  if (isEditingTitle) {
    setIsEditingTitle(false); setEditTitle(card.title); setSaveError(null)
  } else if (isEditingAssignee) {
    setIsEditingAssignee(false); setEditAssignee(card.assignee ?? ''); setSaveError(null)
  } else {
    onClose()
  }
}
document.addEventListener('keydown', onKey)
return () => document.removeEventListener('keydown', onKey)
```

The Escape key behavior is contextual:
- When a field is being edited: cancels the edit (does not close the modal).
- When no field is being edited: closes the modal by calling `onClose()`.

Three tests verify this behavior:
- `calls onClose when Escape key is pressed` (base modal close)
- `Escape key cancels title edit without closing modal`
- `Escape key cancels assignee edit without closing modal`

All three pass.

### Requirement 9 — Backdrop blur and centered positioning styling

**Status: PASS**

In `CardModal.css`:

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;      /* vertical centering */
  justify-content: center;  /* horizontal centering */
  z-index: 100;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: modal-fade-in 150ms ease;
}

.modal-content {
  background: #fff;
  border-radius: 8px;
  padding: 1.5rem;
  max-width: 480px;
  width: 90%;
  position: relative;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  max-height: 90vh;
  overflow-y: auto;
}
```

- `backdrop-filter: blur(4px)` with the `-webkit-` vendor prefix satisfies the backdrop blur requirement.
- `display: flex; align-items: center; justify-content: center` on a `position: fixed; inset: 0` overlay satisfies the centered positioning requirement.
- Entrance animations are present (`modal-fade-in` on overlay, `modal-slide-in` on content).
- A responsive mobile bottom-sheet layout is provided via `@media (max-width: 600px)`.

---

## 5. Code Review Findings

### Finding 1 — DEVIATION: File location does not match task specification

**Severity: Minor**
**File:** `kanban/client/src/components/Board/CardModal.jsx`

The task specification explicitly states: *"Create `client/src/components/CardModal/CardModal.jsx`"*. The implementation places the file at `client/src/components/Board/CardModal.jsx` alongside the Board, Column, and CardTile components. There is no `CardModal/` subdirectory.

Co-locating with Board components is a defensible architectural choice (the modal is tightly coupled to the Board feature), but it does not match the specified path. The companion CSS and test files are also in the Board directory (`CardModal.css`, `CardModal.test.jsx`).

### Finding 2 — INFO: `card.comments` is accessed without null guard

**Severity: Low**
**File:** `kanban/client/src/components/Board/CardModal.jsx`, line 188

```jsx
{card.comments.length === 0 ? (
```

The component accesses `card.comments.length` directly. If `card.comments` is `undefined` or `null`, this will throw a `TypeError` at render time. The test fixture always provides `comments: []`, so this is not caught by tests. In production, if the API returns a card without a `comments` field (e.g., a response missing the comments relation), the modal will crash.

A safe guard such as `{(card.comments ?? []).length === 0 ?` or `{!card.comments?.length ?` would prevent this. Similarly, the `card.comments.map(...)` on line 191 shares this risk.

### Finding 3 — INFO: The `editTitle` and `editAssignee` states are not reset when `card` prop changes

**Severity: Low**
**File:** `kanban/client/src/components/Board/CardModal.jsx`

The component uses `useState(card.title)` and `useState(card.assignee ?? '')` to initialize edit state. If the parent component updates the `card` prop (e.g., a successful save returns an updated card object), the internal edit state will still hold the previous `editTitle`/`editAssignee` values. While the save flow correctly calls `setIsEditingTitle(false)` on success (which hides the input), if the parent re-renders with a new card value while editing is open, the input may display a stale value.

This is a common React pattern limitation. A `useEffect` syncing from `card.title` and `card.assignee` to the local state when not in edit mode would mitigate it.

The Board component (`Board.jsx`) does pass the live card reference from `useBoard` state to `CardModal`, so this scenario can occur in the integration between Task 9 (useBoard) and Task 11 (CardModal). The Board test at line 122 (`'modal reflects updated card data when useBoard cards state changes'`) verifies the *displayed* title updates on re-render, which works because the view-mode path reads from `card.title` directly. The potential issue is in the edit-mode input value.

### Finding 4 — INFO: No `aria-live` or focus trap for the modal

**Severity: Low (accessibility)**
**File:** `kanban/client/src/components/Board/CardModal.jsx`

The modal uses `role="dialog"` and `aria-modal="true"`, which is correct. However:
1. There is no focus trap: keyboard navigation (Tab) will escape the modal boundary and reach elements behind the overlay.
2. Focus is not moved to the modal on open (e.g., to the close button or the first interactive element).
3. After close, focus is not restored to the triggering element (the CardTile button).

These are WCAG 2.1 guidelines for modal dialogs (ARIA Practices Guide §3.8). They do not affect the stated task requirements but represent potential accessibility issues in production use.

### Finding 5 — INFO: Overlay click-to-close does not suppress during save/delete operations

**Severity: Low**
**File:** `kanban/client/src/components/Board/CardModal.jsx`, line 90

```jsx
<div className="modal-overlay" onClick={onClose}>
```

The overlay click always calls `onClose`, even while a save (`isSaving`) or delete (`isDeleting`) operation is in flight. A user could dismiss the modal mid-save, potentially losing the save's result. The inner content correctly stops propagation (`onClick={e => e.stopPropagation()}`), but the overlay itself has no guard. Adding a condition like `onClick={() => { if (!isSaving && !isDeleting) onClose() }}` would prevent premature dismissal.

---

## 6. Overall Assessment

The CardModal component is a well-implemented, fully-functional modal with all required behaviors present and tested. All 220 client tests pass, lint reports zero violations, and the production build succeeds.

The primary structural deviation is the file location: the component was created at `client/src/components/Board/CardModal.jsx` instead of the specified `client/src/components/CardModal/CardModal.jsx`. This does not affect functionality but represents a non-compliance with the task specification.

Findings 2–5 are informational observations. None represent bugs that currently cause test failures or build failures.

---

## 7. Summary Table

| Check | Result |
|---|---|
| File path: `client/src/components/CardModal/CardModal.jsx` | DEVIATION (at `Board/CardModal.jsx` instead) |
| React Portal (`createPortal`) used | PASS |
| Editable title field with save/cancel | PASS |
| Editable assignee field with save/cancel | PASS |
| Description display area (read-only) | PASS |
| Comments section with list and empty state | PASS |
| Save functionality (async, loading state, error state) | PASS |
| Cancel functionality (restores original value) | PASS |
| Delete button with confirmation dialog | PASS |
| Escape key to close modal | PASS |
| Escape key cancels edit without closing modal | PASS |
| Backdrop blur styling (`backdrop-filter: blur(4px)`) | PASS |
| Centered positioning (flexbox on fixed overlay) | PASS |
| `npm -w client run test` (220 tests) | PASS |
| `npm -w client run lint` | PASS |
| `npm run build` | PASS |
| `npm run test:setup` (49 tests) | PASS |
| `npm run test:server` | FAIL (pre-existing: server `node_modules` not installed) |

**Overall Status: PASS with one minor deviation (file path)**

The implementation is complete, well-tested, and fully functional. The only requirement not strictly met is the output file path; all behavioral requirements are correctly implemented.
