import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchCards,
  createCard as apiCreateCard,
  updateCard as apiUpdateCard,
  deleteCard as apiDeleteCard,
  createComment,
} from '../api/client.js'

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/**
 * Map API column value → state key.
 * 'in-progress' (hyphen) → 'in_progress' (underscore); others pass through.
 * @param {string} col
 * @returns {string}
 */
export function columnToKey(col) {
  return col === 'in-progress' ? 'in_progress' : col
}

/**
 * Group a flat array of cards into the board state shape, sorted by position.
 * @param {import('../api/client.js').Card[]} cards
 * @returns {{ ready: Card[], in_progress: Card[], done: Card[] }}
 */
function groupCards(cards) {
  const board = { ready: [], in_progress: [], done: [] }
  for (const card of cards) {
    const key = columnToKey(card.column)
    if (key in board) board[key].push(card)
  }
  for (const key of Object.keys(board)) {
    board[key].sort((a, b) => a.position - b.position)
  }
  return board
}

const EMPTY_BOARD = { ready: [], in_progress: [], done: [] }

// Temp-ID counter for optimistic records (module-level so it's stable across renders)
let _tempId = 0
function nextTempId() {
  return '__temp_' + (++_tempId)
}

// ---------------------------------------------------------------------------
// useBoard hook
// ---------------------------------------------------------------------------

/**
 * Manages board state: cards grouped by column, loading, and error.
 *
 * Column convention
 *   - State keys:  ready | in_progress | done  (underscore)
 *   - API values:  ready | in-progress  | done  (hyphen for in-progress)
 *   - All hook functions that accept a column name expect the API format.
 *   - Each card's .column field retains the API format.
 *
 * @returns {{
 *   cards: { ready: Card[], in_progress: Card[], done: Card[] },
 *   loading: boolean,
 *   error: string|null,
 *   createCard: (data: object) => Promise<Card>,
 *   updateCard: (id: string, data: object) => Promise<Card>,
 *   deleteCard: (id: string) => Promise<void>,
 *   moveCard: (id: string, targetColumn: string, position?: number) => Promise<Card>,
 *   addComment: (cardId: string, data: object) => Promise<Comment>,
 * }}
 */
export function useBoard() {
  const [cards, setCards] = useState(EMPTY_BOARD)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Counter for concurrent in-flight operations so loading stays true
  // until the LAST operation finishes.
  const pendingRef = useRef(0)

  // Ref that always holds the latest cards state so we can read it
  // synchronously (functional updaters are called lazily by React, which
  // would leave a rollback variable null if the API rejects as a microtask
  // before the updater runs).
  const cardsRef = useRef(EMPTY_BOARD)

  /**
   * Apply a state update eagerly: compute the next value synchronously from
   * cardsRef.current, update the ref, then call setCards with the plain
   * computed value (not a function) so React picks it up on the next render.
   */
  function applyCards(updater) {
    const next = typeof updater === 'function' ? updater(cardsRef.current) : updater
    cardsRef.current = next
    setCards(next)
  }

  function beginOp() { pendingRef.current++; setLoading(true) }
  function endOp()   { if (--pendingRef.current === 0) setLoading(false) }

  // -------------------------------------------------------------------------
  // Initial data load
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false
    setError(null)
    beginOp()

    fetchCards()
      .then(data => {
        if (cancelled) return
        applyCards(groupCards(data))
        endOp()
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        endOp()
      })

    return () => { cancelled = true }
  }, [])

  // -------------------------------------------------------------------------
  // createCard — temp-ID optimistic pattern
  // -------------------------------------------------------------------------

  const createCard = useCallback(async (data) => {
    const tempId = nextTempId()
    const col = data.column ?? 'ready'
    const key = columnToKey(col)

    const optimisticCard = {
      id: tempId,
      title: data.title,
      assignee: data.assignee ?? null,
      column: col,
      position: Infinity,
      description: data.description ?? null,
      created_at: Date.now(),
      comments: [],
    }

    applyCards(prev => ({ ...prev, [key]: [...prev[key], optimisticCard] }))
    beginOp()

    try {
      const created = await apiCreateCard(data)
      const createdKey = columnToKey(created.column)
      applyCards(prev => {
        const next = { ...prev }
        // Remove the temp card from whichever column it was placed in
        next[key] = next[key].filter(c => c.id !== tempId)
        // Insert the server card into the column the server assigned
        next[createdKey] = [...next[createdKey], created]
          .sort((a, b) => a.position - b.position)
        return next
      })
      return created
    } catch (err) {
      applyCards(prev => ({
        ...prev,
        [key]: prev[key].filter(c => c.id !== tempId),
      }))
      throw err
    } finally {
      endOp()
    }
  }, [])

  // -------------------------------------------------------------------------
  // updateCard — rollback pattern (column changes ignored; use moveCard)
  // -------------------------------------------------------------------------

  const updateCard = useCallback(async (id, data) => {
    // Strip column — column changes must go through moveCard
    const safeData = { ...data }
    delete safeData.column

    // Capture rollback synchronously from the ref (not inside a lazy updater)
    const rollback = cardsRef.current
    applyCards(prev => {
      const next = {}
      for (const [k, col] of Object.entries(prev)) {
        next[k] = col.map(c => c.id === id ? { ...c, ...safeData } : c)
      }
      return next
    })
    beginOp()

    try {
      const updated = await apiUpdateCard(id, safeData)
      applyCards(prev => {
        const next = {}
        for (const [k, col] of Object.entries(prev)) {
          next[k] = col.map(c => c.id === id ? updated : c)
        }
        return next
      })
      return updated
    } catch (err) {
      applyCards(rollback)
      throw err
    } finally {
      endOp()
    }
  }, [])

  // -------------------------------------------------------------------------
  // deleteCard — rollback pattern
  // -------------------------------------------------------------------------

  const deleteCard = useCallback(async (id) => {
    // Capture rollback synchronously from the ref
    const rollback = cardsRef.current
    applyCards(prev => {
      const next = {}
      for (const [k, col] of Object.entries(prev)) {
        next[k] = col.filter(c => c.id !== id)
      }
      return next
    })
    beginOp()

    try {
      await apiDeleteCard(id)
    } catch (err) {
      applyCards(rollback)
      throw err
    } finally {
      endOp()
    }
  }, [])

  // -------------------------------------------------------------------------
  // moveCard — rollback pattern
  // targetColumn must be in API format ('ready' | 'in-progress' | 'done')
  // -------------------------------------------------------------------------

  const moveCard = useCallback(async (id, targetColumn, position) => {
    const targetKey = columnToKey(targetColumn)

    // Capture rollback synchronously from the ref
    const rollback = cardsRef.current
    applyCards(prev => {
      let cardToMove = null
      const next = {}

      for (const [k, col] of Object.entries(prev)) {
        const idx = col.findIndex(c => c.id === id)
        if (idx !== -1) {
          cardToMove = col[idx]
          next[k] = col.filter(c => c.id !== id)
        } else {
          next[k] = col
        }
      }

      if (!cardToMove) return prev

      const movedCard = {
        ...cardToMove,
        column: targetColumn,
        ...(position !== undefined ? { position } : {}),
      }
      next[targetKey] = [...next[targetKey], movedCard]
        .sort((a, b) => a.position - b.position)
      return next
    })
    beginOp()

    try {
      const payload = { column: targetColumn }
      if (position !== undefined) payload.position = position
      const updated = await apiUpdateCard(id, payload)
      const updatedKey = columnToKey(updated.column)
      applyCards(prev => {
        const next = {}
        for (const [k, col] of Object.entries(prev)) {
          next[k] = col.filter(c => c.id !== id)
        }
        next[updatedKey] = [...next[updatedKey], updated]
          .sort((a, b) => a.position - b.position)
        return next
      })
      return updated
    } catch (err) {
      applyCards(rollback)
      throw err
    } finally {
      endOp()
    }
  }, [])

  // -------------------------------------------------------------------------
  // addComment — temp-ID optimistic pattern
  // -------------------------------------------------------------------------

  const addComment = useCallback(async (cardId, data) => {
    const tempId = nextTempId()
    const optimisticComment = {
      id: tempId,
      card_id: cardId,
      author: data.author,
      content: data.content,
      created_at: Date.now(),
    }

    applyCards(prev => {
      const next = {}
      for (const [k, col] of Object.entries(prev)) {
        next[k] = col.map(c =>
          c.id === cardId
            ? { ...c, comments: [...c.comments, optimisticComment] }
            : c
        )
      }
      return next
    })
    beginOp()

    try {
      const comment = await createComment(cardId, data)
      applyCards(prev => {
        const next = {}
        for (const [k, col] of Object.entries(prev)) {
          next[k] = col.map(c =>
            c.id === cardId
              ? {
                  ...c,
                  comments: c.comments
                    .filter(cm => cm.id !== tempId)
                    .concat(comment),
                }
              : c
          )
        }
        return next
      })
      return comment
    } catch (err) {
      applyCards(prev => {
        const next = {}
        for (const [k, col] of Object.entries(prev)) {
          next[k] = col.map(c =>
            c.id === cardId
              ? { ...c, comments: c.comments.filter(cm => cm.id !== tempId) }
              : c
          )
        }
        return next
      })
      throw err
    } finally {
      endOp()
    }
  }, [])

  // -------------------------------------------------------------------------
  // Public interface
  // -------------------------------------------------------------------------

  return {
    cards,
    loading,
    error,
    createCard,
    updateCard,
    deleteCard,
    moveCard,
    addComment,
  }
}
