# Task 19: Integrate Real-Time Updates into useBoard Hook

## Context

The Kanban board has a functioning `useWebSocket` hook and a `useBoard` hook, but they are not connected. When any client mutates a card or comment, the server broadcasts a WebSocket event to all connected clients — but `useBoard` ignores these events, so only the acting client sees changes (via optimistic update). This task wires the two hooks together so all connected clients stay synchronized in real time.

Key constraints:
- `useWebSocket` (in `hooks/useWebSocket.js`) takes a URL, `{ onEvent, events }` options, and returns `{ status, disconnect }`. It uses internal callback refs so changing `onEvent` does **not** cause reconnection.
- The WebSocket server is mounted at `/ws` on the same origin (Vite dev proxy forwards to `ws://localhost:3001`).
- WS event payloads: `card:created`, `card:updated`, `card:moved` carry full Card objects **without** `comments`. `card:deleted` carries `{ id }`. `comment:created` carries a full Comment object.
- The existing `useBoard` already applies optimistic updates locally. When the originating client's WS event arrives, it must be **suppressed** to prevent duplicate state changes.

**Critical architecture note — `card:updated` vs `card:moved`:**
The server has two separate PATCH endpoints:
- `PATCH /api/cards/:id` → broadcasts `card:updated` (handles all field updates including `column` and `position`)
- `PATCH /api/cards/:id/move` → broadcasts `card:moved` (fractional positioning logic, separate endpoint)

The current client's `moveCard` hook calls `apiUpdateCard(id, { column, position })` → `PATCH /api/cards/:id` → broadcasts **`card:updated`** (not `card:moved`). Therefore:
- Cross-client card move synchronization happens via `card:updated` events, which **can carry column changes**
- The `card:updated` handler must correctly move cards between column arrays when `payload.column` differs from the card's current column
- `card:moved` events are handled for correctness (e.g., direct API use, Postman, future client changes) but are not triggered by the current web client's `moveCard` action

---

## Critical Files

| File | Action |
|------|--------|
| `kanban/client/src/hooks/useBoard.js` | **Modify** — add WS integration, event handlers, deduplication, reconnect refetch |
| `kanban/client/src/hooks/useBoard.test.js` | **Modify** — add `vi.mock` for useWebSocket, new describe blocks for all WS behavior |
| `kanban/client/src/hooks/useWebSocket.js` | Read-only reference |
| `kanban/client/src/api/client.js` | Read-only reference (reuses `fetchCards`) |

---

## Existing Utilities to Reuse

- `columnToKey(col)` — exported from `useBoard.js`, converts `'in-progress'` → `'in_progress'`
- `groupCards(cards)` — module-level in `useBoard.js`, groups flat card array into `{ ready, in_progress, done }` sorted by position
- `applyCards(updater)` — defined inside `useBoard`, synchronously updates both `cardsRef.current` and calls `setCards`
- `fetchCards()` — from `api/client.js`, re-fetched on WS reconnect for reconciliation

---

## TDD Implementation Plan

### Subtask 1 — Integrate WebSocket Hook

#### Red: Tests to write first
**File:** `useBoard.test.js` — add at the top of the file:

```js
import { useWebSocket } from './useWebSocket.js'
vi.mock('./useWebSocket.js', () => ({ useWebSocket: vi.fn() }))
```

Add a **single top-level `beforeEach`** (outside all describe blocks, right after the `vi.mock` lines) to set the default mock return for all tests:
```js
beforeEach(() => {
  useWebSocket.mockReturnValue({ status: 'connected', disconnect: vi.fn() })
})
```
This runs before every test. Because the existing `afterEach` blocks call `vi.clearAllMocks()` (which clears call counts but does NOT reset implementations), the top-level `beforeEach` ensures the mock is re-applied before each test. Do **not** modify individual existing `beforeEach` blocks.

Add new describe block: `describe('WebSocket integration — initialization')`:
1. `it('calls useWebSocket with a ws:// URL containing /ws')` — assert `useWebSocket` was called with a string matching `/^wss?:\/\/.+\/ws$/`
2. `it('subscribes to all 5 event types')` — assert `events` option includes `['card:created', 'card:updated', 'card:deleted', 'card:moved', 'comment:created']`
3. `it('passes an onEvent callback to useWebSocket')` — assert `onEvent` is a function
4. Confirm all existing tests still pass after adding the mock (no new failures)

#### Green: Implementation in `useBoard.js`

1. Add import: `import { useWebSocket } from './useWebSocket.js'`
2. Add module-level constants:
   ```js
   const WS_URL = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`
   const WS_EVENTS = ['card:created', 'card:updated', 'card:deleted', 'card:moved', 'comment:created']
   ```
3. Inside `useBoard`, define stub handler (to be filled in subtask 2):
   ```js
   const handleWsEvent = useCallback((eventType, payload) => {
     // implemented in subtask 2
   }, [])
   ```
4. Call the hook:
   ```js
   useWebSocket(WS_URL, { onEvent: handleWsEvent, events: WS_EVENTS })
   ```

---

### Subtask 2 — Implement Event Handlers

#### Red: Tests to write first

Add a helper at the top of the new test section to capture and invoke the `onEvent` callback:
```js
let simulateWsEvent
beforeEach(() => {
  useWebSocket.mockImplementation((url, opts) => {
    simulateWsEvent = opts?.onEvent
    return { status: 'connected', disconnect: vi.fn() }
  })
})
```

Add describe blocks (all start with `api.fetchCards.mockResolvedValue(FIXTURE_CARDS)` in `beforeEach`):

**`describe('WebSocket event: card:created')`**
1. `it('adds card to the ready column')` — `act(() => simulateWsEvent('card:created', { id:'ws1', title:'WS', column:'ready', position:2, ...}))` → expect `cards.ready` length 2
2. `it('adds card to in_progress column for in-progress API value')` — column `'in-progress'` → in `cards.in_progress`
3. `it('adds card to done column')` — column `'done'` → in `cards.done`
4. `it('initializes comments as empty array')` — card in state has `comments: []`
5. `it('inserts card sorted by position')` — position 0.5 goes before existing position-1 card
6. `it('ignores event if card already exists (idempotent)')` — same card ID twice → length stays at 1 (no duplicate)

**`describe('WebSocket event: card:updated')`**
1. `it('updates card title in place')` — event updates `title` → state shows new title, card stays in same column
2. `it('updates card assignee in place')` — event updates `assignee` → state reflects change
3. `it('preserves existing comments when updating card')` — card had comments → comments still present after update
4. `it('does nothing when card does not exist')` — unknown ID → no state change, no crash
5. `it('moves card to new column when column field changes (cross-client move sync)')`:
   - Initial state: `r1` in `ready`
   - `act(() => simulateWsEvent('card:updated', { id: 'r1', column: 'done', position: 2, title: 'Ready One', assignee: null, description: null, created_at: 1000 }))`
   - Assert `cards.ready` length 0 (card moved out of ready)
   - Assert `cards.done` length 2 (original `d1` + moved `r1`)
   - Assert the card in `done` has `.column === 'done'`

**`describe('WebSocket event: card:deleted')`**
1. `it('removes card from its column')` — `cards.ready` drops from 1 to 0
2. `it('does nothing when card does not exist')` — unknown ID → no crash

**`describe('WebSocket event: card:moved')`**
1. `it('moves card from ready to done')` — card leaves `ready`, appears in `done`
2. `it('removes card from its original column')` — `cards.ready` length 0 after move
3. `it('updates card column field to new column')` — `card.column === 'done'`
4. `it('re-sorts target column by position after move')` — moved card with position 0.5 precedes existing position-1 card
5. `it('preserves card comments when moving')` — card with existing comments keeps them after move

**`describe('WebSocket event: comment:created')`**
1. `it('appends comment to the card comments array')` — `cards.ready[0].comments` length 1
2. `it('preserves existing comments when adding new one')` — card with 1 comment gets 2 after event
3. `it('does nothing when card does not exist')` — unknown `card_id` → no crash

#### Green: Implementation in `useBoard.js`

Replace the stub `handleWsEvent` with full implementation:

```js
const handleWsEvent = useCallback((eventType, payload) => {
  switch (eventType) {
    case 'card:created': {
      const key = columnToKey(payload.column)
      applyCards(prev => {
        if (prev[key].some(c => c.id === payload.id)) return prev
        return {
          ...prev,
          [key]: [...prev[key], { ...payload, comments: payload.comments ?? [] }]
            .sort((a, b) => a.position - b.position),
        }
      })
      break
    }
    case 'card:updated': {
      // Remove card from its current column, re-insert in the correct column.
      // This handles both in-column updates (title/assignee/description) AND
      // cross-column moves triggered via PATCH /api/cards/:id (the endpoint
      // the current client's moveCard hook uses). Preserves existing comments
      // because WS payloads do not include the comments array.
      const newKey = columnToKey(payload.column)
      applyCards(prev => {
        let existingComments = []
        let found = false
        const next = {}
        for (const [k, col] of Object.entries(prev)) {
          const card = col.find(c => c.id === payload.id)
          if (card) { existingComments = card.comments ?? []; found = true }
          next[k] = col.filter(c => c.id !== payload.id)
        }
        if (!found) return prev
        next[newKey] = [...next[newKey], { ...payload, comments: existingComments }]
          .sort((a, b) => a.position - b.position)
        return next
      })
      break
    }
    case 'card:deleted': {
      applyCards(prev => {
        const next = {}
        for (const [k, col] of Object.entries(prev)) {
          next[k] = col.filter(c => c.id !== payload.id)
        }
        return next
      })
      break
    }
    case 'card:moved': {
      const newKey = columnToKey(payload.column)
      applyCards(prev => {
        const next = {}
        let existingComments = []
        for (const [k, col] of Object.entries(prev)) {
          const card = col.find(c => c.id === payload.id)
          if (card) existingComments = card.comments ?? []
          next[k] = col.filter(c => c.id !== payload.id)
        }
        next[newKey] = [...next[newKey], { ...payload, comments: existingComments }]
          .sort((a, b) => a.position - b.position)
        return next
      })
      break
    }
    case 'comment:created': {
      applyCards(prev => {
        const next = {}
        for (const [k, col] of Object.entries(prev)) {
          next[k] = col.map(c =>
            c.id === payload.card_id
              ? { ...c, comments: [...c.comments, payload] }
              : c
          )
        }
        return next
      })
      break
    }
  }
}, [])
```

Note: `handleWsEvent` is `useCallback([])`. It captures the first-render instance of `applyCards`. Since `applyCards` closes only over stable values (`cardsRef`, `setCards`), the captured instance is functionally identical to any later render's. `useWebSocket` also stores `onEvent` in a ref internally (updates every render via `onEventRef.current = onEvent`), so even a non-memoized function would not trigger reconnection — `useCallback([])` here avoids unnecessary re-creation as a best-practice only. In Subtask 3, `consumeSuppression` will also be captured the same way (safe for the same reason).

---

### Subtask 3 — Handle Optimistic Updates to Avoid Duplicates

#### Red: Tests to write first

Add `describe('optimistic update deduplication')`:

For each test, use the `simulateWsEvent` helper from the subtask 2 setup.

1. `it('ignores card:created WS event after local createCard succeeds')`:
   - Mock `api.createCard` to resolve with `{ id: 'srv1', column: 'ready', ... }`
   - `await act(async () => { await result.current.createCard(...) })`
   - `act(() => simulateWsEvent('card:created', { id: 'srv1', column: 'ready', ... }))`
   - Assert `cards.ready` has length 2 (original + 1 new), NOT 3

2. `it('ignores comment:created WS event after local addComment succeeds')`:
   - Resolve `api.createComment` with `{ id: 'cm1', card_id: 'r1', ... }`
   - After addComment + WS event: `cards.ready[0].comments` length 1 (not 2)

3. `it('ignores card:updated WS event after local updateCard call')`:
   - `act(() => void result.current.updateCard('r1', { title: 'Local' }))`
   - `act(() => simulateWsEvent('card:updated', { id: 'r1', title: 'Remote' }))`
   - Assert card title is `'Local'` (WS event suppressed, rollback title would be 'Ready One')
   - Resolve API to complete the op

4. `it('ignores card:deleted WS event after local deleteCard call')`:
   - Card is deleted → WS delete event arrives → no crash, card stays deleted

5. `it('ignores card:updated WS event (with column change) after local moveCard call')`:
   - **Note:** `moveCard` uses `apiUpdateCard` → `PATCH /api/cards/:id` → server broadcasts `card:updated`, NOT `card:moved`
   - `act(() => void result.current.moveCard('r1', 'done', 2))` → optimistic move: r1 in done
   - `api.updateCard` (pending)
   - `act(() => simulateWsEvent('card:updated', { id: 'r1', column: 'done', position: 2, title: 'Ready One', assignee: null, description: null, created_at: 1000 }))`
   - Assert `cards.done` length 2 (original `d1` + moved `r1`), NOT 3 (no duplicate from WS event)
   - Assert `cards.ready` length 0

6. `it('does NOT suppress WS event for a different card')`:
   - Local `updateCard('r1', ...)` → WS `card:updated` for `'p1'` → `p1` IS updated in state

7. `it('suppression is consumed: second WS event for same card is applied')`:
   - Local updateCard('r1') → WS event #1 (suppressed) → WS event #2 (applied with new title)
   - After both events, card has title from event #2

#### Green: Implementation in `useBoard.js`

Add suppression infrastructure inside `useBoard`:
```js
// Map<id, expiryMs> — consume-once with 5s TTL
const suppressedRef = useRef(new Map())

function suppressWsEvent(id) {
  suppressedRef.current.set(id, Date.now() + 5000)
}

function consumeSuppression(id) {
  const expiry = suppressedRef.current.get(id)
  if (expiry === undefined) return false
  suppressedRef.current.delete(id)
  return Date.now() <= expiry
}
```

Modify existing action handlers to call `suppressWsEvent`:
- **`createCard`** — after `const created = await apiCreateCard(data)`, before `applyCards`: add `suppressWsEvent(created.id)`
- **`updateCard`** — after `const rollback = cardsRef.current`, before `applyCards`: add `suppressWsEvent(id)`
- **`deleteCard`** — after `const rollback = cardsRef.current`, before `applyCards`: add `suppressWsEvent(id)`
- **`moveCard`** — after `const rollback = cardsRef.current`, before `applyCards`: add `suppressWsEvent(id)`
- **`addComment`** — after `const comment = await createComment(cardId, data)`, before `applyCards`: add `suppressWsEvent(comment.id)`

Modify `handleWsEvent` — add suppression check at the start of each relevant case:
```js
case 'card:created': {
  if (consumeSuppression(payload.id)) break
  // ... rest of handler
}
case 'card:updated': {
  if (consumeSuppression(payload.id)) break
  // ...
}
case 'card:deleted': {
  if (consumeSuppression(payload.id)) break
  // ...
}
case 'card:moved': {
  if (consumeSuppression(payload.id)) break
  // ...
}
case 'comment:created': {
  if (consumeSuppression(payload.id)) break
  // ...
}
```

Note: `suppressWsEvent` and `consumeSuppression` are plain functions defined inside `useBoard`. `handleWsEvent` (a `useCallback([])`) captures their first-render instances, which is safe because both functions close only over `suppressedRef` (a stable `useRef` object — same identity every render). Call `consumeSuppression` directly inside the switch cases of `handleWsEvent`.

---

### Subtask 4 — State Consistency Across Multiple Clients

#### Red: Tests to write first

Add `describe('multi-client state consistency')`:

1. `it('WS card:created from another client adds card (not suppressed)')`:
   - No local `createCard` call
   - Simulate `card:created` WS event
   - Assert card appears in state

2. `it('successive card:moved WS events apply in order (last write wins)')`:
   - Simulate `card:moved` with `column: 'done'`
   - Simulate second `card:moved` with `column: 'in-progress'`
   - Assert card ends up in `in_progress`, not in `done`

3. `it('refetches board state when WebSocket reconnects after disconnect')`:
   - Setup: use a mutable variable to control the status returned by the mock:
     ```js
     let mockWsStatus = 'connected'
     useWebSocket.mockImplementation((url, opts) => ({ status: mockWsStatus, disconnect: vi.fn() }))
     const { result, rerender } = renderHook(() => useBoard())
     await waitFor(() => expect(result.current.loading).toBe(false))
     // Simulate disconnect → reconnect
     act(() => { mockWsStatus = 'disconnected'; rerender() })
     act(() => { mockWsStatus = 'connected'; rerender() })
     ```
   - Assert `api.fetchCards` was called **twice** (initial + reconciliation)

4. `it('does not refetch on initial connection (only on reconnect)')`:
   - Normal mount with `mockWsStatus = 'connected'` and single `rerender` — assert `api.fetchCards` called exactly **once**

5. `it('state reflects re-fetched data after reconnect')`:
   - First `fetchCards` returns `FIXTURE_CARDS`
   - After reconnect, second `fetchCards` returns a different card array (e.g., only one card in `done`)
   - After reconnect `rerender`, `await waitFor(...)` and assert state matches second fetch result

#### Green: Implementation in `useBoard.js`

1. Destructure `status` from `useWebSocket`:
   ```js
   const { status: wsStatus } = useWebSocket(WS_URL, { onEvent: handleWsEvent, events: WS_EVENTS })
   ```

2. Add ref to track prior connection:
   ```js
   const hasConnectedRef = useRef(false)
   ```

3. Add `useEffect` for reconnection reconciliation:
   ```js
   useEffect(() => {
     if (wsStatus === 'connected') {
       if (hasConnectedRef.current) {
         // Reconnect detected — re-fetch to reconcile missed events
         let cancelled = false
         fetchCards()
           .then(data => { if (!cancelled) applyCards(groupCards(data)) })
           .catch(() => {}) // silent fail; don't disrupt existing state
         return () => { cancelled = true }
       }
       hasConnectedRef.current = true
     }
   }, [wsStatus])
   ```

---

## Verification

### Unit Tests
```bash
cd kanban/client && npx vitest run src/hooks/useBoard.test.js
```
All existing + new tests should pass.

### Multi-tab Integration Test (manual)
1. Open two browser tabs at `http://localhost:5173`
2. In Tab A, create a card → Tab B sees it appear immediately
3. In Tab A, move a card to Done → Tab B sees card in Done
4. In Tab A, delete a card → Tab B sees it disappear
5. In Tab A, add a comment → Tab B sees comment appear on the card
6. Confirm no duplicate cards appear in Tab A when performing any operation
7. Kill and restart the server → on reconnect, both tabs re-sync

### Deduplication Test (manual)
1. Open browser DevTools → Network → filter WS
2. Create a card → verify only ONE card appears in the UI
3. Move a card → verify card appears in target column exactly once
