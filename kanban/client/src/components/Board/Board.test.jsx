import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useBoard } from '../../hooks/useBoard.js'
import Board from './Board.jsx'

// Capture handlers for use in tests
let capturedOnDragStart
let capturedOnDragEnd

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragStart, onDragEnd }) => {
    capturedOnDragStart = onDragStart
    capturedOnDragEnd = onDragEnd
    return <div data-testid="dnd-context">{children}</div>
  },
  closestCenter: vi.fn(),
  DragOverlay: ({ children }) => <div data-testid="drag-overlay">{children}</div>,
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
  useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
  MouseSensor: class MouseSensor {},
  TouchSensor: class TouchSensor {},
}))
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }) => <>{children}</>,
  useSortable: vi.fn(() => ({
    attributes: {}, listeners: {}, setNodeRef: vi.fn(),
    transform: null, transition: null, isDragging: false,
  })),
  verticalListSortingStrategy: 'vertical',
  arrayMove: vi.fn((arr, from, to) => {
    const result = [...arr]
    const [item] = result.splice(from, 1)
    result.splice(to, 0, item)
    return result
  }),
}))
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: vi.fn(() => '') } },
}))

vi.mock('../../hooks/useBoard.js', () => ({
  useBoard: vi.fn(),
  columnToKey: (col) => col === 'in-progress' ? 'in_progress' : col,
}))

const MOCK_CARD = {
  id: 'c1',
  title: 'Test Card',
  assignee: 'Alice',
  description: 'A description',
  column: 'ready',
  position: 1,
  created_at: Date.now(),
  comments: [],
}

const DEFAULT_STATE = {
  cards: { ready: [], in_progress: [], done: [] },
  loading: false,
  error: null,
  createCard: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  moveCard: vi.fn(),
  addComment: vi.fn(),
}

beforeEach(() => {
  useBoard.mockReturnValue(DEFAULT_STATE)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Board', () => {
  it('renders three column regions', () => {
    render(<Board />)
    expect(screen.getAllByRole('region')).toHaveLength(3)
  })

  it('renders Ready column heading', () => {
    render(<Board />)
    expect(screen.getByRole('heading', { name: 'Ready' })).toBeInTheDocument()
  })

  it('renders In Progress column heading', () => {
    render(<Board />)
    expect(screen.getByRole('heading', { name: 'In Progress' })).toBeInTheDocument()
  })

  it('renders Done column heading', () => {
    render(<Board />)
    expect(screen.getByRole('heading', { name: 'Done' })).toBeInTheDocument()
  })

  it('shows loading indicator when loading is true', () => {
    useBoard.mockReturnValue({ ...DEFAULT_STATE, loading: true })
    render(<Board />)
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
    expect(screen.queryAllByRole('region')).toHaveLength(0)
  })

  it('shows error banner when error is set', () => {
    useBoard.mockReturnValue({ ...DEFAULT_STATE, error: 'fetch failed' })
    render(<Board />)
    expect(screen.getByRole('alert')).toHaveTextContent('fetch failed')
  })

  it('passes ready cards to Ready column', () => {
    useBoard.mockReturnValue({
      ...DEFAULT_STATE,
      cards: { ready: [MOCK_CARD], in_progress: [], done: [] },
    })
    render(<Board />)
    expect(
      within(screen.getByRole('region', { name: 'Ready' })).getByText('Test Card')
    ).toBeInTheDocument()
  })

  it('passes in_progress cards to In Progress column', () => {
    useBoard.mockReturnValue({
      ...DEFAULT_STATE,
      cards: { ready: [], in_progress: [{ ...MOCK_CARD, id: 'c2', column: 'in-progress' }], done: [] },
    })
    render(<Board />)
    expect(
      within(screen.getByRole('region', { name: 'In Progress' })).getByText('Test Card')
    ).toBeInTheDocument()
  })

  it('passes done cards to Done column', () => {
    useBoard.mockReturnValue({
      ...DEFAULT_STATE,
      cards: { ready: [], in_progress: [], done: [{ ...MOCK_CARD, id: 'c3', column: 'done' }] },
    })
    render(<Board />)
    expect(
      within(screen.getByRole('region', { name: 'Done' })).getByText('Test Card')
    ).toBeInTheDocument()
  })

  it('opens modal when a card is clicked', () => {
    useBoard.mockReturnValue({
      ...DEFAULT_STATE,
      cards: { ready: [MOCK_CARD], in_progress: [], done: [] },
    })
    render(<Board />)
    fireEvent.click(screen.getByRole('button', { name: 'Test Card' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes modal when close button is clicked', () => {
    useBoard.mockReturnValue({
      ...DEFAULT_STATE,
      cards: { ready: [MOCK_CARD], in_progress: [], done: [] },
    })
    render(<Board />)
    fireEvent.click(screen.getByRole('button', { name: 'Test Card' }))
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('modal reflects updated card data when useBoard cards state changes', () => {
    const card = { ...MOCK_CARD, title: 'Old Title' }
    useBoard.mockReturnValue({
      ...DEFAULT_STATE,
      cards: { ready: [card], in_progress: [], done: [] },
    })
    const { rerender } = render(<Board />)
    fireEvent.click(screen.getByRole('button', { name: 'Old Title' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Old Title')

    // Simulate useBoard updating the card in place (e.g. after updateCard resolves)
    useBoard.mockReturnValue({
      ...DEFAULT_STATE,
      cards: { ready: [{ ...card, title: 'New Title' }], in_progress: [], done: [] },
    })
    rerender(<Board />)
    expect(screen.getByRole('dialog')).toHaveTextContent('New Title')
  })

  it('modal closes automatically when selected card is removed from cards state', () => {
    useBoard.mockReturnValue({
      ...DEFAULT_STATE,
      cards: { ready: [MOCK_CARD], in_progress: [], done: [] },
    })
    const { rerender } = render(<Board />)
    fireEvent.click(screen.getByRole('button', { name: 'Test Card' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Simulate card being deleted from state
    useBoard.mockReturnValue({
      ...DEFAULT_STATE,
      cards: { ready: [], in_progress: [], done: [] },
    })
    rerender(<Board />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Board — CreateCardForm integration', () => {
  it('renders the "+ Add card" button in the Ready column', () => {
    render(<Board />)
    const readyRegion = screen.getByRole('region', { name: 'Ready' })
    expect(within(readyRegion).getByRole('button', { name: /\+ add card/i })).toBeInTheDocument()
  })

  it('does not render the "+ Add card" button in the In Progress column', () => {
    render(<Board />)
    const ipRegion = screen.getByRole('region', { name: 'In Progress' })
    expect(within(ipRegion).queryByRole('button', { name: /\+ add card/i })).toBeNull()
  })

  it('does not render the "+ Add card" button in the Done column', () => {
    render(<Board />)
    const doneRegion = screen.getByRole('region', { name: 'Done' })
    expect(within(doneRegion).queryByRole('button', { name: /\+ add card/i })).toBeNull()
  })

  it('calls createCard from useBoard when the form is submitted', async () => {
    const createCard = vi.fn().mockResolvedValue(undefined)
    useBoard.mockReturnValue({ ...DEFAULT_STATE, createCard })
    render(<Board />)
    const readyRegion = screen.getByRole('region', { name: 'Ready' })
    fireEvent.click(within(readyRegion).getByRole('button', { name: /\+ add card/i }))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'My new card' } })
    fireEvent.click(screen.getByRole('button', { name: /^add card$/i }))
    await waitFor(() =>
      expect(createCard).toHaveBeenCalledWith({ title: 'My new card', assignee: null })
    )
  })
})

describe('drag and drop setup', () => {
  it('renders DndContext wrapping the board', () => {
    render(<Board />)
    expect(screen.getByTestId('dnd-context')).toBeInTheDocument()
  })

  it('DndContext receives onDragEnd handler', () => {
    render(<Board />)
    expect(capturedOnDragEnd).toBeTypeOf('function')
  })

  it('DndContext receives onDragStart handler', () => {
    render(<Board />)
    expect(capturedOnDragStart).toBeTypeOf('function')
  })

  it('renders DragOverlay inside DndContext', () => {
    render(<Board />)
    expect(screen.getByTestId('drag-overlay')).toBeInTheDocument()
  })
})

describe('onDragEnd handler', () => {
  const CARD_C1 = { id: 'c1', title: 'Card 1', column: 'ready', position: 1, assignee: null, description: null, created_at: 0, comments: [] }
  const CARD_C2 = { id: 'c2', title: 'Card 2', column: 'done', position: 2, assignee: null, description: null, created_at: 0, comments: [] }
  const CARD_C3 = { id: 'c3', title: 'Card 3', column: 'done', position: 4, assignee: null, description: null, created_at: 0, comments: [] }

  it('does nothing when over is null', () => {
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1], in_progress: [], done: [] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'c1' }, over: null })
    expect(DEFAULT_STATE.moveCard).not.toHaveBeenCalled()
  })

  it('does nothing when active.id equals over.id', () => {
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1], in_progress: [], done: [] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'c1' }, over: { id: 'c1' } })
    expect(DEFAULT_STATE.moveCard).not.toHaveBeenCalled()
  })

  it('calls moveCard when card dropped on empty column', () => {
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1], in_progress: [], done: [] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'c1' }, over: { id: 'done' } })
    expect(DEFAULT_STATE.moveCard).toHaveBeenCalledWith('c1', 'done', 1.0)
  })

  it('calls moveCard with position before over card for cross-column drop', () => {
    // c2(pos=2), c3(pos=4) in done; drag c1 from ready over c2 → insert before c2 → position = (0+2)/2 = 1
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1], in_progress: [], done: [CARD_C2, CARD_C3] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'c1' }, over: { id: 'c2' } })
    expect(DEFAULT_STATE.moveCard).toHaveBeenCalledWith('c1', 'done', 1)
  })

  it('calls moveCard for same-column reorder moving card down', () => {
    // [c1(1), c2(2), c3(3)] → drag c1 over c3 → arrayMove([c1,c2,c3],0,2)=[c2,c3,c1] → before=c3.pos=3, after=undefined → 3+1=4
    const c1 = { ...CARD_C1, column: 'ready', position: 1 }
    const c2 = { ...CARD_C2, column: 'ready', position: 2 }
    const c3 = { ...CARD_C3, column: 'ready', position: 3 }
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [c1, c2, c3], in_progress: [], done: [] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'c1' }, over: { id: 'c3' } })
    expect(DEFAULT_STATE.moveCard).toHaveBeenCalledWith('c1', 'ready', 4)
  })

  it('does not call moveCard when card dropped on its own column header', () => {
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1, { ...CARD_C2, column: 'ready' }], in_progress: [], done: [] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'c1' }, over: { id: 'ready' } })
    expect(DEFAULT_STATE.moveCard).not.toHaveBeenCalled()
  })

  it('does not call moveCard when source card is not found in any column', () => {
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1], in_progress: [], done: [] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'nonexistent' }, over: { id: 'done' } })
    expect(DEFAULT_STATE.moveCard).not.toHaveBeenCalled()
  })

  it('same-column reorder moving card up', () => {
    // [c1(1), c2(2), c3(3)] → drag c3 over c1 → arrayMove([c1,c2,c3],2,0)=[c3,c1,c2] → before=0, after=c1.pos=1 → (0+1)/2=0.5
    const c1 = { ...CARD_C1, column: 'ready', position: 1 }
    const c2 = { ...CARD_C2, column: 'ready', position: 2 }
    const c3 = { ...CARD_C3, column: 'ready', position: 3 }
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [c1, c2, c3], in_progress: [], done: [] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'c3' }, over: { id: 'c1' } })
    expect(DEFAULT_STATE.moveCard).toHaveBeenCalledWith('c3', 'ready', 0.5)
  })

  it('cross-column move appends to non-empty column when dropped on column header', () => {
    // done has c2(2); drag c1 over 'done' column → append → position = 2 + 1 = 3
    const c2 = { ...CARD_C2, column: 'done', position: 2 }
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1], in_progress: [], done: [c2] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'c1' }, over: { id: 'done' } })
    expect(DEFAULT_STATE.moveCard).toHaveBeenCalledWith('c1', 'done', 3)
  })

  it('cross-column move inserts before over card when between two cards', () => {
    // in_progress has c2(2), c3(4); drag c1 over c3 → insert before c3 → position = (2+4)/2 = 3
    const c2 = { ...CARD_C2, column: 'in-progress', position: 2 }
    const c3 = { ...CARD_C3, column: 'in-progress', position: 4 }
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1], in_progress: [c2, c3], done: [] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'c1' }, over: { id: 'c3' } })
    expect(DEFAULT_STATE.moveCard).toHaveBeenCalledWith('c1', 'in-progress', 3)
  })

  it('does not call moveCard if same position in same column', () => {
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1], in_progress: [], done: [] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'c1' }, over: { id: 'c1' } })
    expect(DEFAULT_STATE.moveCard).not.toHaveBeenCalled()
  })
})

describe('drag overlay', () => {
  it('DragOverlay is empty when no card is being dragged', () => {
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [], in_progress: [], done: [] } })
    render(<Board />)
    expect(screen.getByTestId('drag-overlay')).toBeEmptyDOMElement()
  })

  it('DragOverlay shows card title during drag', () => {
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [MOCK_CARD], in_progress: [], done: [] } })
    render(<Board />)
    act(() => {
      capturedOnDragStart({ active: { id: MOCK_CARD.id } })
    })
    expect(screen.getByTestId('drag-overlay')).not.toBeEmptyDOMElement()
    expect(within(screen.getByTestId('drag-overlay')).getByText(MOCK_CARD.title)).toBeInTheDocument()
  })
})

describe('findCardColumn', () => {
  const cardsState = {
    ready: [{ id: 'r1', position: 1 }],
    in_progress: [{ id: 'ip1', position: 1 }],
    done: [{ id: 'd1', position: 1 }],
  }

  it('returns "ready" for card in ready column', async () => {
    const { findCardColumn } = await import('./Board.jsx')
    expect(findCardColumn('r1', cardsState)).toBe('ready')
  })
  it('returns "in-progress" for card in in_progress column', async () => {
    const { findCardColumn } = await import('./Board.jsx')
    expect(findCardColumn('ip1', cardsState)).toBe('in-progress')
  })
  it('returns "done" for card in done column', async () => {
    const { findCardColumn } = await import('./Board.jsx')
    expect(findCardColumn('d1', cardsState)).toBe('done')
  })
  it('returns null when card not found', async () => {
    const { findCardColumn } = await import('./Board.jsx')
    expect(findCardColumn('missing', cardsState)).toBeNull()
  })
})

describe('calculatePosition', () => {
  it('returns 1.0 for empty column', async () => {
    const { calculatePosition } = await import('./Board.jsx')
    expect(calculatePosition([], 0)).toBe(1.0)
  })
  it('returns half of first card position when inserting at index 0', async () => {
    const { calculatePosition } = await import('./Board.jsx')
    expect(calculatePosition([{ position: 4 }], 0)).toBe(2)
  })
  it('returns last position + 1 when appending', async () => {
    const { calculatePosition } = await import('./Board.jsx')
    expect(calculatePosition([{ position: 3 }], 1)).toBe(4)
  })
  it('returns midpoint when inserting between two cards', async () => {
    const { calculatePosition } = await import('./Board.jsx')
    expect(calculatePosition([{ position: 2 }, { position: 6 }], 1)).toBe(4)
  })
})
