# QA Report — Task 18: Create useWebSocket Hook for Real-Time Updates

**Date:** 2026-04-10
**Reviewer:** QA Agent
**Task:** Implement React hook for WebSocket connection and event handling
**Branch:** kanban-board/kanban-board-18
**Status:** PASS

---

## 1. Project Structure Overview

```
kanban-board-18/
└── kanban/
    ├── package.json              (workspace root: "kanban-app")
    ├── client/
    │   ├── package.json          (kanban-client)
    │   ├── eslint.config.js
    │   ├── vite.config.js        (test: vitest, environment: jsdom)
    │   └── src/
    │       ├── hooks/
    │       │   ├── useWebSocket.js      ← primary file under review
    │       │   ├── useWebSocket.test.js ← test suite
    │       │   ├── useBoard.js
    │       │   └── useBoard.test.js
    │       ├── components/Board/
    │       ├── api/client.js + client.test.js
    │       └── App.jsx + App.test.jsx
    ├── server/
    │   ├── ws/                   (WebSocket broadcaster, task 16/17)
    │   └── test/
    └── test/
```

No `Makefile` found. No TypeScript in this project (no typecheck command exists).

---

## 2. Commands Found and Executed

| Command | Location | Script |
|---|---|---|
| `npm -w client run test` | `kanban/package.json` (workspace root) | `vitest run` |
| `npm -w client run lint` | `kanban/package.json` (workspace root) | `eslint src` |
| `npm -w client run build` | `kanban/package.json` (workspace root) | `vite build` |
| `npm run test:server` | `kanban/package.json` (workspace root) | `npm -w server run test` |

No `test:setup` command was run as it was absent from the workspace root `package.json` scripts in this worktree. No Makefile was present.

---

## 3. Command Results

### `npm -w client run test` — PASS

All 173 tests across 8 test files passed. The `useWebSocket.test.js` file contributed 42 tests:

```
✓ src/api/client.test.js                     (27 tests)   22ms
✓ src/App.test.jsx                            (4 tests)   59ms
✓ src/components/Board/Column.test.jsx        (6 tests)   74ms
✓ src/components/Board/CardTile.test.jsx      (9 tests)   71ms
✓ src/hooks/useWebSocket.test.js             (42 tests)   82ms
✓ src/components/Board/Board.test.jsx        (11 tests)   96ms
✓ src/components/Board/CardModal.test.jsx    (10 tests)   96ms
✓ src/hooks/useBoard.test.js                 (64 tests) 3094ms

Test Files  8 passed (8)
     Tests  173 passed (173)
  Duration  3.96s
```

### `npm -w client run lint` — PASS

ESLint ran against `src/` with zero errors or warnings. Exit code 0, no output.

### `npm -w client run build` — PASS

Vite production build completed successfully in ~252ms:

```
dist/index.html                   0.48 kB │ gzip:  0.31 kB
dist/assets/index-DA879vGP.css    2.26 kB │ gzip:  0.87 kB
dist/assets/index-DMkIm4BC.js   148.94 kB │ gzip: 47.99 kB
✓ built in 252ms
```

### `npm run test:server` — PASS

All 146 server-side tests across 27 suites passed (0 failures). This includes the WebSocket broadcaster tests (tasks 16 and 17), which are a dependency of this hook. The server-side infrastructure the hook connects to is fully tested and operational.

---

## 4. Requirements Verification

### Requirement 1 — WebSocket connection establishment

**Status: PASS**

`useWebSocket.js` establishes a WebSocket connection via `new WebSocket(url)` inside a `useEffect` that runs on mount and re-runs on URL change. The initial status is set to `'connecting'` synchronously before the socket is created. The `ws.onopen` handler transitions status to `'connected'`. The hook accepts a required `url` string parameter and an optional options object.

### Requirement 2 — Connection lifecycle handling (connect, disconnect, reconnect)

**Status: PASS**

All three lifecycle phases are handled:

- **Connect:** `ws.onopen` sets status to `'connected'` and resets `reconnectAttemptsRef` to 0.
- **Disconnect:** `ws.onclose` sets status to `'disconnected'`. The `disconnect()` function (returned from the hook) allows intentional disconnection, setting `intentionalCloseRef.current = true` to suppress automatic reconnection.
- **Reconnect:** Described in detail under Requirement 3.

The hook exposes a `{ status, disconnect }` return value. `status` can be `'connecting'`, `'connected'`, `'disconnected'`, or `'error'`.

### Requirement 3 — Automatic reconnection with exponential backoff

**Status: PASS**

The reconnection logic in `ws.onclose` computes delay as:

```js
const delay = Math.min(
  INITIAL_BACKOFF_MS * Math.pow(2, reconnectAttemptsRef.current),
  MAX_BACKOFF_MS
)
```

Where `INITIAL_BACKOFF_MS = 1000` and `MAX_BACKOFF_MS = 30_000`. The attempt counter increments after each failed connection. Reconnection is suppressed when `intentionalCloseRef.current` is `true` (set by `disconnect()` or the cleanup function). A `clearTimeout` guard prevents multiple simultaneous timers from accumulating on repeated `onclose` events.

The backoff sequence is: 1000ms → 2000ms → 4000ms → 8000ms → 16000ms → 30000ms (capped).

Tests confirm each step of this sequence, including cap enforcement and counter reset on successful connection.

### Requirement 4 — JSON event parsing and onEvent callback

**Status: PASS**

Incoming messages are parsed in `ws.onmessage`:

```js
const { event: eventType, payload } = JSON.parse(data)
if (!eventType) return
if (eventsRef.current && !eventsRef.current.includes(eventType)) return
onEventRef.current?.(eventType, payload)
```

- Messages with no `event` field are silently ignored.
- An optional `events` array allowlist filters which event types trigger the callback.
- The `onEvent` callback is stored in a ref (`onEventRef`), so the latest callback is always used without triggering reconnection on prop changes (stable ref pattern).
- All five server event types (`card:created`, `card:updated`, `card:deleted`, `card:moved`, `comment:created`) are tested and work correctly.

### Requirement 5 — Error handling

**Status: PASS**

Two error paths are handled:

1. **WebSocket `onerror` event:** Sets status to `'error'` and calls `onErrorRef.current?.(new Error('WebSocket connection error'))`. Graceful when no `onError` callback is provided (optional chaining).
2. **Malformed JSON in `onmessage`:** The `try/catch` block calls `onErrorRef.current?.(err)` with the parse error. Does not throw, does not call `onEvent`. Graceful when no `onError` is provided.

The `onError` callback is also stored in a ref, ensuring the latest callback is always used without reconnection side effects.

### Requirement 6 — Cleanup on component unmount

**Status: PASS**

The `useEffect` cleanup function:

```js
return () => {
  intentionalCloseRef.current = true
  clearTimeout(reconnectTimerRef.current)
  wsRef.current?.close()
  wsRef.current = null
}
```

This:
- Marks the close as intentional (suppresses reconnect from `onclose`).
- Cancels any pending reconnection timer.
- Closes the WebSocket if open.
- Nullifies the ref to prevent dangling callbacks.

Tests confirm that no reconnect is triggered after unmount, even if a `close` event fires asynchronously after the cleanup function runs.

---

## 5. Test Coverage Review

The required test strategy specifies: *"Test WebSocket connects on mount, receives events correctly, reconnects after disconnection, cleans up properly."*

The test file at `client/src/hooks/useWebSocket.test.js` covers all four required areas plus additional edge cases, organized into six `describe` blocks:

| Describe block | Tests | Required area covered |
|---|---|---|
| `connection lifecycle` | 6 | Connects on mount |
| `reconnection with exponential backoff` | 9 | Reconnects after disconnection |
| `event parsing and callback handling` | 9 | Receives events correctly |
| `event type filtering` | 4 | Receives events correctly (filtering) |
| `cleanup on unmount` | 5 | Cleans up properly |
| `error handling via onError callback` | 4 | Error handling |
| `url change handling` | 3 | Bonus: URL changes |
| `edge cases` | 1 | Bonus: disconnect when already disconnected |

**Total: 42 tests, all passing.**

Key test highlights:
- Exponential backoff delays are verified at each step (1000ms, 2000ms, 4000ms) and at cap (30000ms) using `vi.useFakeTimers()`.
- Counter reset on successful open is verified.
- Multiple simultaneous timer accumulation is verified not to occur.
- Unmount during `connecting` state (before `onopen`) is tested.
- Rapid mount/unmount cycle is tested.
- Ref-pattern callback stability (no reconnect on callback prop change) is tested for both `onEvent`, `onError`, and `events` filter.

---

## 6. Code Review Findings

### Finding 1 — INFO: `useWebSocket` is not yet consumed by any other module

**Files:** `client/src/hooks/useWebSocket.js`

A search across `client/src/` shows `useWebSocket` is referenced only by its own test file. The hook is not yet imported in `useBoard.js`, `Board.jsx`, `App.jsx`, or any other application file. This is expected for this task (Task 18 delivers the hook; integration into `useBoard` would be a subsequent task), but it means the hook has not been exercised in the live application render path. This is an integration gap, not a bug in the implementation.

### Finding 2 — INFO: No reconnect guard on `onerror` → `onclose` double-fire

**File:** `client/src/hooks/useWebSocket.js`

When a WebSocket emits `onerror`, browsers typically fire `onclose` immediately afterward. This means status will transition `'error'` → `'disconnected'` and a reconnect timer will be scheduled. The `onerror` handler sets status to `'error'` but does not set `intentionalCloseRef`, so the subsequent `onclose` will schedule a reconnect. This is standard WebSocket behavior and arguably desirable (retry on error), but the transient `'error'` status is observable only briefly before being overwritten by `'disconnected'`. Consumers that read `status` asynchronously may not see the `'error'` state. This is a design trade-off, not a bug. Tests confirm `onerror` sets status to `'error'` without independently testing the subsequent `onclose` interaction.

### Finding 3 — INFO: `disconnect()` does not nullify `wsRef` after calling `close()`

**File:** `client/src/hooks/useWebSocket.js`

```js
const disconnect = useCallback(() => {
  intentionalCloseRef.current = true
  clearTimeout(reconnectTimerRef.current)
  wsRef.current?.close()
  setStatus('disconnected')
}, [])
```

Unlike the cleanup function, `disconnect()` does not set `wsRef.current = null` after closing. The `onclose` callback attached to the still-referenced socket will fire (because `ws.close()` triggers it), set status to `'disconnected'`, and check `intentionalCloseRef.current` (which is `true`) — so no reconnect will be scheduled. The behavior is correct, but the ref holds a reference to a closed WebSocket object until the next render cycle or effect re-run. This is a minor memory consideration with no practical impact at this scale.

---

## 7. Overall Assessment

All six stated requirements are implemented correctly and fully tested. The 42 tests in `useWebSocket.test.js` pass completely and comprehensively cover the required test strategy (connect on mount, receive events correctly, reconnect after disconnection, clean up properly) as well as additional edge cases. ESLint reports zero violations and the production build succeeds.

The three findings above are informational observations. None represent bugs or requirement violations. Finding 1 (hook not yet integrated into application code) is an expected state for an isolated hook delivery task.

---

## 8. Summary

| Check | Result |
|---|---|
| `npm -w client run test` (173 tests total, 42 for useWebSocket) | PASS |
| `npm -w client run lint` | PASS |
| `npm -w client run build` | PASS |
| `npm run test:server` (146 tests) | PASS |
| WebSocket connection establishment | PASS |
| Connection lifecycle (connect, disconnect, reconnect) | PASS |
| JSON event parsing and onEvent callback | PASS |
| Automatic reconnection with exponential backoff | PASS |
| Error handling (onerror + malformed JSON) | PASS |
| Cleanup on component unmount | PASS |
| Test coverage of required strategy | PASS (42 tests) |

**Overall Status: PASS**

The implementation is correct, complete, and well-tested. All automated checks pass with zero violations. Three low-severity informational observations were noted; none are blocking.
