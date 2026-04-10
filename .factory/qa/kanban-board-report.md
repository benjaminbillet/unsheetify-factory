# QA Report — Task 15: Create CommentList Component

**Date:** 2026-04-10
**Reviewer:** QA Agent
**Task:** Create CommentList component showing chronological comments with author names, timestamps, and a new-comment form
**Branch:** kanban-board/kanban-board-15
**Status:** PASS

---

## 1. Project Structure Overview

```
kanban-board-15/
└── kanban/
    ├── package.json              (workspace root: "kanban-app")
    ├── client/
    │   ├── package.json          (kanban-client)
    │   ├── eslint.config.js
    │   ├── vite.config.js        (test: vitest, environment: jsdom)
    │   └── src/
    │       ├── components/
    │       │   ├── CardModal/
    │       │   │   ├── CommentList.jsx        ← primary file under review
    │       │   │   ├── CommentList.css        ← styles under review
    │       │   │   └── CommentList.test.jsx   ← test suite (32 tests)
    │       │   └── Board/
    │       │       ├── CardModal.jsx          ← integration point (uses CommentList)
    │       │       ├── Board.jsx / Column.jsx / CardTile.jsx (+ tests, CSS)
    │       ├── hooks/useBoard.js + useWebSocket.js (with tests)
    │       ├── api/client.js + client.test.js
    │       └── App.jsx + App.test.jsx
    ├── server/
    │   ├── package.json
    │   └── test/ (server.test.mjs, db.test.mjs, comments.test.mjs, ws.test.mjs, cards.test.mjs)
    └── test/
        ├── setup.test.mjs
        └── client.setup.test.mjs
```

No TypeScript in this project (no typecheck command). No Makefile.

---

## 2. Commands Found and Executed

| Command | Location | Script | Scope |
|---|---|---|---|
| `npm -w client run test` | `kanban/package.json` (via workspace) | `vitest run` | All client tests |
| `npm -w client run lint` | `kanban/package.json` (via workspace) | `eslint src` | Client source |
| `npm run build` | `kanban/package.json` | `npm -w client run build` | Client production build |
| `npm run test:setup` | `kanban/package.json` | `node --test test/*.test.mjs` | Project setup validation |
| `npm -w server run test` | `kanban/package.json` (via workspace) | `node --test test/server.test.mjs ...` | Server tests |

No Makefile or typecheck script was found.

---

## 3. Command Results

### `npm -w client run test` — PASS

All 252 tests across 9 test files passed. The `CommentList.test.jsx` suite contributed 32 tests:

```
✓ src/api/client.test.js                               (27 tests)   22ms
✓ src/hooks/useWebSocket.test.js                       (42 tests)   54ms
✓ src/components/Board/Column.test.jsx                  (6 tests)   74ms
✓ src/components/Board/CardTile.test.jsx                (9 tests)   86ms
✓ src/App.test.jsx                                      (4 tests)   63ms
✓ src/components/Board/Board.test.jsx                  (13 tests)  151ms
✓ src/components/CardModal/CommentList.test.jsx        (32 tests)  219ms
✓ src/components/Board/CardModal.test.jsx              (55 tests)  392ms
✓ src/hooks/useBoard.test.js                           (64 tests) 3046ms

Test Files  9 passed (9)
     Tests  252 passed (252)
  Duration  3.94s
```

### `npm -w client run lint` — PASS

ESLint ran with zero errors or warnings. Exit code 0, no output.

### `npm run build` — PASS

Vite production build completed in ~244ms:

```
dist/index.html                   0.48 kB │ gzip:  0.30 kB
dist/assets/index-ov8iTJUc.css    4.56 kB │ gzip:  1.42 kB
dist/assets/index-D6iMcK6D.js   153.52 kB │ gzip: 49.22 kB
✓ built in 244ms
```

### `npm run test:setup` — PASS

All 49 project-setup validation tests passed across 9 suites (dependency checks, script checks, directory structure checks, vite config checks).

### `npm -w server run test` — PASS (after dependency installation)

Server `node_modules` were not pre-installed in this worktree. After running `npm install --workspace=server`, all 146 server tests passed across 27 suites with 0 failures. The dependency-missing state is a worktree environment issue, not an artifact of this task's implementation. Post-install result:

```
# tests 146
# suites 27
# pass 146
# fail 0
# duration_ms 2811ms
```

---

## 4. Requirements Verification

### Requirement 1 — `CommentList.jsx` exists at `client/src/components/CardModal/CommentList.jsx`

**Status: PASS**

The file is present at the exact specified path:
```
kanban/client/src/components/CardModal/CommentList.jsx
```

Companion files are also in place:
- `kanban/client/src/components/CardModal/CommentList.css`
- `kanban/client/src/components/CardModal/CommentList.test.jsx`

### Requirement 2 — Shows comments in chronological order

**Status: PASS**

The component sorts the input `comments` array before rendering:

```js
const sorted = [...comments].sort((a, b) => a.created_at - b.created_at)
```

This is an ascending (oldest-first) sort by the `created_at` Unix timestamp in milliseconds. The original array is not mutated (a copy is spread before sorting).

This behavior is explicitly tested:

```js
it('renders comments in chronological order even when input is out of order', () => {
  const outOfOrder = [comments[1], comments[0]]
  render(<CommentList comments={outOfOrder} onAddComment={noop} />)
  const items = screen.getAllByTestId('comment')
  expect(items[0]).toHaveTextContent('Looks good!')  // cm1, older, first
  expect(items[1]).toHaveTextContent('Needs work')   // cm2, newer, second
})
```

Test passes.

### Requirement 3 — Includes author names and timestamps

**Status: PASS**

Each comment list item renders both:

```jsx
<li key={cm.id} data-testid="comment" className="comment-item">
  <div className="comment-meta">
    <span className="comment-author">{cm.author}</span>
    <time className="comment-time" dateTime={new Date(cm.created_at).toISOString()}>
      {formatRelativeTime(cm.created_at)}
    </time>
  </div>
  <p className="comment-content">{cm.content}</p>
</li>
```

- Author name is rendered in a `<span className="comment-author">`.
- Timestamp is rendered in a semantic `<time>` element with an ISO 8601 `dateTime` attribute for machine-readability and a human-readable relative string as its visible content.

Both are covered by passing tests verifying author text content and `<time>` element `dateTime` attribute values.

### Requirement 4 — Form for creating new comments with author name input and comment textarea

**Status: PASS**

A `<form className="comment-form">` is rendered below the comment list with:

1. **Author name input:** `<input type="text" aria-label="Author name" />`
2. **Comment textarea:** `<textarea aria-label="Comment" rows={3} />`
3. **Submit button:** `<button type="submit">Add Comment</button>`

Validation is implemented:
- Empty author name: shows `"Author name is required"` (with `role="alert"`) without calling `onAddComment`.
- Empty comment text (with author filled): shows `"Comment text is required"` without calling `onAddComment`.

On successful submission, `onAddComment({ author: author.trim(), content: content.trim() })` is called and form fields are cleared. On rejection, an error message is shown and field values are preserved.

All form behaviors are covered by 11 tests, all passing.

### Requirement 5 — Timestamps formatted in relative format (e.g., '2 hours ago')

**Status: PASS**

A standalone exported function `formatRelativeTime(timestamp)` handles relative formatting:

```js
export function formatRelativeTime(timestamp) {
  const diff    = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours   = Math.floor(minutes / 60)
  const days    = Math.floor(hours / 24)

  if (seconds < 60)  return 'just now'
  if (minutes < 60)  return minutes === 1 ? '1 minute ago'  : `${minutes} minutes ago`
  if (hours   < 24)  return hours   === 1 ? '1 hour ago'    : `${hours} hours ago`
  if (days    === 1) return 'yesterday'
  if (days    < 30)  return `${days} days ago`
  return new Date(timestamp).toLocaleDateString()
}
```

The function covers: `'just now'` (< 60s), `'N minute(s) ago'` (< 1h), `'N hour(s) ago'` (< 24h), `'yesterday'` (24–47h), `'N days ago'` (2–29 days), and `toLocaleDateString()` fallback for 30+ days.

The function is thoroughly tested with 14 unit tests using `vi.useFakeTimers()` / `vi.setSystemTime()` for deterministic results. An integration test also verifies that "2 hours ago" appears inside the rendered `<time>` element.

All 14 `formatRelativeTime` tests pass.

### Requirement 6 — Handles empty comment state

**Status: PASS**

When `comments` is an empty array, the component renders a fallback paragraph instead of the list:

```jsx
{sorted.length === 0 ? (
  <p className="comment-list-empty">No comments yet</p>
) : (
  <ul className="comment-list-items">...</ul>
)}
```

Two tests cover the empty state:
- `'renders "No comments yet" when comments array is empty'` — passes.
- `'does not render "No comments yet" when comments exist'` — passes.

### Requirement 7 — Proper styling for comment threads

**Status: PASS**

`CommentList.css` defines a complete styling set for the comment thread:

- `.comment-list`: top border separator with padding, creating visual section separation.
- `.comment-list-items`: flex column layout with `gap: 0.75rem` between comment items — this directly styles the "comment thread" appearance.
- `.comment-item`: uniform font size per item.
- `.comment-meta`: flex row with gap for author + timestamp inline display.
- `.comment-author`: semi-bold weight in dark color for emphasis.
- `.comment-time`: slightly smaller font for visual hierarchy.
- `.comment-content`: body text color.
- `.comment-form`: flex column layout for input, textarea, and submit button.
- `.comment-form-error`: red error text.
- Form input/textarea: consistent border, padding, border-radius, font inheritance.
- Submit button: hover state, disabled state with opacity/cursor styling.

---

## 5. Code Review Findings

### Finding 1 — INFO: No `placeholder` attributes on form inputs

**Severity: Low**
**File:** `kanban/client/src/components/CardModal/CommentList.jsx`

The author name `<input>` and comment `<textarea>` use `aria-label` for accessibility (correct) but have no `placeholder` attribute. Placeholders provide a quick in-context hint about expected values (e.g., `"Your name"`, `"Write a comment…"`). Their absence does not break functionality but reduces visual discoverability for first-time users.

### Finding 2 — INFO: `comments` prop is not validated with PropTypes or TypeScript

**Severity: Low**
**File:** `kanban/client/src/components/CardModal/CommentList.jsx`

The component accesses `comments` with `[...comments].sort(...)` without a null/undefined guard. If the parent passes `undefined` or `null` for `comments` (e.g., before the card data loads), the spread operator will throw a `TypeError`. The existing parent (`CardModal.jsx`) always passes `card.comments`, and the server always returns a `comments` array, so this is not currently triggered. A defensive default parameter (`{ comments = [], onAddComment }`) or an early guard would prevent this edge case.

### Finding 3 — INFO: `isSubmitting` state disables inputs but does not visually disable the author input

**Severity: Low**
**File:** `kanban/client/src/components/CardModal/CommentList.jsx`

Both the author `<input>` and the `<textarea>` correctly set `disabled={isSubmitting}`. The CSS includes `.comment-form button[type="submit"]:disabled { opacity: 0.6; cursor: not-allowed; }` for the button, but there is no matching CSS rule for `input:disabled` or `textarea:disabled`. While the browser applies its own default disabled styling (typically grayed-out text), the visual treatment may be inconsistent with the button's explicit style. This is a minor visual polish issue.

### Finding 4 — INFO: No `id`/`htmlFor` association between labels and inputs

**Severity: Low (accessibility)**
**File:** `kanban/client/src/components/CardModal/CommentList.jsx`

The form uses `aria-label` on inputs directly, which correctly associates accessible names. However, there are no visible `<label>` elements. In some design systems, visible labels are preferred over `aria-label` for discoverability and usability. The testing library queries by `aria-label` and all tests pass, confirming the current approach is functionally accessible. This is noted as an enhancement opportunity rather than a defect.

### Finding 5 — INFO: `formatRelativeTime` is exported and well-decoupled for reuse

**Severity: Positive observation**

The timestamp formatting function is exported as a named export, allowing it to be unit-tested independently and reused in other components if needed. This is a good separation of concerns.

---

## 6. Overall Assessment

The CommentList component fully satisfies all task requirements. The file exists at the exact specified path, comments render in chronological order with author names and relative timestamps, the creation form includes both required inputs with validation and loading/error states, the empty state is handled gracefully, and the styling provides a clean comment thread appearance.

All 252 client tests pass, ESLint reports zero violations, and the Vite production build succeeds. Server tests also pass after installing the missing server-side dependencies (a pre-existing worktree environment issue unrelated to this task).

The four findings above are informational observations. None cause test failures or build failures.

---

## 7. Summary Table

| Check | Result |
|---|---|
| File path: `client/src/components/CardModal/CommentList.jsx` | PASS |
| Comments displayed in chronological order | PASS |
| Author names displayed per comment | PASS |
| Timestamps displayed per comment | PASS |
| Form with author name input | PASS |
| Form with comment textarea | PASS |
| Relative timestamp format (e.g., '2 hours ago') | PASS |
| Empty comment state handled ("No comments yet") | PASS |
| Proper styling for comment thread | PASS |
| Form validation (empty author / empty content) | PASS |
| Form submit calls `onAddComment` with `{ author, content }` | PASS |
| Form clears on successful submission | PASS |
| Error state shown when `onAddComment` rejects | PASS |
| Loading/disabled state while submitting | PASS |
| `npm -w client run test` (252 tests) | PASS |
| `npm -w client run lint` | PASS |
| `npm run build` | PASS |
| `npm run test:setup` (49 tests) | PASS |
| `npm -w server run test` (146 tests) | PASS (after `npm install --workspace=server`) |

**Overall Status: PASS**

All requirements are met. The implementation is complete, well-tested, and production-ready.
