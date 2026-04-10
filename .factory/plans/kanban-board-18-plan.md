# Plan: useWebSocket Hook (Task #18)

## Context

The kanban board needs real-time updates when other users create/update/delete cards and comments. The server (`server/ws/broadcaster.js`) already uses the `ws` library to broadcast JSON events to all connected clients. This hook will be consumed by `useBoard` (or components) to receive those live updates without polling.

## Files to Create / Modify

| Action | Path |
|--------|------|
| **Create** | `client/src/hooks/useWebSocket.js` |
| **Create** | `client/src/hooks/useWebSocket.test.js` |

## Key Facts from Codebase

- **Testing framework**: Vitest + `@testing-library/react` (`renderHook`, `act`, `waitFor`)
- **jsdom** has no native WebSocket — must stub via `vi.stubGlobal('WebSocket', MockWebSocket)`
- **Fake timers** (`vi.useFakeTimers()`) are required for backoff delay tests
- **WebSocket endpoint**: `/ws` path (Vite proxy → `ws://localhost:3001`)
- **Message format**: `{ event: string, payload: object }` (e.g., `{ event: 'card:created', payload: { id: '…' } }`)
- **Callback ref pattern**: assign `ref.current = prop` directly in the render body (not inside useEffect) to avoid stale closures without causing WebSocket reconnects on callback identity changes
- **Pattern reference**: `useBoard.js` and `useBoard.test.js` for hook structure and test style

---

## Hook Public API

```js
export function useWebSocket(url, { onEvent, onError, events } = {})
// Returns: { status: 'connecting'|'connected'|'disconnected'|'error', disconnect: () => void }
```

**Parameters:**
- `url` — WebSocket URL string (e.g. `'ws://localhost:3001/ws'`)
- `onEvent(eventType, payload)` — called for each valid incoming event (after filtering)
- `onError(error)` — called on connection errors and JSON parse failures
- `events` — optional `string[]`; if provided, `onEvent` is only called for event types included in this array. All events are passed through when omitted.

---

## Mock WebSocket (shared across all subtask tests)

Define once at the top of `useWebSocket.test.js`. All `describe` blocks share the same `beforeEach`/`afterEach`.

```js
import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useWebSocket } from './useWebSocket.js'

class MockWebSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3
  static _instances = []

  constructor(url) {
    this.url = url
    this.readyState = MockWebSocket.CONNECTING
    this.onopen = null; this.onclose = null; this.onerror = null; this.onmessage = null
    MockWebSocket._instances.push(this)
  }
  close(code = 1000) {
    if (this.readyState === MockWebSocket.CLOSED) return
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) this.onclose({ code, wasClean: code === 1000 })
  }
  // Test helpers — call these inside act() to simulate server-side events
  _open()             { this.readyState = MockWebSocket.OPEN; this.onopen?.({}) }
  _message(data)      { this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) }) }
  _error(evt = {})    { this.onerror?.(evt) }
  _close(code = 1006) { this.readyState = MockWebSocket.CLOSED; this.onclose?.({ code, wasClean: false }) }
}

beforeEach(() => {
  MockWebSocket._instances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.clearAllMocks()
})
```

---

## TDD Implementation — Subtask by Subtask

**Important**: Each subtask follows strict Red → Green → Refactor. Write the tests for a subtask FIRST (confirm they fail), THEN add only the code needed to make them pass. The implementation grows incrementally across subtasks.

---

### Subtask 1 — Connection Lifecycle Management

**RED — Write and confirm these tests fail with no implementation file:**

```
describe('connection lifecycle')
  ✗ status is "connecting" immediately on mount
  ✗ creates a WebSocket with the provided URL on mount
  ✗ only one WebSocket instance is created on initial mount
  ✗ status becomes "connected" when WebSocket opens
  ✗ status becomes "disconnected" when WebSocket closes cleanly (code 1000)
  ✗ status becomes "error" when WebSocket emits an error event
```

**GREEN — Create `useWebSocket.js` with lifecycle only (no reconnect, no message parsing yet):**

```js
import { useState, useEffect, useRef } from 'react'

export function useWebSocket(url, { onEvent, onError, events } = {}) {
  const [status, setStatus] = useState('connecting')
  const wsRef = useRef(null)

  useEffect(() => {
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen  = () => setStatus('connected')
    ws.onclose = () => setStatus('disconnected')
    ws.onerror = () => setStatus('error')

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [url])

  return { status }
}
```

**Verify**: All 6 lifecycle tests are now green.

---

### Subtask 2 — Automatic Reconnection with Exponential Backoff

**RED — Write and confirm these tests fail with the Subtask 1 implementation:**

```
describe('reconnection with exponential backoff')
  ✗ status returns to "connecting" when a reconnect attempt fires
  ✗ does NOT reconnect immediately after unexpected close — waits 1000ms
  ✗ schedules reconnect after 1000ms on first unexpected disconnect
  ✗ schedules reconnect after 2000ms on second disconnect (after reconnect also drops)
  ✗ schedules reconnect after 4000ms on third disconnect
  ✗ caps reconnect delay at 30000ms (attempt index 5+)
  ✗ resets attempt counter to 0 on successful reconnection
  ✗ does NOT reconnect after intentional disconnect via disconnect()
  ✗ does NOT reconnect after component unmount
  ✗ does not accumulate multiple simultaneous reconnection timers
  ✗ disconnect() returns status "disconnected" and stops reconnection
```

**Test patterns using fake timers:**

```js
it('schedules reconnect after 1000ms on first unexpected disconnect', async () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))
  act(() => MockWebSocket._instances[0]._open())
  act(() => MockWebSocket._instances[0]._close(1006))

  expect(MockWebSocket._instances).toHaveLength(1) // no reconnect yet
  await act(async () => { vi.advanceTimersByTime(999) })
  expect(MockWebSocket._instances).toHaveLength(1) // still waiting
  await act(async () => { vi.advanceTimersByTime(1) })
  expect(MockWebSocket._instances).toHaveLength(2) // reconnect fired
})

it('status returns to "connecting" when a reconnect attempt fires', async () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))
  act(() => MockWebSocket._instances[0]._open())
  expect(result.current.status).toBe('connected')
  act(() => MockWebSocket._instances[0]._close(1006))
  expect(result.current.status).toBe('disconnected')

  await act(async () => { vi.advanceTimersByTime(1000) })
  expect(result.current.status).toBe('connecting') // reconnect in progress
})

it('caps reconnect delay at 30000ms', async () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))

  // drive 5 failed reconnects so attempt counter reaches 5 (delay = 32s, capped at 30s)
  for (let i = 0; i < 5; i++) {
    act(() => {
      const ws = MockWebSocket._instances[MockWebSocket._instances.length - 1]
      ws._open()
      ws._close(1006)
    })
    await act(async () => { vi.advanceTimersByTime(30_000) })
  }

  const countBefore = MockWebSocket._instances.length
  act(() => MockWebSocket._instances[MockWebSocket._instances.length - 1]._open())
  act(() => MockWebSocket._instances[MockWebSocket._instances.length - 1]._close(1006))

  await act(async () => { vi.advanceTimersByTime(29_999) })
  expect(MockWebSocket._instances.length).toBe(countBefore + 1) // no extra reconnect yet

  await act(async () => { vi.advanceTimersByTime(1) })
  expect(MockWebSocket._instances.length).toBe(countBefore + 2) // reconnect at exactly 30s
})

it('does NOT reconnect after intentional disconnect via disconnect()', async () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))
  act(() => MockWebSocket._instances[0]._open())

  act(() => result.current.disconnect())
  expect(result.current.status).toBe('disconnected')

  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(MockWebSocket._instances).toHaveLength(1) // no reconnect
})
```

**GREEN — Extend `useWebSocket.js` with reconnection logic:**

Replace the previous implementation with:

```js
import { useState, useEffect, useRef, useCallback } from 'react'

const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30_000

export function useWebSocket(url, { onEvent, onError, events } = {}) {
  const [status, setStatus] = useState('connecting')

  const wsRef                = useRef(null)
  const intentionalCloseRef  = useRef(false)
  const reconnectTimerRef    = useRef(null)
  const reconnectAttemptsRef = useRef(0)

  useEffect(() => {
    intentionalCloseRef.current = false
    reconnectAttemptsRef.current = 0   // reset on URL change or initial mount

    function connect() {
      setStatus('connecting')
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0
        setStatus('connected')
      }

      ws.onclose = () => {
        wsRef.current = null
        setStatus('disconnected')
        if (intentionalCloseRef.current) return
        // Guard against multiple simultaneous timers
        clearTimeout(reconnectTimerRef.current)
        const delay = Math.min(
          INITIAL_BACKOFF_MS * Math.pow(2, reconnectAttemptsRef.current),
          MAX_BACKOFF_MS
        )
        reconnectAttemptsRef.current += 1
        reconnectTimerRef.current = setTimeout(connect, delay)
      }

      ws.onerror = () => setStatus('error')
    }

    connect()

    return () => {
      intentionalCloseRef.current = true
      clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [url])

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true
    clearTimeout(reconnectTimerRef.current)
    wsRef.current?.close()
    setStatus('disconnected')
  }, [])

  return { status, disconnect }
}
```

**Verify**: All subtask 1 and subtask 2 tests are green.

---

### Subtask 3 — Event Parsing and Callback Handling

**RED — Write and confirm these tests fail with the Subtask 2 implementation:**

```
describe('event parsing and callback handling')
  ✗ calls onEvent with (eventType, payload) for valid JSON message
  ✗ handles all server event types: card:created, card:updated, card:deleted, card:moved, comment:created
  ✗ does not throw when no onEvent callback is provided
  ✗ does not call onEvent for malformed (non-JSON) messages
  ✗ calls onError with an Error when message JSON is malformed
  ✗ does not throw when no onError callback is provided and JSON is malformed
  ✗ does not call onEvent when parsed message has no event field (eventType is undefined)
  ✗ uses latest onEvent callback after it changes between renders (ref pattern — no reconnect)
  ✗ uses latest onError callback after it changes between renders (ref pattern — no reconnect)

describe('event type filtering')
  ✗ calls onEvent for an event type that is in the events filter array
  ✗ does NOT call onEvent for event types absent from the events filter array
  ✗ calls onEvent for all event types when events option is not provided
  ✗ uses latest events filter array after it changes between renders (ref pattern — no reconnect)
```

**Test patterns:**

```js
it('calls onEvent with eventType and payload for valid JSON', () => {
  const onEvent = vi.fn()
  const { result } = renderHook(() => useWebSocket('ws://localhost/ws', { onEvent }))
  act(() => MockWebSocket._instances[0]._open())
  act(() => MockWebSocket._instances[0]._message({ event: 'card:created', payload: { id: '1' } }))
  expect(onEvent).toHaveBeenCalledWith('card:created', { id: '1' })
})

it('does not call onEvent when parsed message has no event field', () => {
  const onEvent = vi.fn()
  const { result } = renderHook(() => useWebSocket('ws://localhost/ws', { onEvent }))
  act(() => MockWebSocket._instances[0]._open())
  act(() => MockWebSocket._instances[0]._message({ payload: { id: '1' } })) // no event field
  expect(onEvent).not.toHaveBeenCalled()
})

it('calls onError with an Error when message JSON is malformed', () => {
  const onError = vi.fn()
  renderHook(() => useWebSocket('ws://localhost/ws', { onError }))
  act(() => MockWebSocket._instances[0]._open())
  act(() => MockWebSocket._instances[0]._message('not valid json {{'))
  expect(onError).toHaveBeenCalledWith(expect.any(Error))
})

it('uses latest onEvent callback after prop change (ref pattern — no reconnect)', () => {
  const onEvent1 = vi.fn()
  const onEvent2 = vi.fn()
  let cb = onEvent1
  const { rerender } = renderHook(() => useWebSocket('ws://localhost/ws', { onEvent: cb }))
  act(() => MockWebSocket._instances[0]._open())
  cb = onEvent2
  rerender()
  // still only 1 WebSocket instance (no reconnect happened)
  expect(MockWebSocket._instances).toHaveLength(1)
  act(() => MockWebSocket._instances[0]._message({ event: 'card:updated', payload: { id: '1' } }))
  expect(onEvent1).not.toHaveBeenCalled()
  expect(onEvent2).toHaveBeenCalledWith('card:updated', { id: '1' })
})

it('does NOT call onEvent for event types absent from the events filter', () => {
  const onEvent = vi.fn()
  renderHook(() => useWebSocket('ws://localhost/ws', { onEvent, events: ['card:created'] }))
  act(() => MockWebSocket._instances[0]._open())
  act(() => MockWebSocket._instances[0]._message({ event: 'card:deleted', payload: { id: '1' } }))
  expect(onEvent).not.toHaveBeenCalled()
})

it('calls onEvent for event types in the events filter', () => {
  const onEvent = vi.fn()
  renderHook(() => useWebSocket('ws://localhost/ws', { onEvent, events: ['card:created', 'card:updated'] }))
  act(() => MockWebSocket._instances[0]._open())
  act(() => MockWebSocket._instances[0]._message({ event: 'card:created', payload: { id: '1' } }))
  expect(onEvent).toHaveBeenCalledWith('card:created', { id: '1' })
})
```

**GREEN — Extend `useWebSocket.js` with message parsing, callbacks, and event filtering:**

Add three new refs for callbacks and event filter. Apply them via direct assignment in the render body (not in useEffect — this avoids the need to list them as effect dependencies, which would cause unnecessary reconnects):

```js
// Add these refs (alongside wsRef, intentionalCloseRef, etc.):
const onEventRef = useRef(onEvent)
const onErrorRef = useRef(onError)
const eventsRef  = useRef(events)

// Keep refs current on every render (direct assignment, not in useEffect):
onEventRef.current = onEvent
onErrorRef.current = onError
eventsRef.current  = events
```

Add `ws.onmessage` inside the `connect()` function:

```js
ws.onmessage = ({ data }) => {
  try {
    const { event: eventType, payload } = JSON.parse(data)
    // Skip if no event type
    if (!eventType) return
    // Skip if event filter is active and this type is not included
    if (eventsRef.current && !eventsRef.current.includes(eventType)) return
    onEventRef.current?.(eventType, payload)
  } catch (err) {
    onErrorRef.current?.(err)
  }
}
```

Also enhance `ws.onerror` to call the `onError` callback:

```js
ws.onerror = (evt) => {
  setStatus('error')
  onErrorRef.current?.(new Error('WebSocket connection error'))
}
```

**Verify**: All subtask 1, 2, and 3 tests are green.

---

### Subtask 4 — Cleanup and Error Handling

**RED — Write and confirm these tests fail (or are not yet sufficiently covered) with the Subtask 3 implementation:**

```
describe('cleanup on unmount')
  ✗ closes WebSocket connection on component unmount
  ✗ clears pending reconnection timeout on unmount — no new socket created after unmount
  ✗ does not attempt reconnection after unmount even if a disconnect happens after unmount
  ✗ handles unmount during initial "connecting" state (before onopen fires)

describe('error handling via onError callback')
  ✗ calls onError with an Error object when WebSocket onerror fires
  ✗ status becomes "error" on WebSocket onerror event
  ✗ does not throw when onerror fires and no onError callback is provided
  ✗ uses latest onError callback after prop change (ref pattern — no reconnect)

describe('url change handling')
  ✗ closes old WebSocket and clears pending timers when url prop changes
  ✗ creates a new WebSocket with the new URL when url prop changes
  ✗ resets reconnect attempt counter when url changes

describe('edge cases')
  ✗ handles rapid mount/unmount without errors or lingering timers
  ✗ calling disconnect() when already disconnected does not throw
```

**Test patterns:**

```js
it('closes WebSocket connection on component unmount', () => {
  const { unmount } = renderHook(() => useWebSocket('ws://localhost/ws'))
  act(() => MockWebSocket._instances[0]._open())
  unmount()
  expect(MockWebSocket._instances[0].readyState).toBe(MockWebSocket.CLOSED)
})

it('clears pending reconnect timer on unmount — no new socket created', async () => {
  vi.useFakeTimers()
  const { unmount } = renderHook(() => useWebSocket('ws://localhost/ws'))
  act(() => MockWebSocket._instances[0]._open())
  act(() => MockWebSocket._instances[0]._close(1006)) // schedules 1000ms timer
  unmount() // cleanup must cancel the timer
  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(MockWebSocket._instances).toHaveLength(1) // no reconnect after unmount
})

it('handles unmount during initial connecting state', () => {
  const { unmount } = renderHook(() => useWebSocket('ws://localhost/ws'))
  // WebSocket is CONNECTING, no _open() called
  expect(() => unmount()).not.toThrow()
  expect(MockWebSocket._instances[0].readyState).toBe(MockWebSocket.CLOSED)
})

it('closes old WebSocket and creates new one when url changes', () => {
  const { rerender } = renderHook(({ url }) => useWebSocket(url), {
    initialProps: { url: 'ws://localhost/ws' }
  })
  act(() => MockWebSocket._instances[0]._open())
  rerender({ url: 'ws://localhost/ws2' })
  expect(MockWebSocket._instances[0].readyState).toBe(MockWebSocket.CLOSED)
  expect(MockWebSocket._instances).toHaveLength(2)
  expect(MockWebSocket._instances[1].url).toBe('ws://localhost/ws2')
})

it('resets reconnect attempt counter when url changes', async () => {
  vi.useFakeTimers()
  const { result, rerender } = renderHook(({ url }) => useWebSocket(url), {
    initialProps: { url: 'ws://localhost/ws' }
  })
  // Drive up the attempt counter on url1
  act(() => MockWebSocket._instances[0]._open())
  act(() => MockWebSocket._instances[0]._close(1006))
  await act(async () => { vi.advanceTimersByTime(1000) })
  act(() => MockWebSocket._instances[1]._open())
  act(() => MockWebSocket._instances[1]._close(1006))
  // Now switch URL — counter should reset
  rerender({ url: 'ws://localhost/ws2' })
  const countBefore = MockWebSocket._instances.length
  act(() => MockWebSocket._instances[countBefore - 1]._open())
  act(() => MockWebSocket._instances[countBefore - 1]._close(1006))
  // First attempt on new URL should use 1000ms, not 2000ms
  await act(async () => { vi.advanceTimersByTime(999) })
  expect(MockWebSocket._instances.length).toBe(countBefore) // not yet
  await act(async () => { vi.advanceTimersByTime(1) })
  expect(MockWebSocket._instances.length).toBe(countBefore + 1) // fired at 1000ms
})

it('calling disconnect() when already disconnected does not throw', () => {
  const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))
  act(() => MockWebSocket._instances[0]._close(1000))
  expect(() => act(() => result.current.disconnect())).not.toThrow()
})
```

**GREEN — No new implementation code is needed if subtasks 1–3 were implemented correctly.**

The cleanup return in `useEffect`, the `intentionalCloseRef` guard, the `clearTimeout` before `setTimeout`, `reconnectAttemptsRef.current = 0` in the effect body, and `disconnect()` already handle all of these cases. Run the tests — they should all pass.

If any fail, diagnose and fix the specific gaps in the existing implementation.

---

## Final Complete Implementation Reference

```js
import { useState, useEffect, useRef, useCallback } from 'react'

const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30_000

/**
 * @param {string} url - WebSocket server URL
 * @param {object} [options]
 * @param {(eventType: string, payload: object) => void} [options.onEvent]
 * @param {(error: Error) => void} [options.onError]
 * @param {string[]} [options.events] - optional allowlist of event type strings
 * @returns {{ status: 'connecting'|'connected'|'disconnected'|'error', disconnect: () => void }}
 */
export function useWebSocket(url, { onEvent, onError, events } = {}) {
  const [status, setStatus] = useState('connecting')

  const wsRef                = useRef(null)
  const intentionalCloseRef  = useRef(false)
  const reconnectTimerRef    = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const onEventRef           = useRef(onEvent)
  const onErrorRef           = useRef(onError)
  const eventsRef            = useRef(events)

  // Keep callback/filter refs current on every render (direct assignment — no reconnect side effects)
  onEventRef.current = onEvent
  onErrorRef.current = onError
  eventsRef.current  = events

  useEffect(() => {
    intentionalCloseRef.current = false
    reconnectAttemptsRef.current = 0   // reset on URL change or initial mount

    function connect() {
      setStatus('connecting')
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0
        setStatus('connected')
      }

      ws.onclose = () => {
        wsRef.current = null
        setStatus('disconnected')
        if (intentionalCloseRef.current) return
        // Prevent accumulation of multiple timers
        clearTimeout(reconnectTimerRef.current)
        const delay = Math.min(
          INITIAL_BACKOFF_MS * Math.pow(2, reconnectAttemptsRef.current),
          MAX_BACKOFF_MS
        )
        reconnectAttemptsRef.current += 1
        reconnectTimerRef.current = setTimeout(connect, delay)
      }

      ws.onerror = () => {
        setStatus('error')
        onErrorRef.current?.(new Error('WebSocket connection error'))
      }

      ws.onmessage = ({ data }) => {
        try {
          const { event: eventType, payload } = JSON.parse(data)
          if (!eventType) return
          if (eventsRef.current && !eventsRef.current.includes(eventType)) return
          onEventRef.current?.(eventType, payload)
        } catch (err) {
          onErrorRef.current?.(err)
        }
      }
    }

    connect()

    return () => {
      intentionalCloseRef.current = true
      clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [url])

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true
    clearTimeout(reconnectTimerRef.current)
    wsRef.current?.close()
    setStatus('disconnected')
  }, [])

  return { status, disconnect }
}
```

---

## Verification

1. **Run all unit tests**: `cd client && npx vitest run src/hooks/useWebSocket.test.js`
2. **All 4 subtask test suites must be green** (≈35 test cases)
3. **Run full client test suite** to confirm no regressions: `cd client && npx vitest run`
4. **Manual smoke test** (optional):
   - Start server: `cd server && node index.js`
   - Start client: `cd client && npm run dev`
   - Use the hook in `App.jsx` with `url = \`ws://${location.host}/ws\`` and a console-logging `onEvent`
   - Trigger a card create via REST API and confirm `onEvent` fires with `('card:created', { … })`

## TDD Execution Order (strict)

For each subtask in order:
1. Write ALL the failing tests for that subtask → run → confirm RED
2. Write/extend implementation code → run → confirm GREEN
3. Refactor if needed, re-run → confirm still GREEN
4. Move to next subtask
