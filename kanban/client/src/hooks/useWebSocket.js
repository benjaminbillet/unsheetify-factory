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
    reconnectAttemptsRef.current = 0 // reset on URL change or initial mount

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

      ws.onerror = () => {
        setStatus('error')
        onErrorRef.current?.(new Error('WebSocket connection error'))
      }

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
