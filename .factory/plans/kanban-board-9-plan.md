# Plan: Implement `useBoard` Hook (Task 9)

## Context

The kanban board client needs a React hook to manage board state. The API client layer (Task 8) already exists at `client/src/api/client.js` and exposes `fetchCards`, `createCard`, `updateCard`, `deleteCard`, and `createComment`. This hook bridges that API layer and the UI by grouping cards into columns, supporting optimistic updates for fast perceived performance, and managing loading/error states.

**Key mapping detail:** The API returns `column: 'in-progress'` (hyphen), but the state must use `in_progress` (underscore) as a JS key to match the task spec `{ready: [], in_progress: [], done: []}`. The hook's `moveCard` calls `apiUpdateCard` (no `moveCard` in the client API).

**Column value convention:** All hook functions that accept a column name (`createCard`, `moveCard`) expect the **API column format** (`'ready'`, `'in-progress'`, `'done'` — with hyphen), not the state key format. The state key format (`in_progress`) is only used to access the `cards` state object. Each card's `.column` field also retains the API format, so consumers can pass `card.column` directly to `moveCard`.

**`updateCard` scope:** The `updateCard` function is for updating card properties (title, assignee, description, position) only. It must **not** be used to change the column — that is `moveCard`'s responsibility. The `updateCard` implementation should strip any `column` property from the incoming `data` before applying it to prevent cards ending up in the wrong column bucket.

---

## Files to Create

| File | Purpose |
|---|---|
| `client/src/hooks/useBoard.js` | Hook implementation |
| `client/src/hooks/useBoard.test.js` | All tests (TDD, written before implementation per subtask) |

No existing files need modification.

---

## TDD Execution Order

For each subtask: write failing tests → run (`npm --prefix client test -- --run useBoard`) to confirm red → implement → re-run to confirm green → refactor.

---

## Subtask 1 — Basic state structure and initial data loading

### Tests to write first (`useBoard.test.js` — Subtask 1 block)

**Mock setup note:** Subtask 1 tests that need a pending fetch use `api.fetchCards.mockReturnValue(new Promise(() => {}))` (a never-resolving Promise) so the test can inspect state mid-fetch. Tests that need a completed fetch use `api.fetchCards.mockResolvedValue([...])`. Each `describe` block must have `afterEach(() => vi.clearAllMocks())`.

**RTL timing note:** `renderHook` wraps the initial render in `act()`, which flushes synchronous React work. `useEffect` fires during this `act()` and calls `beginOp()` (sync), but the `fetchCards()` Promise `.then()` is a microtask that may not flush until `waitFor` polls. Always use `await waitFor(...)` when checking async state changes; check initial `useState` values (like `cards` and `error`) synchronously right after `renderHook` with a never-resolving fetch mock.

```
describe('initial state structure', () => {
  // Use a never-resolving fetchCards so these check raw useState initial values
  beforeEach(() => { api.fetchCards.mockReturnValue(new Promise(() => {})) })
  afterEach(() => vi.clearAllMocks())

  it('cards starts as { ready: [], in_progress: [], done: [] }')
  it('error is null before any fetch completes')
})

describe('initial data loading', () => {
  afterEach(() => vi.clearAllMocks())

  it('loading is true while fetchCards is pending', async () => {
    // Use never-resolving mock; check loading with waitFor
    api.fetchCards.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(true))
  })
  it('loading is false after fetchCards resolves', async () => {
    api.fetchCards.mockResolvedValue([])
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
  })
  it('groups fetched cards into ready, in_progress, done keys')
  it('maps API column "in-progress" to state key "in_progress"')
  it('sorts cards by position ascending within each column')
  it('sets error message when fetchCards rejects')
  it('sets loading to false when fetchCards rejects')
})
```

### Implementation (`useBoard.js` — Subtask 1)

- `import { useState, useEffect, useCallback, useRef } from 'react'`
- `import { fetchCards, createCard as apiCreateCard, updateCard as apiUpdateCard, deleteCard as apiDeleteCard, createComment } from '../api/client.js'`
- Helper `columnToKey(col)`: `'in-progress'` → `'in_progress'`, others pass through
- Helper `groupCards(cards)`: builds `{ ready:[], in_progress:[], done:[] }`, pushes each card into its key, sorts each array by `position`
- `EMPTY_BOARD = { ready: [], in_progress: [], done: [] }`
- Hook state: `const [cards, setCards] = useState(EMPTY_BOARD)`; `const [loading, setLoading] = useState(false)`; `const [error, setError] = useState(null)`
- **Per-operation loading counter:** `const pendingRef = useRef(0)` (not state — avoids stale closure issues). Two internal helpers: `beginOp()` (increments counter, calls `setLoading(true)`) and `endOp()` (decrements counter, calls `setLoading(false)` only when counter reaches 0). The initial fetch AND all CRUD operations use these helpers so `loading` is `true` whenever **any** operation is in flight.
- `useEffect` on mount: call `beginOp()`, set `error=null`, call `fetchCards()`, on success call `setCards(groupCards(data))` + `endOp()`, on error set `setError(err.message)` + `endOp()`. Use a `cancelled` flag in cleanup to prevent state updates after unmount.
- Return `{ cards, loading, error }`

---

## Subtask 2 — Optimistic updates for card operations

### Tests to write first (`useBoard.test.js` — Subtask 2 block)

All tests use a pre-loaded board. Each `describe` block must have:
- `beforeEach(() => { vi.mocked(api.fetchCards).mockResolvedValue(FIXTURE_CARDS) })` (or per-test overrides)
- `afterEach(() => vi.clearAllMocks())` to reset call history and prevent test pollution

After rendering the hook, wait for the initial load to complete before exercising operations:
```js
const { result } = renderHook(() => useBoard())
await waitFor(() => expect(result.current.loading).toBe(false))
```
This ensures initial fetch is settled before the test starts mutating state.

```
describe('createCard', () => {
  it('immediately adds an optimistic card to the correct column')
  it('defaults to "ready" column when no column is provided in data')
  it('replaces optimistic card with server card on API success')
  it('removes optimistic card on API failure (rollback)')
  it('throws the error on API failure')
  it('returns the created card on success')
})

describe('updateCard', () => {
  it('immediately applies updated fields to card in state')
  it('does not move card to another column if column property is passed (ignores column in data)')
  it('replaces optimistic update with server response on success')
  it('restores previous card state on API failure (rollback)')
  it('throws the error on API failure')
})

describe('deleteCard', () => {
  it('immediately removes card from state')
  it('restores deleted card on API failure (rollback)')
  it('throws the error on API failure')
})

describe('moveCard', () => {
  it('immediately moves card from source column to target column')
  it('updates card column field optimistically')
  it('replaces optimistic state with server response on success')
  it('restores card to original column on API failure (rollback)')
  it('throws the error on API failure')
})

describe('addComment', () => {
  it('optimistically adds a temp comment to the card')
  it('replaces temp comment with server comment on success')
  it('removes temp comment on API failure (rollback)')
  it('throws the error on API failure')
  it('returns the created comment on success')
})
```

### Implementation (`useBoard.js` — Subtask 2)

**`beginOp`/`endOp` are plain (non-memoised) functions defined inside the hook body** right after `pendingRef` is declared. They close over `pendingRef` and the stable `setLoading` setter:
```js
function beginOp() { pendingRef.current++; setLoading(true) }
function endOp()   { if (--pendingRef.current === 0) setLoading(false) }
```
They do NOT need to be in the hook's return value.

**Test pattern for checking optimistic (in-flight) state:** To observe state immediately after an optimistic update but before the API resolves, start the operation inside `act(() => void ...)` and check `result.current` synchronously after:
```js
let resolveApi
api.createCard.mockReturnValue(new Promise(r => { resolveApi = r }))
// ... render and wait for initial load ...
act(() => void result.current.createCard({ title: 'New', column: 'ready' }))
// Optimistic state is visible now — loading is true, card is in cards.ready
expect(result.current.cards.ready).toHaveLength(2)
// Resolve API and check final state
await act(async () => resolveApi(serverCard))
expect(result.current.cards.ready.find(c => c.id === serverCard.id)).toBeTruthy()
```
The `void` discards the returned Promise so `act()` does not await it, freezing the state mid-flight.

**Rollback pattern (used by updateCard, deleteCard, moveCard):**
```js
let rollback = null
setCards(prev => { rollback = prev; return /* new optimistic state */ })
try {
  const result = await apiCall(...)
  setCards(/* replace with server result */)
  return result
} catch (err) {
  setCards(rollback)
  throw err
}
```

**Temp-ID pattern (used by createCard, addComment):** module-level counter `let _tempId = 0`; `function nextTempId() { return '__temp_' + (++_tempId) }`

**`createCard(data)`** — `useCallback(async (data) => {...}, [])`:
1. Generate `tempId`, derive `key = columnToKey(data.column ?? 'ready')`
2. Build `optimisticCard` with temp id, `Infinity` position, empty comments
3. `setCards(prev => ({ ...prev, [key]: [...prev[key], optimisticCard] }))`
4. Call `beginOp()` before API call; call `endOp()` in both success and failure paths (try/finally)
5. `await apiCreateCard(data)` → on success: `setCards` to remove temp by id and insert server card (sort by position); on failure: `setCards` to filter out temp, then re-throw

**`updateCard(id, data)`** — rollback pattern:
- Compute `safeData = { ...data }; delete safeData.column` (strip any `column` property — column changes must go through `moveCard`)
- Call `beginOp()` before API call; call `endOp()` in both success and failure paths (use try/finally)
- Optimistic: map over all columns replacing matching `id` with `{ ...card, ...safeData }`
- API call: `apiUpdateCard(id, safeData)` — pass `safeData` (not original `data`) so the server never receives a column change through this path
- Success: replace with `updated` server card
- Failure: restore rollback

**`deleteCard(id)`** — rollback pattern:
- Call `beginOp()` before API call; call `endOp()` in both success and failure paths (try/finally)
- Optimistic: filter out card with `id` from all columns
- Success: nothing extra needed
- Failure: restore rollback

**`moveCard(id, targetColumn, position)`** — rollback pattern:
- `targetColumn` is an API column value (`'ready'`, `'in-progress'`, `'done'`), NOT a state key
- `targetKey = columnToKey(targetColumn)`
- Call `beginOp()` before API call; call `endOp()` in both success and failure paths (try/finally)
- Optimistic: find card in current column, remove it, add `{ ...card, column: targetColumn, position: position ?? card.position }` to `targetKey`, sort
- API call: `apiUpdateCard(id, { column: targetColumn, ...(position !== undefined && { position }) })`
- Success: remove card from all columns, add `updated` server card to `columnToKey(updated.column)`, sort
- Failure: restore rollback

**`addComment(cardId, data)`** — temp-ID pattern:
1. Build `optimisticComment` with temp id
2. `setCards`: map over all columns, for matching `cardId` append `optimisticComment` to `card.comments`
3. Call `beginOp()` before API call; call `endOp()` in both success and failure paths (try/finally)
4. `await createComment(cardId, data)` → success: replace temp comment with real one; failure: remove temp comment and re-throw

---

## Subtask 3 — Error handling and loading states

### Tests to write first (`useBoard.test.js` — Subtask 3 block)

```
describe('error state', () => {
  it('error is null initially')
  it('error is set to err.message when fetchCards rejects')
  it('error remains null when fetchCards succeeds')
})

describe('loading state — initial fetch', () => {
  // Use a never-resolving mock to check in-flight state; await waitFor for async assertions
  it('loading is true while fetchCards is in flight')
  it('loading is false after fetchCards resolves successfully')
  it('loading is false after fetchCards rejects')
})

describe('loading state — individual operations', () => {
  // Each of these confirms loading becomes true during the pending API call
  // and false after it resolves or rejects. Use a never-settling Promise
  // to capture the in-flight loading=true moment.
  it('loading becomes true while createCard API call is pending')
  it('loading returns to false after createCard succeeds')
  it('loading returns to false after createCard fails')
  it('loading becomes true while updateCard API call is pending')
  it('loading returns to false after updateCard completes')
  it('loading becomes true while deleteCard API call is pending')
  it('loading returns to false after deleteCard completes')
  it('loading becomes true while moveCard API call is pending')
  it('loading returns to false after moveCard completes')
  it('loading becomes true while addComment API call is pending')
  it('loading returns to false after addComment completes')
})

describe('operation error propagation', () => {
  it('createCard re-throws API error after rollback')
  it('updateCard re-throws API error after rollback')
  it('deleteCard re-throws API error after rollback')
  it('moveCard re-throws API error after rollback')
  it('addComment re-throws API error after rollback')
})
```

### Implementation notes (Subtask 3)

The `beginOp`/`endOp` counter pattern already added in Subtask 2 satisfies the per-operation loading requirement. These tests verify that contract explicitly.

**Retry mechanism:** Explicit retry infrastructure is not required. The rollback pattern already constitutes the retry mechanism — after any failed operation, state is fully restored to its pre-operation snapshot, leaving the hook in a clean state so the caller can simply call the function again to retry. No additional retry logic needed.

The `cancelled` flag in `useEffect` from Subtask 1 prevents stale-closure state updates after unmount (guards against test teardown warnings).

---

## Subtask 4 — State structure for efficient column-based rendering

### Tests to write first (`useBoard.test.js` — Subtask 4 block)

```
describe('state shape', () => {
  it('cards object has exactly the keys: ready, in_progress, done')
  it('each column key holds an array')
  it('cards in each column have their .column field preserved as-is from API')
  it('in_progress column contains cards with column === "in-progress"')
  it('cards within a column are sorted by position ascending')
  it('cards with equal positions maintain stable relative order')
})

describe('helper: columnToKey', () => {
  // Exported for direct testing
  it('returns "in_progress" for "in-progress"')
  it('returns "ready" for "ready"')
  it('returns "done" for "done"')
})
```

### Implementation notes (Subtask 4)

- Export `columnToKey` as a named export so it can be tested directly
- Verify `groupCards` produces exactly `{ ready, in_progress, done }` — no extra keys
- Cards' `.column` field retains the original API value (e.g. `'in-progress'`), only the *state key* is mapped to `'in_progress'`
- Ensure `sort` uses a stable comparator `(a, b) => a.position - b.position`

---

## Test File Structure

```
client/src/hooks/useBoard.test.js

imports:
  { renderHook, act, waitFor } from '@testing-library/react'
  { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
  { useBoard, columnToKey } from './useBoard.js'
  * as api from '../api/client.js'

vi.mock('../api/client.js', () => ({
  fetchCards: vi.fn(),
  createCard: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  createComment: vi.fn(),
}))

// Shared fixture cards
const FIXTURE_CARDS = [
  { id: 'r1', title: 'Ready One',    column: 'ready',       position: 1, assignee: null, description: null, created_at: 1000, comments: [] },
  { id: 'p1', title: 'In Progress',  column: 'in-progress', position: 1, assignee: null, description: null, created_at: 1000, comments: [] },
  { id: 'd1', title: 'Done One',     column: 'done',        position: 1, assignee: null, description: null, created_at: 1000, comments: [] },
]
```

---

## Verification

Run all client tests:
```bash
npm --prefix /Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-9/kanban/client test -- --run
```

Run only the hook tests:
```bash
npm --prefix /Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-9/kanban/client test -- --run useBoard
```

Expected: all tests in `useBoard.test.js` pass green, no regressions in `App.test.jsx` or `api/client.test.js`.

### Manual smoke-test (optional):
- Start dev server (`npm run dev` in monorepo root)
- Open browser console and verify no errors on load
- The hook will be wired into Board component in a later task

---

## Critical Files

| Path | Role |
|---|---|
| `client/src/hooks/useBoard.js` | **Create** — hook implementation |
| `client/src/hooks/useBoard.test.js` | **Create** — TDD test suite |
| `client/src/api/client.js` | **Read-only** — source of `fetchCards`, `createCard`, `updateCard`, `deleteCard`, `createComment` and `ApiError` |
| `client/vite.config.js` | **Read-only** — Vitest config (globals:true, jsdom, setupFiles) |
| `client/src/test-setup.js` | **Read-only** — imports `@testing-library/jest-dom` |
