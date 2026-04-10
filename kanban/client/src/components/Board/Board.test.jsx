import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBoard } from '../../hooks/useBoard.js'
import Board from './Board.jsx'

vi.mock('../../hooks/useBoard.js', () => ({ useBoard: vi.fn() }))

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
})
