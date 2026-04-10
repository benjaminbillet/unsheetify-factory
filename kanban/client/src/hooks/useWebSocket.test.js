import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useWebSocket } from './useWebSocket.js'

// ---------------------------------------------------------------------------
// Mock WebSocket (shared across all subtask tests)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SUBTASK 1 — Connection Lifecycle Management
// ---------------------------------------------------------------------------


describe('connection lifecycle', () => {
  it('status is "connecting" immediately on mount', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))
    expect(result.current.status).toBe('connecting')
  })

  it('creates a WebSocket with the provided URL on mount', () => {
    renderHook(() => useWebSocket('ws://localhost/ws'))
    expect(MockWebSocket._instances).toHaveLength(1)
    expect(MockWebSocket._instances[0].url).toBe('ws://localhost/ws')
  })

  it('only one WebSocket instance is created on initial mount', () => {
    renderHook(() => useWebSocket('ws://localhost/ws'))
    expect(MockWebSocket._instances).toHaveLength(1)
  })

  it('status becomes "connected" when WebSocket opens', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))
    act(() => MockWebSocket._instances[0]._open())
    expect(result.current.status).toBe('connected')
  })

  it('status becomes "disconnected" when WebSocket closes cleanly (code 1000)', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))
    act(() => MockWebSocket._instances[0]._open())
    act(() => MockWebSocket._instances[0].close(1000))
    expect(result.current.status).toBe('disconnected')
  })

  it('status becomes "error" when WebSocket emits an error event', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))
    act(() => MockWebSocket._instances[0]._error())
    expect(result.current.status).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// SUBTASK 2 — Automatic Reconnection with Exponential Backoff
// ---------------------------------------------------------------------------

describe('reconnection with exponential backoff', () => {
  it('schedules reconnect after 1000ms on first unexpected disconnect', async () => {
    vi.useFakeTimers()
    renderHook(() => useWebSocket('ws://localhost/ws'))
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

  it('schedules reconnect after 2000ms on second disconnect', async () => {
    vi.useFakeTimers()
    renderHook(() => useWebSocket('ws://localhost/ws'))

    // First close WITHOUT opening: counter 0→1, delay = 1000ms
    act(() => MockWebSocket._instances[0]._close(1006))
    await act(async () => { vi.advanceTimersByTime(1000) }) // trigger reconnect #1

    // Second close WITHOUT opening: counter 1→2, delay = 2000ms
    act(() => MockWebSocket._instances[1]._close(1006))
    await act(async () => { vi.advanceTimersByTime(1999) })
    expect(MockWebSocket._instances).toHaveLength(2) // not yet
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(MockWebSocket._instances).toHaveLength(3) // fired at 2000ms
  })

  it('schedules reconnect after 4000ms on third disconnect', async () => {
    vi.useFakeTimers()
    renderHook(() => useWebSocket('ws://localhost/ws'))

    // Build counter to 2 without any _open() so it never resets
    act(() => MockWebSocket._instances[0]._close(1006)) // counter 0→1, delay 1000ms
    await act(async () => { vi.advanceTimersByTime(1000) })
    act(() => MockWebSocket._instances[1]._close(1006)) // counter 1→2, delay 2000ms
    await act(async () => { vi.advanceTimersByTime(2000) })

    // Third close: counter 2→3, delay = 4000ms
    act(() => MockWebSocket._instances[2]._close(1006))
    await act(async () => { vi.advanceTimersByTime(3999) })
    expect(MockWebSocket._instances).toHaveLength(3) // not yet
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(MockWebSocket._instances).toHaveLength(4) // fired at 4000ms
  })

  it('caps reconnect delay at 30000ms', async () => {
    // To reach the cap we need attempt counter = 5, giving delay = min(1000*2^5, 30000) = 30000ms.
    // We must NOT call _open() between disconnects — _open() resets the counter to 0.
    vi.useFakeTimers()
    renderHook(() => useWebSocket('ws://localhost/ws'))

    // Drive counter from 0 to 5 via 5 consecutive closes (no _open()):
    act(() => MockWebSocket._instances[0]._close(1006)) // counter 0→1, delay 1000ms
    await act(async () => { vi.advanceTimersByTime(1000) })
    act(() => MockWebSocket._instances[1]._close(1006)) // counter 1→2, delay 2000ms
    await act(async () => { vi.advanceTimersByTime(2000) })
    act(() => MockWebSocket._instances[2]._close(1006)) // counter 2→3, delay 4000ms
    await act(async () => { vi.advanceTimersByTime(4000) })
    act(() => MockWebSocket._instances[3]._close(1006)) // counter 3→4, delay 8000ms
    await act(async () => { vi.advanceTimersByTime(8000) })
    act(() => MockWebSocket._instances[4]._close(1006)) // counter 4→5, delay 16000ms
    await act(async () => { vi.advanceTimersByTime(16000) })

    // close 6: counter 5→6, delay = min(1000*2^5, 30000) = min(32000, 30000) = 30000ms ← cap
    act(() => MockWebSocket._instances[5]._close(1006))
    const countBefore = MockWebSocket._instances.length // 6

    await act(async () => { vi.advanceTimersByTime(29_999) })
    expect(MockWebSocket._instances.length).toBe(countBefore) // not yet
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(MockWebSocket._instances.length).toBe(countBefore + 1) // reconnect at exactly 30000ms
  })

  it('resets attempt counter to 0 on successful reconnection', async () => {
    vi.useFakeTimers()
    renderHook(() => useWebSocket('ws://localhost/ws'))

    // Build counter to 2 (no _open(), so counter keeps incrementing)
    act(() => MockWebSocket._instances[0]._close(1006)) // counter 0→1, delay 1000ms
    await act(async () => { vi.advanceTimersByTime(1000) })
    act(() => MockWebSocket._instances[1]._close(1006)) // counter 1→2, delay 2000ms
    await act(async () => { vi.advanceTimersByTime(2000) })

    // Now open successfully — counter resets to 0
    act(() => MockWebSocket._instances[2]._open())
    // Now close — counter is 0, so next delay must be 1000ms (not 4000ms)
    act(() => MockWebSocket._instances[2]._close(1006))

    await act(async () => { vi.advanceTimersByTime(999) })
    expect(MockWebSocket._instances).toHaveLength(3) // not yet at 1000ms
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(MockWebSocket._instances).toHaveLength(4) // fired at 1000ms, confirming counter reset
  })

  it('does not accumulate multiple simultaneous reconnection timers', async () => {
    vi.useFakeTimers()
    renderHook(() => useWebSocket('ws://localhost/ws'))

    // Simulate onclose firing twice. Each call clears the previous timer before scheduling a new one.
    // First close: counter 0→1, schedules 1000ms timer
    act(() => MockWebSocket._instances[0]._close(1006))
    // Second close: cancels the 1000ms timer, counter 1→2, schedules 2000ms timer
    act(() => MockWebSocket._instances[0]._close(1006))

    // At 1000ms the first (cancelled) timer would have fired — no reconnect
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(MockWebSocket._instances).toHaveLength(1) // first timer was cancelled

    // At 2000ms the second timer fires — exactly one reconnect
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(MockWebSocket._instances).toHaveLength(2) // exactly one reconnect

    // No additional timers accumulated — count stays at 2
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(MockWebSocket._instances).toHaveLength(2)
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

  it('does NOT reconnect after component unmount', async () => {
    vi.useFakeTimers()
    const { unmount } = renderHook(() => useWebSocket('ws://localhost/ws'))
    act(() => MockWebSocket._instances[0]._open())
    act(() => MockWebSocket._instances[0]._close(1006)) // schedules 1000ms reconnect

    unmount() // cleanup cancels the timer

    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(MockWebSocket._instances).toHaveLength(1) // no reconnect after unmount
  })

  it('disconnect() sets status to "disconnected" and stops reconnection', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))
    act(() => MockWebSocket._instances[0]._open())
    act(() => result.current.disconnect())

    expect(result.current.status).toBe('disconnected')
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(MockWebSocket._instances).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// SUBTASK 3 — Event Parsing and Callback Handling
// ---------------------------------------------------------------------------

describe('event parsing and callback handling', () => {
  it('calls onEvent with (eventType, payload) for valid JSON message', () => {
    const onEvent = vi.fn()
    renderHook(() => useWebSocket('ws://localhost/ws', { onEvent }))
    act(() => MockWebSocket._instances[0]._open())
    act(() => MockWebSocket._instances[0]._message({ event: 'card:created', payload: { id: '1' } }))
    expect(onEvent).toHaveBeenCalledWith('card:created', { id: '1' })
  })

  it('handles all server event types', () => {
    const onEvent = vi.fn()
    renderHook(() => useWebSocket('ws://localhost/ws', { onEvent }))
    act(() => MockWebSocket._instances[0]._open())

    const eventTypes = ['card:created', 'card:updated', 'card:deleted', 'card:moved', 'comment:created']
    for (const eventType of eventTypes) {
      act(() => MockWebSocket._instances[0]._message({ event: eventType, payload: { id: '1' } }))
    }
    expect(onEvent).toHaveBeenCalledTimes(5)
    for (const eventType of eventTypes) {
      expect(onEvent).toHaveBeenCalledWith(eventType, { id: '1' })
    }
  })

  it('does not throw when no onEvent callback is provided', () => {
    renderHook(() => useWebSocket('ws://localhost/ws'))
    act(() => MockWebSocket._instances[0]._open())
    expect(() => {
      act(() => MockWebSocket._instances[0]._message({ event: 'card:created', payload: { id: '1' } }))
    }).not.toThrow()
  })

  it('does not call onEvent for malformed (non-JSON) messages', () => {
    const onEvent = vi.fn()
    renderHook(() => useWebSocket('ws://localhost/ws', { onEvent }))
    act(() => MockWebSocket._instances[0]._open())
    act(() => MockWebSocket._instances[0]._message('not valid json {{'))
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('calls onError with an Error when message JSON is malformed', () => {
    const onError = vi.fn()
    renderHook(() => useWebSocket('ws://localhost/ws', { onError }))
    act(() => MockWebSocket._instances[0]._open())
    act(() => MockWebSocket._instances[0]._message('not valid json {{'))
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
  })

  it('does not throw when no onError callback is provided and JSON is malformed', () => {
    renderHook(() => useWebSocket('ws://localhost/ws'))
    act(() => MockWebSocket._instances[0]._open())
    expect(() => {
      act(() => MockWebSocket._instances[0]._message('not valid json {{'))
    }).not.toThrow()
  })

  it('does not call onEvent when parsed message has no event field', () => {
    const onEvent = vi.fn()
    renderHook(() => useWebSocket('ws://localhost/ws', { onEvent }))
    act(() => MockWebSocket._instances[0]._open())
    act(() => MockWebSocket._instances[0]._message({ payload: { id: '1' } })) // no event field
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('uses latest onEvent callback after prop change (ref pattern — no reconnect)', () => {
    const onEvent1 = vi.fn()
    const onEvent2 = vi.fn()
    let cb = onEvent1
    const { rerender } = renderHook(() => useWebSocket('ws://localhost/ws', { onEvent: cb }))
    act(() => MockWebSocket._instances[0]._open())
    cb = onEvent2
    rerender()
    // Still only 1 WebSocket instance (no reconnect happened)
    expect(MockWebSocket._instances).toHaveLength(1)
    act(() => MockWebSocket._instances[0]._message({ event: 'card:updated', payload: { id: '1' } }))
    expect(onEvent1).not.toHaveBeenCalled()
    expect(onEvent2).toHaveBeenCalledWith('card:updated', { id: '1' })
  })

  it('uses latest onError callback after prop change (ref pattern — no reconnect)', () => {
    const onError1 = vi.fn()
    const onError2 = vi.fn()
    let errCb = onError1
    const { rerender } = renderHook(() => useWebSocket('ws://localhost/ws', { onError: errCb }))
    act(() => MockWebSocket._instances[0]._open())
    errCb = onError2
    rerender()
    // Still only 1 WebSocket instance
    expect(MockWebSocket._instances).toHaveLength(1)
    act(() => MockWebSocket._instances[0]._message('bad json'))
    expect(onError1).not.toHaveBeenCalled()
    expect(onError2).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('event type filtering', () => {
  it('calls onEvent for an event type that is in the events filter array', () => {
    const onEvent = vi.fn()
    renderHook(() => useWebSocket('ws://localhost/ws', { onEvent, events: ['card:created', 'card:updated'] }))
    act(() => MockWebSocket._instances[0]._open())
    act(() => MockWebSocket._instances[0]._message({ event: 'card:created', payload: { id: '1' } }))
    expect(onEvent).toHaveBeenCalledWith('card:created', { id: '1' })
  })

  it('does NOT call onEvent for event types absent from the events filter array', () => {
    const onEvent = vi.fn()
    renderHook(() => useWebSocket('ws://localhost/ws', { onEvent, events: ['card:created'] }))
    act(() => MockWebSocket._instances[0]._open())
    act(() => MockWebSocket._instances[0]._message({ event: 'card:deleted', payload: { id: '1' } }))
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('calls onEvent for all event types when events option is not provided', () => {
    const onEvent = vi.fn()
    renderHook(() => useWebSocket('ws://localhost/ws', { onEvent }))
    act(() => MockWebSocket._instances[0]._open())
    act(() => MockWebSocket._instances[0]._message({ event: 'card:deleted', payload: { id: '1' } }))
    act(() => MockWebSocket._instances[0]._message({ event: 'comment:created', payload: { id: '2' } }))
    expect(onEvent).toHaveBeenCalledTimes(2)
  })

  it('uses latest events filter array after prop change (ref pattern — no reconnect)', () => {
    const onEvent = vi.fn()
    let filter = ['card:created']
    const { rerender } = renderHook(() => useWebSocket('ws://localhost/ws', { onEvent, events: filter }))
    act(() => MockWebSocket._instances[0]._open())

    // Change filter to only allow card:deleted
    filter = ['card:deleted']
    rerender()
    expect(MockWebSocket._instances).toHaveLength(1) // no reconnect

    // card:created is now filtered out
    act(() => MockWebSocket._instances[0]._message({ event: 'card:created', payload: { id: '1' } }))
    expect(onEvent).not.toHaveBeenCalled()

    // card:deleted is now allowed
    act(() => MockWebSocket._instances[0]._message({ event: 'card:deleted', payload: { id: '2' } }))
    expect(onEvent).toHaveBeenCalledWith('card:deleted', { id: '2' })
  })
})

// ---------------------------------------------------------------------------
// SUBTASK 4 — Cleanup and Error Handling
// ---------------------------------------------------------------------------

describe('cleanup on unmount', () => {
  it('closes WebSocket connection on component unmount', () => {
    const { unmount } = renderHook(() => useWebSocket('ws://localhost/ws'))
    act(() => MockWebSocket._instances[0]._open())
    unmount()
    expect(MockWebSocket._instances[0].readyState).toBe(MockWebSocket.CLOSED)
  })

  it('clears pending reconnection timeout on unmount — no new socket created after unmount', async () => {
    vi.useFakeTimers()
    const { unmount } = renderHook(() => useWebSocket('ws://localhost/ws'))
    act(() => MockWebSocket._instances[0]._open())
    act(() => MockWebSocket._instances[0]._close(1006)) // schedules 1000ms timer
    unmount() // cleanup must cancel the timer
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(MockWebSocket._instances).toHaveLength(1) // no reconnect after unmount
  })

  it('does not attempt reconnection after unmount even if a disconnect happens after unmount', async () => {
    vi.useFakeTimers()
    const { unmount } = renderHook(() => useWebSocket('ws://localhost/ws'))
    act(() => MockWebSocket._instances[0]._open())
    unmount()
    // Simulate a late close after unmount — should not trigger reconnect
    act(() => MockWebSocket._instances[0]._close(1006))
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(MockWebSocket._instances).toHaveLength(1)
  })

  it('handles unmount during initial "connecting" state (before onopen fires)', () => {
    const { unmount } = renderHook(() => useWebSocket('ws://localhost/ws'))
    // WebSocket is CONNECTING, no _open() called
    expect(() => unmount()).not.toThrow()
    expect(MockWebSocket._instances[0].readyState).toBe(MockWebSocket.CLOSED)
  })

  it('handles rapid mount/unmount without errors or lingering timers', async () => {
    vi.useFakeTimers()
    // Mount and immediately unmount before any event handlers fire
    expect(() => {
      const { unmount } = renderHook(() => useWebSocket('ws://localhost/ws'))
      unmount()
    }).not.toThrow()
    // Advance time to ensure no stale timers fire and create extra sockets
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(MockWebSocket._instances).toHaveLength(1) // no lingering reconnects
  })
})

describe('error handling via onError callback', () => {
  it('calls onError with an Error object when WebSocket onerror fires', () => {
    const onError = vi.fn()
    renderHook(() => useWebSocket('ws://localhost/ws', { onError }))
    act(() => MockWebSocket._instances[0]._error())
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
  })

  it('status becomes "error" on WebSocket onerror event', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))
    act(() => MockWebSocket._instances[0]._error())
    expect(result.current.status).toBe('error')
  })

  it('does not throw when onerror fires and no onError callback is provided', () => {
    renderHook(() => useWebSocket('ws://localhost/ws'))
    expect(() => {
      act(() => MockWebSocket._instances[0]._error())
    }).not.toThrow()
  })

  it('uses latest onError callback after prop change (ref pattern — no reconnect)', () => {
    const onError1 = vi.fn()
    const onError2 = vi.fn()
    let errCb = onError1
    const { rerender } = renderHook(() => useWebSocket('ws://localhost/ws', { onError: errCb }))
    errCb = onError2
    rerender()
    expect(MockWebSocket._instances).toHaveLength(1) // no reconnect
    act(() => MockWebSocket._instances[0]._error())
    expect(onError1).not.toHaveBeenCalled()
    expect(onError2).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('url change handling', () => {
  it('closes old WebSocket and creates a new one when url prop changes', () => {
    const { rerender } = renderHook(({ url }) => useWebSocket(url), {
      initialProps: { url: 'ws://localhost/ws' }
    })
    act(() => MockWebSocket._instances[0]._open())
    rerender({ url: 'ws://localhost/ws2' })
    expect(MockWebSocket._instances[0].readyState).toBe(MockWebSocket.CLOSED)
    expect(MockWebSocket._instances).toHaveLength(2)
    expect(MockWebSocket._instances[1].url).toBe('ws://localhost/ws2')
  })

  it('clears pending reconnect timers when url changes', async () => {
    vi.useFakeTimers()
    const { rerender } = renderHook(({ url }) => useWebSocket(url), {
      initialProps: { url: 'ws://localhost/ws' }
    })
    act(() => MockWebSocket._instances[0]._close(1006)) // schedules 1000ms timer
    // URL change should cancel the pending timer and open a fresh connection
    rerender({ url: 'ws://localhost/ws2' })
    const countAfterRerender = MockWebSocket._instances.length // 2 (old + new)
    await act(async () => { vi.advanceTimersByTime(2000) })
    // No extra reconnect from the cancelled timer
    expect(MockWebSocket._instances.length).toBe(countAfterRerender)
  })

  it('resets reconnect attempt counter when url changes', async () => {
    vi.useFakeTimers()
    const { rerender } = renderHook(({ url }) => useWebSocket(url), {
      initialProps: { url: 'ws://localhost/ws' }
    })
    // Drive up the attempt counter on url1 (no _open() so counter accumulates)
    act(() => MockWebSocket._instances[0]._close(1006)) // counter 0→1, delay 1000ms
    await act(async () => { vi.advanceTimersByTime(1000) })
    act(() => MockWebSocket._instances[1]._close(1006)) // counter 1→2, delay 2000ms

    // Switch URL — counter should reset to 0
    rerender({ url: 'ws://localhost/ws2' })
    const countBefore = MockWebSocket._instances.length
    act(() => MockWebSocket._instances[countBefore - 1]._open())
    act(() => MockWebSocket._instances[countBefore - 1]._close(1006))
    // First attempt on new URL should use 1000ms (counter was reset), not 4000ms
    await act(async () => { vi.advanceTimersByTime(999) })
    expect(MockWebSocket._instances.length).toBe(countBefore) // not yet
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(MockWebSocket._instances.length).toBe(countBefore + 1) // fired at 1000ms
  })
})

describe('edge cases', () => {
  it('calling disconnect() when already disconnected does not throw', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost/ws'))
    act(() => MockWebSocket._instances[0]._close(1000))
    expect(() => act(() => result.current.disconnect())).not.toThrow()
  })
})
