import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useBoard, columnToKey } from './useBoard.js'
import * as api from '../api/client.js'

vi.mock('../api/client.js', () => ({
  fetchCards: vi.fn(),
  createCard: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  createComment: vi.fn(),
}))

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
