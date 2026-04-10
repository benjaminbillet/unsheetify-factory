import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useBoard, columnToKey } from './useBoard.js'
import * as api from '../api/client.js'
import { useWebSocket } from './useWebSocket.js'

vi.mock('../api/client.js', () => ({
  fetchCards: vi.fn(),
  createCard: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  createComment: vi.fn(),
}))

vi.mock('./useWebSocket.js', () => ({ useWebSocket: vi.fn() }))

// ---------------------------------------------------------------------------
// Top-level WS mock setup — runs before every test
// mockImplementation (not mockReturnValue) so it always wins over any stale
// implementation left by tests that override it in their body (e.g. reconnect tests).
// vi.clearAllMocks() clears call history but NOT implementations.
// ---------------------------------------------------------------------------
let simulateWsEvent
beforeEach(() => {
  useWebSocket.mockImplementation((url, opts) => {
    simulateWsEvent = opts?.onEvent
    return { status: 'connected', disconnect: vi.fn() }
  })
})

// Shared fixture cards
const FIXTURE_CARDS = [
  { id: 'r1', title: 'Ready One',   column: 'ready',       position: 1, assignee: null, description: null, created_at: 1000, comments: [] },
  { id: 'p1', title: 'In Progress', column: 'in-progress', position: 1, assignee: null, description: null, created_at: 1000, comments: [] },
  { id: 'd1', title: 'Done One',    column: 'done',        position: 1, assignee: null, description: null, created_at: 1000, comments: [] },
]

// ---------------------------------------------------------------------------
// SUBTASK 1 — Basic state structure and initial data loading
// ---------------------------------------------------------------------------

describe('initial state structure', () => {
  beforeEach(() => { api.fetchCards.mockReturnValue(new Promise(() => {})) })
  afterEach(() => vi.clearAllMocks())

  it('cards starts as { ready: [], in_progress: [], done: [] }', () => {
    const { result } = renderHook(() => useBoard())
    expect(result.current.cards).toEqual({ ready: [], in_progress: [], done: [] })
  })

  it('error is null before any fetch completes', () => {
    const { result } = renderHook(() => useBoard())
    expect(result.current.error).toBeNull()
  })
})

describe('initial data loading', () => {
  afterEach(() => vi.clearAllMocks())

  it('loading is true while fetchCards is pending', async () => {
    api.fetchCards.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(true))
  })

  it('loading is false after fetchCards resolves', async () => {
    api.fetchCards.mockResolvedValue([])
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('groups fetched cards into ready, in_progress, done keys', async () => {
    api.fetchCards.mockResolvedValue(FIXTURE_CARDS)
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.cards.ready).toHaveLength(1)
    expect(result.current.cards.in_progress).toHaveLength(1)
    expect(result.current.cards.done).toHaveLength(1)
  })

  it('maps API column "in-progress" to state key "in_progress"', async () => {
    api.fetchCards.mockResolvedValue([
      { id: 'p1', title: 'In Progress', column: 'in-progress', position: 1, assignee: null, description: null, created_at: 1000, comments: [] },
    ])
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.cards.in_progress).toHaveLength(1)
    expect(result.current.cards.in_progress[0].id).toBe('p1')
  })

  it('sorts cards by position ascending within each column', async () => {
    api.fetchCards.mockResolvedValue([
      { id: 'r2', title: 'Second', column: 'ready', position: 2, assignee: null, description: null, created_at: 1000, comments: [] },
      { id: 'r1', title: 'First',  column: 'ready', position: 1, assignee: null, description: null, created_at: 1000, comments: [] },
    ])
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.cards.ready[0].id).toBe('r1')
    expect(result.current.cards.ready[1].id).toBe('r2')
  })

  it('sets error message when fetchCards rejects', async () => {
    api.fetchCards.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.error).toBe('Network error'))
  })

  it('sets loading to false when fetchCards rejects', async () => {
    api.fetchCards.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
  })
})

// ---------------------------------------------------------------------------
// SUBTASK 2 — Optimistic updates for card operations
// ---------------------------------------------------------------------------

describe('createCard', () => {
  beforeEach(() => { api.fetchCards.mockResolvedValue(FIXTURE_CARDS) })
  afterEach(() => vi.clearAllMocks())

  it('immediately adds an optimistic card to the correct column', async () => {
    let resolveCreate
    api.createCard.mockReturnValue(new Promise(r => { resolveCreate = r }))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.createCard({ title: 'New', column: 'ready' }))
    expect(result.current.cards.ready).toHaveLength(2)

    await act(async () => resolveCreate({ id: 'new1', title: 'New', column: 'ready', position: 2, assignee: null, description: null, created_at: 2000, comments: [] }))
  })

  it('defaults to "ready" column when no column is provided in data', async () => {
    let resolveCreate
    api.createCard.mockReturnValue(new Promise(r => { resolveCreate = r }))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.createCard({ title: 'No Column' }))
    expect(result.current.cards.ready).toHaveLength(2)

    await act(async () => resolveCreate({ id: 'nc1', title: 'No Column', column: 'ready', position: 2, assignee: null, description: null, created_at: 2000, comments: [] }))
  })

  it('replaces optimistic card with server card on API success', async () => {
    const serverCard = { id: 'srv1', title: 'New', column: 'ready', position: 2, assignee: null, description: null, created_at: 2000, comments: [] }
    api.createCard.mockResolvedValue(serverCard)
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.createCard({ title: 'New', column: 'ready' }) })

    expect(result.current.cards.ready.find(c => c.id === 'srv1')).toBeTruthy()
    expect(result.current.cards.ready.every(c => !c.id.startsWith('__temp_'))).toBe(true)
  })

  it('removes optimistic card on API failure (rollback)', async () => {
    api.createCard.mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.createCard({ title: 'New', column: 'ready' }).catch(() => {})
    })

    expect(result.current.cards.ready).toHaveLength(1) // back to original
    expect(result.current.cards.ready[0].id).toBe('r1')
  })

  it('throws the error on API failure', async () => {
    api.createCard.mockRejectedValue(new Error('create failed'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(async () => { await result.current.createCard({ title: 'New', column: 'ready' }) })
    ).rejects.toThrow('create failed')
  })

  it('returns the created card on success', async () => {
    const serverCard = { id: 'srv1', title: 'New', column: 'ready', position: 2, assignee: null, description: null, created_at: 2000, comments: [] }
    api.createCard.mockResolvedValue(serverCard)
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let returned
    await act(async () => { returned = await result.current.createCard({ title: 'New', column: 'ready' }) })
    expect(returned).toEqual(serverCard)
  })
})

describe('updateCard', () => {
  beforeEach(() => { api.fetchCards.mockResolvedValue(FIXTURE_CARDS) })
  afterEach(() => vi.clearAllMocks())

  it('immediately applies updated fields to card in state', async () => {
    let resolveUpdate
    api.updateCard.mockReturnValue(new Promise(r => { resolveUpdate = r }))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.updateCard('r1', { title: 'Updated' }))
    expect(result.current.cards.ready[0].title).toBe('Updated')

    await act(async () => resolveUpdate({ id: 'r1', title: 'Updated', column: 'ready', position: 1, assignee: null, description: null, created_at: 1000, comments: [] }))
  })

  it('does not move card to another column if column property is passed (ignores column in data)', async () => {
    let resolveUpdate
    api.updateCard.mockReturnValue(new Promise(r => { resolveUpdate = r }))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.updateCard('r1', { title: 'Updated', column: 'done' }))
    // Card should still be in ready column
    expect(result.current.cards.ready.find(c => c.id === 'r1')).toBeTruthy()
    expect(result.current.cards.done.find(c => c.id === 'r1')).toBeFalsy()

    await act(async () => resolveUpdate({ id: 'r1', title: 'Updated', column: 'ready', position: 1, assignee: null, description: null, created_at: 1000, comments: [] }))
  })

  it('replaces optimistic update with server response on success', async () => {
    const serverCard = { id: 'r1', title: 'Server Title', column: 'ready', position: 1, assignee: 'Alice', description: null, created_at: 1000, comments: [] }
    api.updateCard.mockResolvedValue(serverCard)
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.updateCard('r1', { title: 'Updated' }) })
    expect(result.current.cards.ready.find(c => c.id === 'r1').title).toBe('Server Title')
    expect(result.current.cards.ready.find(c => c.id === 'r1').assignee).toBe('Alice')
  })

  it('restores previous card state on API failure (rollback)', async () => {
    api.updateCard.mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateCard('r1', { title: 'Updated' }).catch(() => {})
    })
    expect(result.current.cards.ready.find(c => c.id === 'r1').title).toBe('Ready One')
  })

  it('throws the error on API failure', async () => {
    api.updateCard.mockRejectedValue(new Error('update failed'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(async () => { await result.current.updateCard('r1', { title: 'Updated' }) })
    ).rejects.toThrow('update failed')
  })
})

describe('deleteCard', () => {
  beforeEach(() => { api.fetchCards.mockResolvedValue(FIXTURE_CARDS) })
  afterEach(() => vi.clearAllMocks())

  it('immediately removes card from state', async () => {
    let resolveDelete
    api.deleteCard.mockReturnValue(new Promise(r => { resolveDelete = r }))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.deleteCard('r1'))
    expect(result.current.cards.ready).toHaveLength(0)

    await act(async () => resolveDelete(null))
  })

  it('restores deleted card on API failure (rollback)', async () => {
    api.deleteCard.mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteCard('r1').catch(() => {})
    })
    expect(result.current.cards.ready.find(c => c.id === 'r1')).toBeTruthy()
  })

  it('throws the error on API failure', async () => {
    api.deleteCard.mockRejectedValue(new Error('delete failed'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(async () => { await result.current.deleteCard('r1') })
    ).rejects.toThrow('delete failed')
  })
})

describe('moveCard', () => {
  beforeEach(() => { api.fetchCards.mockResolvedValue(FIXTURE_CARDS) })
  afterEach(() => vi.clearAllMocks())

  it('immediately moves card from source column to target column', async () => {
    let resolveUpdate
    api.updateCard.mockReturnValue(new Promise(r => { resolveUpdate = r }))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.moveCard('r1', 'done', 2))
    expect(result.current.cards.ready).toHaveLength(0)
    expect(result.current.cards.done).toHaveLength(2)

    await act(async () => resolveUpdate({ id: 'r1', title: 'Ready One', column: 'done', position: 2, assignee: null, description: null, created_at: 1000, comments: [] }))
  })

  it('updates card column field optimistically', async () => {
    let resolveUpdate
    api.updateCard.mockReturnValue(new Promise(r => { resolveUpdate = r }))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.moveCard('r1', 'done', 2))
    const movedCard = result.current.cards.done.find(c => c.id === 'r1')
    expect(movedCard).toBeTruthy()
    expect(movedCard.column).toBe('done')

    await act(async () => resolveUpdate({ id: 'r1', title: 'Ready One', column: 'done', position: 2, assignee: null, description: null, created_at: 1000, comments: [] }))
  })

  it('replaces optimistic state with server response on success', async () => {
    const serverCard = { id: 'r1', title: 'Ready One', column: 'done', position: 99, assignee: 'Alice', description: null, created_at: 1000, comments: [] }
    api.updateCard.mockResolvedValue(serverCard)
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.moveCard('r1', 'done', 2) })
    const card = result.current.cards.done.find(c => c.id === 'r1')
    expect(card.position).toBe(99)
    expect(card.assignee).toBe('Alice')
  })

  it('restores card to original column on API failure (rollback)', async () => {
    api.updateCard.mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.moveCard('r1', 'done', 2).catch(() => {})
    })
    expect(result.current.cards.ready.find(c => c.id === 'r1')).toBeTruthy()
    expect(result.current.cards.done.find(c => c.id === 'r1')).toBeFalsy()
  })

  it('throws the error on API failure', async () => {
    api.updateCard.mockRejectedValue(new Error('move failed'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(async () => { await result.current.moveCard('r1', 'done', 2) })
    ).rejects.toThrow('move failed')
  })
})

describe('addComment', () => {
  beforeEach(() => { api.fetchCards.mockResolvedValue(FIXTURE_CARDS) })
  afterEach(() => vi.clearAllMocks())

  it('optimistically adds a temp comment to the card', async () => {
    let resolveComment
    api.createComment.mockReturnValue(new Promise(r => { resolveComment = r }))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.addComment('r1', { author: 'Bob', content: 'Hello' }))
    expect(result.current.cards.ready[0].comments).toHaveLength(1)
    expect(result.current.cards.ready[0].comments[0].author).toBe('Bob')

    await act(async () => resolveComment({ id: 'c1', card_id: 'r1', author: 'Bob', content: 'Hello', created_at: 2000 }))
  })

  it('replaces temp comment with server comment on success', async () => {
    const serverComment = { id: 'c1', card_id: 'r1', author: 'Bob', content: 'Hello', created_at: 2000 }
    api.createComment.mockResolvedValue(serverComment)
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.addComment('r1', { author: 'Bob', content: 'Hello' }) })
    const comments = result.current.cards.ready[0].comments
    expect(comments).toHaveLength(1)
    expect(comments[0].id).toBe('c1')
    expect(comments[0].id.startsWith('__temp_')).toBe(false)
  })

  it('removes temp comment on API failure (rollback)', async () => {
    api.createComment.mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.addComment('r1', { author: 'Bob', content: 'Hello' }).catch(() => {})
    })
    expect(result.current.cards.ready[0].comments).toHaveLength(0)
  })

  it('throws the error on API failure', async () => {
    api.createComment.mockRejectedValue(new Error('comment failed'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(async () => { await result.current.addComment('r1', { author: 'Bob', content: 'Hello' }) })
    ).rejects.toThrow('comment failed')
  })

  it('returns the created comment on success', async () => {
    const serverComment = { id: 'c1', card_id: 'r1', author: 'Bob', content: 'Hello', created_at: 2000 }
    api.createComment.mockResolvedValue(serverComment)
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let returned
    await act(async () => { returned = await result.current.addComment('r1', { author: 'Bob', content: 'Hello' }) })
    expect(returned).toEqual(serverComment)
  })
})

// ---------------------------------------------------------------------------
// SUBTASK 3 — Error handling and loading states
// ---------------------------------------------------------------------------

describe('error state', () => {
  afterEach(() => vi.clearAllMocks())

  it('error is null initially', () => {
    api.fetchCards.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useBoard())
    expect(result.current.error).toBeNull()
  })

  it('error is set to err.message when fetchCards rejects', async () => {
    api.fetchCards.mockRejectedValue(new Error('fetch failed'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.error).toBe('fetch failed'))
  })

  it('error remains null when fetchCards succeeds', async () => {
    api.fetchCards.mockResolvedValue([])
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
  })
})

describe('loading state — initial fetch', () => {
  afterEach(() => vi.clearAllMocks())

  it('loading is true while fetchCards is in flight', async () => {
    api.fetchCards.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(true))
  })

  it('loading is false after fetchCards resolves successfully', async () => {
    api.fetchCards.mockResolvedValue([])
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('loading is false after fetchCards rejects', async () => {
    api.fetchCards.mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
  })
})

describe('loading state — individual operations', () => {
  beforeEach(() => { api.fetchCards.mockResolvedValue(FIXTURE_CARDS) })
  afterEach(() => vi.clearAllMocks())

  it('loading becomes true while createCard API call is pending', async () => {
    api.createCard.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.createCard({ title: 'New', column: 'ready' }))
    await waitFor(() => expect(result.current.loading).toBe(true))
  })

  it('loading returns to false after createCard succeeds', async () => {
    api.createCard.mockResolvedValue({ id: 'x1', title: 'New', column: 'ready', position: 2, assignee: null, description: null, created_at: 2000, comments: [] })
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.createCard({ title: 'New', column: 'ready' }) })
    expect(result.current.loading).toBe(false)
  })

  it('loading returns to false after createCard fails', async () => {
    api.createCard.mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.createCard({ title: 'New', column: 'ready' }).catch(() => {}) })
    expect(result.current.loading).toBe(false)
  })

  it('loading becomes true while updateCard API call is pending', async () => {
    api.updateCard.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.updateCard('r1', { title: 'Updated' }))
    await waitFor(() => expect(result.current.loading).toBe(true))
  })

  it('loading returns to false after updateCard completes', async () => {
    api.updateCard.mockResolvedValue({ id: 'r1', title: 'Updated', column: 'ready', position: 1, assignee: null, description: null, created_at: 1000, comments: [] })
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.updateCard('r1', { title: 'Updated' }) })
    expect(result.current.loading).toBe(false)
  })

  it('loading becomes true while deleteCard API call is pending', async () => {
    api.deleteCard.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.deleteCard('r1'))
    await waitFor(() => expect(result.current.loading).toBe(true))
  })

  it('loading returns to false after deleteCard completes', async () => {
    api.deleteCard.mockResolvedValue(null)
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.deleteCard('r1') })
    expect(result.current.loading).toBe(false)
  })

  it('loading becomes true while moveCard API call is pending', async () => {
    api.updateCard.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.moveCard('r1', 'done', 2))
    await waitFor(() => expect(result.current.loading).toBe(true))
  })

  it('loading returns to false after moveCard completes', async () => {
    api.updateCard.mockResolvedValue({ id: 'r1', title: 'Ready One', column: 'done', position: 2, assignee: null, description: null, created_at: 1000, comments: [] })
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.moveCard('r1', 'done', 2) })
    expect(result.current.loading).toBe(false)
  })

  it('loading becomes true while addComment API call is pending', async () => {
    api.createComment.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.addComment('r1', { author: 'Bob', content: 'Hi' }))
    await waitFor(() => expect(result.current.loading).toBe(true))
  })

  it('loading returns to false after addComment completes', async () => {
    api.createComment.mockResolvedValue({ id: 'c1', card_id: 'r1', author: 'Bob', content: 'Hi', created_at: 2000 })
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.addComment('r1', { author: 'Bob', content: 'Hi' }) })
    expect(result.current.loading).toBe(false)
  })
})

describe('operation error propagation', () => {
  beforeEach(() => { api.fetchCards.mockResolvedValue(FIXTURE_CARDS) })
  afterEach(() => vi.clearAllMocks())

  it('createCard re-throws API error after rollback', async () => {
    api.createCard.mockRejectedValue(new Error('create err'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(async () => { await result.current.createCard({ title: 'X', column: 'ready' }) })
    ).rejects.toThrow('create err')
  })

  it('updateCard re-throws API error after rollback', async () => {
    api.updateCard.mockRejectedValue(new Error('update err'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(async () => { await result.current.updateCard('r1', { title: 'X' }) })
    ).rejects.toThrow('update err')
  })

  it('deleteCard re-throws API error after rollback', async () => {
    api.deleteCard.mockRejectedValue(new Error('delete err'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(async () => { await result.current.deleteCard('r1') })
    ).rejects.toThrow('delete err')
  })

  it('moveCard re-throws API error after rollback', async () => {
    api.updateCard.mockRejectedValue(new Error('move err'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(async () => { await result.current.moveCard('r1', 'done', 2) })
    ).rejects.toThrow('move err')
  })

  it('addComment re-throws API error after rollback', async () => {
    api.createComment.mockRejectedValue(new Error('comment err'))
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(async () => { await result.current.addComment('r1', { author: 'Bob', content: 'Hi' }) })
    ).rejects.toThrow('comment err')
  })
})

// ---------------------------------------------------------------------------
// SUBTASK 4 — State structure for efficient column-based rendering
// ---------------------------------------------------------------------------

describe('state shape', () => {
  beforeEach(() => { api.fetchCards.mockResolvedValue(FIXTURE_CARDS) })
  afterEach(() => vi.clearAllMocks())

  it('cards object has exactly the keys: ready, in_progress, done', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(Object.keys(result.current.cards).sort()).toEqual(['done', 'in_progress', 'ready'])
  })

  it('each column key holds an array', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(Array.isArray(result.current.cards.ready)).toBe(true)
    expect(Array.isArray(result.current.cards.in_progress)).toBe(true)
    expect(Array.isArray(result.current.cards.done)).toBe(true)
  })

  it('cards in each column have their .column field preserved as-is from API', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.cards.in_progress[0].column).toBe('in-progress')
    expect(result.current.cards.ready[0].column).toBe('ready')
    expect(result.current.cards.done[0].column).toBe('done')
  })

  it('in_progress column contains cards with column === "in-progress"', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.cards.in_progress.every(c => c.column === 'in-progress')).toBe(true)
  })

  it('cards within a column are sorted by position ascending', async () => {
    api.fetchCards.mockResolvedValue([
      { id: 'r3', title: 'Third',  column: 'ready', position: 3, assignee: null, description: null, created_at: 1000, comments: [] },
      { id: 'r1', title: 'First',  column: 'ready', position: 1, assignee: null, description: null, created_at: 1000, comments: [] },
      { id: 'r2', title: 'Second', column: 'ready', position: 2, assignee: null, description: null, created_at: 1000, comments: [] },
    ])
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.cards.ready.map(c => c.id)).toEqual(['r1', 'r2', 'r3'])
  })

  it('cards with equal positions maintain stable relative order', async () => {
    api.fetchCards.mockResolvedValue([
      { id: 'r1', title: 'First',  column: 'ready', position: 1, assignee: null, description: null, created_at: 1000, comments: [] },
      { id: 'r2', title: 'Second', column: 'ready', position: 1, assignee: null, description: null, created_at: 1000, comments: [] },
    ])
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Both have same position — order should be stable (r1 before r2 as received)
    const ids = result.current.cards.ready.map(c => c.id)
    expect(ids).toEqual(['r1', 'r2'])
  })
})

// ---------------------------------------------------------------------------
// SUBTASK 19.1 — WebSocket hook integration
// ---------------------------------------------------------------------------

describe('WebSocket integration — initialization', () => {
  // Use a never-resolving promise so the async fetchCards state update
  // (loading → false) never fires outside of act(), suppressing act() warnings.
  beforeEach(() => { api.fetchCards.mockReturnValue(new Promise(() => {})) })
  afterEach(() => vi.clearAllMocks())

  it('calls useWebSocket with a ws:// URL containing /ws', () => {
    renderHook(() => useBoard())
    const url = useWebSocket.mock.calls[0][0]
    expect(url).toMatch(/^wss?:\/\/.+\/ws$/)
  })

  it('subscribes to all 5 event types', () => {
    renderHook(() => useBoard())
    const { events } = useWebSocket.mock.calls[0][1]
    expect(events).toEqual(['card:created', 'card:updated', 'card:deleted', 'card:moved', 'comment:created'])
  })

  it('passes an onEvent callback to useWebSocket', () => {
    renderHook(() => useBoard())
    const { onEvent } = useWebSocket.mock.calls[0][1]
    expect(typeof onEvent).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// SUBTASK 19.2 — WebSocket event handlers
// ---------------------------------------------------------------------------

describe('WebSocket event: card:created', () => {
  beforeEach(() => { api.fetchCards.mockResolvedValue(FIXTURE_CARDS) })
  afterEach(() => vi.clearAllMocks())

  it('adds card to the ready column', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('card:created', { id: 'ws1', title: 'WS', column: 'ready', position: 2, assignee: null, description: null, created_at: 2000 }))
    expect(result.current.cards.ready).toHaveLength(2)
  })

  it('adds card to in_progress column for in-progress API value', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('card:created', { id: 'ws2', title: 'WS IP', column: 'in-progress', position: 2, assignee: null, description: null, created_at: 2000 }))
    expect(result.current.cards.in_progress).toHaveLength(2)
    expect(result.current.cards.in_progress.find(c => c.id === 'ws2')).toBeTruthy()
  })

  it('adds card to done column', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('card:created', { id: 'ws3', title: 'WS Done', column: 'done', position: 2, assignee: null, description: null, created_at: 2000 }))
    expect(result.current.cards.done).toHaveLength(2)
    expect(result.current.cards.done.find(c => c.id === 'ws3')).toBeTruthy()
  })

  it('initializes comments as empty array', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('card:created', { id: 'ws1', title: 'WS', column: 'ready', position: 2, assignee: null, description: null, created_at: 2000 }))
    const newCard = result.current.cards.ready.find(c => c.id === 'ws1')
    expect(newCard.comments).toEqual([])
  })

  it('inserts card sorted by position', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('card:created', { id: 'ws0', title: 'Before', column: 'ready', position: 0.5, assignee: null, description: null, created_at: 2000 }))
    expect(result.current.cards.ready[0].id).toBe('ws0')
    expect(result.current.cards.ready[1].id).toBe('r1')
  })

  it('ignores event if card already exists (idempotent)', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const payload = { id: 'ws1', title: 'WS', column: 'ready', position: 2, assignee: null, description: null, created_at: 2000 }
    act(() => simulateWsEvent('card:created', payload))
    act(() => simulateWsEvent('card:created', payload))
    expect(result.current.cards.ready).toHaveLength(2)
  })
})

describe('WebSocket event: card:updated', () => {
  beforeEach(() => { api.fetchCards.mockResolvedValue(FIXTURE_CARDS) })
  afterEach(() => vi.clearAllMocks())

  it('updates card title in place', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('card:updated', { id: 'r1', column: 'ready', position: 1, title: 'New Title', assignee: null, description: null, created_at: 1000 }))
    expect(result.current.cards.ready[0].title).toBe('New Title')
    expect(result.current.cards.ready).toHaveLength(1)
  })

  it('updates card assignee in place', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('card:updated', { id: 'r1', column: 'ready', position: 1, title: 'Ready One', assignee: 'Alice', description: null, created_at: 1000 }))
    expect(result.current.cards.ready[0].assignee).toBe('Alice')
  })

  it('preserves existing comments when updating card', async () => {
    const cardWithComment = { ...FIXTURE_CARDS[0], comments: [{ id: 'c0', card_id: 'r1', author: 'Alice', content: 'Hi', created_at: 500 }] }
    api.fetchCards.mockResolvedValue([cardWithComment, ...FIXTURE_CARDS.slice(1)])
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('card:updated', { id: 'r1', column: 'ready', position: 1, title: 'Updated', assignee: null, description: null, created_at: 1000 }))
    expect(result.current.cards.ready[0].comments).toHaveLength(1)
    expect(result.current.cards.ready[0].comments[0].id).toBe('c0')
  })

  it('does nothing when card does not exist', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const before = result.current.cards
    act(() => simulateWsEvent('card:updated', { id: 'unknown', column: 'ready', position: 1, title: 'X', assignee: null, description: null, created_at: 1000 }))
    expect(result.current.cards).toEqual(before)
  })

  it('moves card to new column when column field changes (cross-client move sync)', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('card:updated', { id: 'r1', column: 'done', position: 2, title: 'Ready One', assignee: null, description: null, created_at: 1000 }))
    expect(result.current.cards.ready).toHaveLength(0)
    expect(result.current.cards.done).toHaveLength(2)
    expect(result.current.cards.done.find(c => c.id === 'r1').column).toBe('done')
  })
})

describe('WebSocket event: card:deleted', () => {
  beforeEach(() => { api.fetchCards.mockResolvedValue(FIXTURE_CARDS) })
  afterEach(() => vi.clearAllMocks())

  it('removes card from its column', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('card:deleted', { id: 'r1' }))
    expect(result.current.cards.ready).toHaveLength(0)
  })

  it('does nothing when card does not exist', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const before = result.current.cards
    act(() => simulateWsEvent('card:deleted', { id: 'unknown' }))
    expect(result.current.cards).toEqual(before)
  })
})

describe('WebSocket event: card:moved', () => {
  beforeEach(() => { api.fetchCards.mockResolvedValue(FIXTURE_CARDS) })
  afterEach(() => vi.clearAllMocks())

  it('moves card from ready to done', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('card:moved', { id: 'r1', column: 'done', position: 2, title: 'Ready One', assignee: null, description: null, created_at: 1000 }))
    expect(result.current.cards.done.find(c => c.id === 'r1')).toBeTruthy()
  })

  it('removes card from its original column', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('card:moved', { id: 'r1', column: 'done', position: 2, title: 'Ready One', assignee: null, description: null, created_at: 1000 }))
    expect(result.current.cards.ready).toHaveLength(0)
  })

  it('updates card column field to new column', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('card:moved', { id: 'r1', column: 'done', position: 2, title: 'Ready One', assignee: null, description: null, created_at: 1000 }))
    expect(result.current.cards.done.find(c => c.id === 'r1').column).toBe('done')
  })

  it('re-sorts target column by position after move', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('card:moved', { id: 'r1', column: 'done', position: 0.5, title: 'Ready One', assignee: null, description: null, created_at: 1000 }))
    expect(result.current.cards.done[0].id).toBe('r1')
    expect(result.current.cards.done[1].id).toBe('d1')
  })

  it('preserves card comments when moving', async () => {
    const cardWithComment = { ...FIXTURE_CARDS[0], comments: [{ id: 'c0', card_id: 'r1', author: 'Alice', content: 'Hi', created_at: 500 }] }
    api.fetchCards.mockResolvedValue([cardWithComment, ...FIXTURE_CARDS.slice(1)])
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('card:moved', { id: 'r1', column: 'done', position: 2, title: 'Ready One', assignee: null, description: null, created_at: 1000 }))
    const movedCard = result.current.cards.done.find(c => c.id === 'r1')
    expect(movedCard.comments).toHaveLength(1)
    expect(movedCard.comments[0].id).toBe('c0')
  })

  it('does nothing when card does not exist', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const before = result.current.cards
    act(() => simulateWsEvent('card:moved', { id: 'unknown', column: 'done', position: 1, title: 'X', assignee: null, description: null, created_at: 1000 }))
    expect(result.current.cards).toEqual(before)
  })
})

describe('WebSocket event: comment:created', () => {
  beforeEach(() => { api.fetchCards.mockResolvedValue(FIXTURE_CARDS) })
  afterEach(() => vi.clearAllMocks())

  it('appends comment to the card comments array', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('comment:created', { id: 'cm1', card_id: 'r1', author: 'Bob', content: 'Hey', created_at: 2000 }))
    expect(result.current.cards.ready[0].comments).toHaveLength(1)
  })

  it('preserves existing comments when adding new one', async () => {
    const cardWithComment = { ...FIXTURE_CARDS[0], comments: [{ id: 'c0', card_id: 'r1', author: 'Alice', content: 'First', created_at: 500 }] }
    api.fetchCards.mockResolvedValue([cardWithComment, ...FIXTURE_CARDS.slice(1)])
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('comment:created', { id: 'cm1', card_id: 'r1', author: 'Bob', content: 'Second', created_at: 2000 }))
    expect(result.current.cards.ready[0].comments).toHaveLength(2)
  })

  it('does nothing when card does not exist', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const before = result.current.cards
    act(() => simulateWsEvent('comment:created', { id: 'cm1', card_id: 'unknown', author: 'Bob', content: 'Hey', created_at: 2000 }))
    expect(result.current.cards).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// SUBTASK 19.3 — Optimistic update deduplication
// ---------------------------------------------------------------------------

describe('optimistic update deduplication', () => {
  beforeEach(() => { api.fetchCards.mockResolvedValue(FIXTURE_CARDS) })
  afterEach(() => vi.clearAllMocks())

  it('ignores card:created WS event after local createCard succeeds', async () => {
    const serverCard = { id: 'srv1', column: 'ready', position: 2, title: 'New', assignee: null, description: null, created_at: 2000, comments: [] }
    api.createCard.mockResolvedValue(serverCard)
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.createCard({ title: 'New', column: 'ready' }) })
    act(() => simulateWsEvent('card:created', { id: 'srv1', column: 'ready', position: 2, title: 'New', assignee: null, description: null, created_at: 2000 }))
    expect(result.current.cards.ready).toHaveLength(2) // r1 + srv1, NOT 3
  })

  it('ignores comment:created WS event after local addComment succeeds', async () => {
    api.createComment.mockResolvedValue({ id: 'cm1', card_id: 'r1', author: 'Bob', content: 'hi', created_at: 2000 })
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.addComment('r1', { author: 'Bob', content: 'hi' }) })
    act(() => simulateWsEvent('comment:created', { id: 'cm1', card_id: 'r1', author: 'Bob', content: 'hi', created_at: 2000 }))
    expect(result.current.cards.ready[0].comments).toHaveLength(1) // not 2
  })

  it('ignores card:updated WS event after local updateCard call', async () => {
    api.updateCard.mockReturnValue(new Promise(() => {})) // keep pending
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.updateCard('r1', { title: 'Local' }))
    act(() => simulateWsEvent('card:updated', { id: 'r1', column: 'ready', position: 1, title: 'Remote', assignee: null, description: null, created_at: 1000 }))
    expect(result.current.cards.ready[0].title).toBe('Local') // WS suppressed
  })

  it('ignores card:deleted WS event after local deleteCard call', async () => {
    api.deleteCard.mockReturnValue(new Promise(() => {})) // keep pending
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.deleteCard('r1'))
    act(() => simulateWsEvent('card:deleted', { id: 'r1' }))
    expect(result.current.cards.ready).toHaveLength(0) // stays deleted, no crash
  })

  it('ignores card:updated WS event (with column change) after local moveCard call', async () => {
    api.updateCard.mockReturnValue(new Promise(() => {})) // keep pending
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.moveCard('r1', 'done', 2))
    act(() => simulateWsEvent('card:updated', { id: 'r1', column: 'done', position: 2, title: 'Ready One', assignee: null, description: null, created_at: 1000 }))
    expect(result.current.cards.done).toHaveLength(2) // d1 + r1, NOT 3
    expect(result.current.cards.ready).toHaveLength(0)
  })

  it('does NOT suppress WS event for a different card', async () => {
    api.updateCard.mockReturnValue(new Promise(() => {})) // keep pending
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.updateCard('r1', { title: 'Changed' }))
    act(() => simulateWsEvent('card:updated', { id: 'p1', column: 'in-progress', position: 1, title: 'Updated P1', assignee: null, description: null, created_at: 1000 }))
    expect(result.current.cards.in_progress[0].title).toBe('Updated P1') // not suppressed
  })

  it('suppression is consumed: second WS event for same card is applied', async () => {
    api.updateCard.mockReturnValue(new Promise(() => {})) // keep pending
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => void result.current.updateCard('r1', { title: 'Local' }))
    // First WS event — suppressed (consumes suppression entry)
    act(() => simulateWsEvent('card:updated', { id: 'r1', column: 'ready', position: 1, title: 'First Remote', assignee: null, description: null, created_at: 1000 }))
    // Second WS event — NOT suppressed (entry already consumed)
    act(() => simulateWsEvent('card:updated', { id: 'r1', column: 'ready', position: 1, title: 'Second Remote', assignee: null, description: null, created_at: 1000 }))
    expect(result.current.cards.ready[0].title).toBe('Second Remote')
  })
})

// ---------------------------------------------------------------------------
// SUBTASK 19.4 — Multi-client state consistency
// ---------------------------------------------------------------------------

describe('multi-client state consistency', () => {
  beforeEach(() => { api.fetchCards.mockResolvedValue(FIXTURE_CARDS) })
  afterEach(() => vi.clearAllMocks())

  it('WS card:created from another client adds card (not suppressed)', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('card:created', { id: 'ext1', column: 'ready', position: 2, title: 'External', assignee: null, description: null, created_at: 2000 }))
    expect(result.current.cards.ready).toHaveLength(2)
  })

  it('successive card:moved WS events apply in order (last write wins)', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => simulateWsEvent('card:moved', { id: 'r1', column: 'done', position: 2, title: 'Ready One', assignee: null, description: null, created_at: 1000 }))
    act(() => simulateWsEvent('card:moved', { id: 'r1', column: 'in-progress', position: 2, title: 'Ready One', assignee: null, description: null, created_at: 1000 }))
    expect(result.current.cards.in_progress.find(c => c.id === 'r1')).toBeTruthy()
    expect(result.current.cards.done.find(c => c.id === 'r1')).toBeFalsy()
  })

  it('refetches board state when WebSocket reconnects after disconnect', async () => {
    let mockWsStatus = 'connected'
    useWebSocket.mockImplementation(() => ({ status: mockWsStatus, disconnect: vi.fn() }))
    const { result, rerender } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Simulate disconnect → reconnect
    act(() => { mockWsStatus = 'disconnected'; rerender() })
    // await act to flush the async fetchCards() triggered by the reconnect useEffect
    await act(async () => { mockWsStatus = 'connected'; rerender() })
    expect(api.fetchCards).toHaveBeenCalledTimes(2)
  })

  it('does not refetch on initial connection (only on reconnect)', async () => {
    const { result } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(api.fetchCards).toHaveBeenCalledTimes(1)
  })

  it('state reflects re-fetched data after reconnect', async () => {
    const secondFetchData = [{ id: 'd2', title: 'New Done', column: 'done', position: 1, assignee: null, description: null, created_at: 2000, comments: [] }]
    api.fetchCards.mockResolvedValueOnce(FIXTURE_CARDS).mockResolvedValueOnce(secondFetchData)
    let mockWsStatus = 'connected'
    useWebSocket.mockImplementation(() => ({ status: mockWsStatus, disconnect: vi.fn() }))
    const { result, rerender } = renderHook(() => useBoard())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Simulate disconnect → reconnect
    act(() => { mockWsStatus = 'disconnected'; rerender() })
    act(() => { mockWsStatus = 'connected'; rerender() })
    await waitFor(() => expect(result.current.cards.done).toHaveLength(1))
    expect(result.current.cards.done[0].id).toBe('d2')
    expect(result.current.cards.ready).toHaveLength(0)
  })
})

describe('helper: columnToKey', () => {
  it('returns "in_progress" for "in-progress"', () => {
    expect(columnToKey('in-progress')).toBe('in_progress')
  })

  it('returns "ready" for "ready"', () => {
    expect(columnToKey('ready')).toBe('ready')
  })

  it('returns "done" for "done"', () => {
    expect(columnToKey('done')).toBe('done')
  })
})
