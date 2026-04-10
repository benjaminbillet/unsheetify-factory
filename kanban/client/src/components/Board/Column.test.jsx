import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useDroppable } from '@dnd-kit/core'
import Column from './Column.jsx'

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children, items }) => (
    <div data-testid="sortable-context" data-items={JSON.stringify(items)}>{children}</div>
  ),
  verticalListSortingStrategy: 'vertical',
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
}))
vi.mock('@dnd-kit/core', () => ({
  useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
}))
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: vi.fn(() => '') } },
}))

const makeCard = (id, title, pos) => ({
  id,
  title,
  assignee: 'Alice',
  description: 'desc',
  column: 'ready',
  position: pos,
  created_at: Date.now(),
  comments: [],
})

const MOCK_CARDS = [
  makeCard('1', 'Card One', 1),
  makeCard('2', 'Card Two', 2),
  makeCard('3', 'Card Three', 3),
]

describe('Column', () => {
  it('renders the column title', () => {
    render(<Column title="Ready" cards={MOCK_CARDS} onCardClick={vi.fn()} onUpdate={vi.fn()} columnId="ready" />)
    expect(screen.getByRole('heading', { name: 'Ready' })).toBeInTheDocument()
  })

  it('renders card count equal to number of cards', () => {
    render(<Column title="Ready" cards={MOCK_CARDS} onCardClick={vi.fn()} onUpdate={vi.fn()} columnId="ready" />)
    expect(screen.getByLabelText('3 cards')).toBeInTheDocument()
  })

  it('renders 0 count for empty column', () => {
    render(<Column title="Ready" cards={[]} onCardClick={vi.fn()} onUpdate={vi.fn()} columnId="ready" />)
    expect(screen.getByLabelText('0 cards')).toBeInTheDocument()
  })

  it('renders a CardTile for each card', () => {
    render(<Column title="Ready" cards={MOCK_CARDS} onCardClick={vi.fn()} onUpdate={vi.fn()} columnId="ready" />)
    expect(screen.getByText('Card One')).toBeInTheDocument()
    expect(screen.getByText('Card Two')).toBeInTheDocument()
    expect(screen.getByText('Card Three')).toBeInTheDocument()
  })

  it('renders empty state message when no cards', () => {
    render(<Column title="Ready" cards={[]} onCardClick={vi.fn()} onUpdate={vi.fn()} columnId="ready" />)
    expect(screen.getByText(/no cards/i)).toBeInTheDocument()
  })

  it('calls onCardClick with the correct card when a CardTile is clicked', () => {
    const handler = vi.fn()
    render(<Column title="Ready" cards={MOCK_CARDS} onCardClick={handler} onUpdate={vi.fn()} columnId="ready" />)
    fireEvent.click(screen.getByRole('button', { name: 'Card One' }))
    expect(handler).toHaveBeenCalledWith(MOCK_CARDS[0])
  })

  it('renders the footer prop below the cards area when provided', () => {
    render(
      <Column title="Ready" cards={[]} onCardClick={vi.fn()} onUpdate={vi.fn()} columnId="ready"
        footer={<div data-testid="col-footer">Footer content</div>} />
    )
    expect(screen.getByTestId('col-footer')).toBeInTheDocument()
  })

  it('renders nothing extra when footer prop is not provided', () => {
    const { container } = render(<Column title="Ready" cards={[]} onCardClick={vi.fn()} onUpdate={vi.fn()} columnId="ready" />)
    const section = container.querySelector('.column')
    expect(section.children).toHaveLength(2) // header + sortable-context wrapper only
  })

  it('Column renders SortableContext', () => {
    render(<Column title="Ready" cards={MOCK_CARDS} onCardClick={vi.fn()} onUpdate={vi.fn()} columnId="ready" />)
    expect(screen.getByTestId('sortable-context')).toBeInTheDocument()
  })

  it('Column passes card IDs to SortableContext items', () => {
    render(<Column title="Ready" cards={MOCK_CARDS} onCardClick={vi.fn()} onUpdate={vi.fn()} columnId="ready" />)
    const items = JSON.parse(screen.getByTestId('sortable-context').dataset.items)
    expect(items).toEqual(['1', '2', '3'])
  })

  it('Column applies column-drag-over class when isOver is true', () => {
    useDroppable.mockReturnValueOnce({ setNodeRef: vi.fn(), isOver: true })
    render(<Column title="Ready" cards={MOCK_CARDS} onCardClick={vi.fn()} onUpdate={vi.fn()} columnId="ready" />)
    expect(screen.getByRole('region', { name: 'Ready' })).toHaveClass('column-drag-over')
  })

  it('Column does not apply column-drag-over class when isOver is false', () => {
    render(<Column title="Ready" cards={MOCK_CARDS} onCardClick={vi.fn()} onUpdate={vi.fn()} columnId="ready" />)
    expect(screen.getByRole('region', { name: 'Ready' })).not.toHaveClass('column-drag-over')
  })
})
