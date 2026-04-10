# QA Report: Task 19 — Integrate real-time updates into useBoard hook

**Date:** 2026-04-10  
**Assignee:** Maria  
**Task ID:** 19  
**Worktree:** `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-19`

---

## Summary

The implementation correctly integrates WebSocket-based real-time updates into the `useBoard` hook. All 5 required event types are handled, an optimistic-update suppression mechanism is in place, and reconnect-based state reconciliation is implemented. All client-side tests pass. One pre-existing server test environment issue was found (unrelated to this task). Two minor issues were found in the implementation.

---

## Project Structure

```
kanban/
  client/         # React frontend (npm workspace)
    src/hooks/
      useBoard.js           ← Modified by task 19
      useBoard.test.js      ← Modified by task 19
      useWebSocket.js       (task 18, unchanged)
      useWebSocket.test.js  (task 18, unchanged)
    src/api/client.js
    src/components/Board/, CardModal/
  server/         # Express/SQLite backend
  test/           # Root-level setup tests
```

Files changed by task 19: only `kanban/client/src/hooks/useBoard.js` and `kanban/client/src/hooks/useBoard.test.js`.

---

## Implementation Review

### Event Handlers

All 5 required event types are handled in a `handleWsEvent` switch block:

| Event | Handled | Notes |
|---|---|---|
| `card:created` | ✅ | Idempotent (skips if card already exists), inserts sorted by position, initializes `comments: []` |
| `card:updated` | ✅ | Removes from all columns, re-inserts in correct column (handles cross-column moves), preserves existing comments |
| `card:deleted` | ✅ | Removes card from all columns |
| `card:moved` | ✅ | Dedicated event, same re-insert logic as `card:updated`, preserves existing comments |
| `comment:created` | ✅ | Appends comment to matching card's comments array |

### Optimistic Update / Deduplication Mechanism

A suppression map pattern is implemented via `suppressedRef` (a `Map` with 5-second TTL). The mechanism is consume-once: calling `consumeSuppression(id)` deletes the entry immediately, so only the first matching WebSocket echo is suppressed.

| Action | Suppression Timing |
|---|---|
| `createCard` | Suppresses `card:created` echo after API success |
| `updateCard` | Suppresses `card:updated` echo before API call (optimistic) |
| `deleteCard` | Suppresses `card:deleted` echo before API call (optimistic) |
| `moveCard` | Suppresses `card:updated`/`card:moved` echo before API call (optimistic) |
| `addComment` | Suppresses `comment:created` echo after API success |

### State Consistency / Reconnect Reconciliation

A `useEffect` monitors `wsStatus`. When a reconnect is detected (status transitions to `connected` and `hasConnectedRef.current` is already `true`), the hook silently re-fetches all cards via `fetchCards()` to reconcile any events missed during disconnection.

---

## Commands Found and Executed

| Location | Script | Command |
|---|---|---|
| `kanban/package.json` | `test:setup` | `node --test test/*.test.mjs` |
| `kanban/package.json` | `test:server` | `npm -w server run test` |
| `kanban/client/package.json` | `test` | `vitest run` |
| `kanban/client/package.json` | `lint` | `eslint src` |
| `kanban/client/package.json` | `build` | `vite build` |

---

## Command Results

| Command | Result | Notes |
|---|---|---|
| `npm run test` (client) | ✅ **PASS** | 289 tests across 9 files, 0 failures |
| `npm run lint` (client) | ✅ **PASS** | No output, exit 0 |
| `npm run build` (client) | ✅ **PASS** | 44 modules, built successfully (~263ms) |
| `npm run test:setup` | ✅ **PASS** | 49 tests, 0 failures |
| `npm run test:server` | ❌ **FAIL** | Pre-existing environment issue (see below) |

### Server Test Failure Detail (Pre-existing, Unrelated to Task 19)

`npm run test:server` fails for the `cards`, `comments`, `db`, and `server` suites with `ERR_MODULE_NOT_FOUND` — `express` and `better-sqlite3` packages are not installed because `npm install` was never run in the `server` workspace (`kanban/server/node_modules` does not exist). The `ws.test.mjs` suite runs (because `ws` is installed at root) but has 4 failing tests out of 25 — also pre-existing.

This failure pre-dates task 19; the task only touched client files and these server tests were already broken before the task began.

---

## Issues Found

### Issue 1 — `act()` Warnings in useBoard.test.js (Non-Blocking, Cosmetic)

**Severity:** Low  
**Type:** Test quality

Four test cases emit React `act()` warnings to stderr. These occur because `fetchCards` resolves asynchronously (triggering `setLoading(false)`) during `renderHook()` without being wrapped in `act()`. All tests pass regardless, but the setup is slightly imprecise.

Affected tests:
- `WebSocket integration — initialization > calls useWebSocket with a ws:// URL containing /ws`
- `WebSocket integration — initialization > subscribes to all 5 event types`
- `WebSocket integration — initialization > passes an onEvent callback to useWebSocket`
- `multi-client state consistency > refetches board state when WebSocket reconnects after disconnect`

### Issue 2 — Eager Suppression Window for Optimistic Updates (Design Limitation)

**Severity:** Low  
**Type:** Correctness edge case  
**File:** `kanban/client/src/hooks/useBoard.js`

For `updateCard`, `deleteCard`, and `moveCard`, `suppressWsEvent(id)` is called synchronously *before* the API call resolves. The 5-second suppression window therefore starts counting down before the server acknowledges the operation. On a slow network (API call taking > 5 seconds), the WebSocket echo would no longer be suppressed, potentially causing a duplicate state update. This is an edge case for slow networks but represents a design limitation worth noting.

### Issue 3 — Server Test Environment Broken (Pre-existing, Unrelated)

**Severity:** N/A (pre-existing, unrelated to task 19)  
`npm run test:server` fails due to missing `kanban/server/node_modules`. This is unrelated to task 19 and was broken before this work began.

---

## Test Coverage for Task 19

`useBoard.test.js` contains 101 tests (out of 289 total client tests) specifically covering the task 19 implementation:

| Subtask | Coverage |
|---|---|
| WebSocket hook integration & initialization | 3 tests |
| All 5 event handler implementations | Multiple tests each (card:created, card:updated, card:deleted, card:moved, comment:created) |
| Optimistic update deduplication | 7 tests |
| Multi-client consistency & reconnect refetch | 5 tests |

All 101 tests pass.

---

## Overall Assessment

| Check | Result |
|---|---|
| `card:created` event handler implemented | ✅ PASS |
| `card:updated` event handler implemented | ✅ PASS |
| `card:deleted` event handler implemented | ✅ PASS |
| `card:moved` event handler implemented | ✅ PASS |
| `comment:created` event handler implemented | ✅ PASS |
| Optimistic update deduplication mechanism | ✅ PASS |
| Reconnect-based state reconciliation | ✅ PASS |
| `npm run test` (289 client tests) | ✅ PASS |
| `npm run lint` | ✅ PASS |
| `npm run build` | ✅ PASS |
| `npm run test:setup` (49 tests) | ✅ PASS |
| `npm run test:server` | ❌ FAIL (pre-existing environment issue, unrelated) |

The task 19 implementation is **functionally correct and complete**. All required event handlers are implemented, the deduplication mechanism works as designed, and reconnect-based state reconciliation is in place. The two issues found (act() warnings and eager suppression window) are minor and do not affect correctness in typical usage. The server test failure is a pre-existing environment issue unrelated to this task.

**Overall status: PASS** (with minor issues noted above)
