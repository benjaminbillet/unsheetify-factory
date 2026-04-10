import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Column from './Column.jsx'

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
    render(<Column title="Ready" cards={MOCK_CARDS} onCardClick={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Ready' })).toBeInTheDocument()
  })

  it('renders card count equal to number of cards', () => {
    render(<Column title="Ready" cards={MOCK_CARDS} onCardClick={vi.fn()} />)
    expect(screen.getByLabelText('3 cards')).toBeInTheDocument()
  })

  it('renders 0 count for empty column', () => {
    render(<Column title="Ready" cards={[]} onCardClick={vi.fn()} />)
    expect(screen.getByLabelText('0 cards')).toBeInTheDocument()
  })

  it('renders a CardTile for each card', () => {
    render(<Column title="Ready" cards={MOCK_CARDS} onCardClick={vi.fn()} />)
    expect(screen.getByText('Card One')).toBeInTheDocument()
    expect(screen.getByText('Card Two')).toBeInTheDocument()
    expect(screen.getByText('Card Three')).toBeInTheDocument()
  })

  it('renders empty state message when no cards', () => {
    render(<Column title="Ready" cards={[]} onCardClick={vi.fn()} />)
    expect(screen.getByText(/no cards/i)).toBeInTheDocument()
  })

  it('calls onCardClick with the correct card when a CardTile is clicked', () => {
    const handler = vi.fn()
    render(<Column title="Ready" cards={MOCK_CARDS} onCardClick={handler} />)
    fireEvent.click(screen.getByRole('button', { name: 'Card One' }))
    expect(handler).toHaveBeenCalledWith(MOCK_CARDS[0])
  })

  it('renders the footer prop below the cards area when provided', () => {
    render(
      <Column title="Ready" cards={[]} onCardClick={vi.fn()}
        footer={<div data-testid="col-footer">Footer content</div>} />
    )
    expect(screen.getByTestId('col-footer')).toBeInTheDocument()
  })

  it('renders nothing extra when footer prop is not provided', () => {
    const { container } = render(<Column title="Ready" cards={[]} onCardClick={vi.fn()} />)
    const section = container.querySelector('.column')
    expect(section.children).toHaveLength(2) // header + column-cards only
  })
})
