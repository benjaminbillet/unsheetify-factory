import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CardTile from './CardTile.jsx'

const card = {
  id: '1',
  title: 'Fix bug',
  assignee: 'Alice',
  description: 'Short desc',
  column: 'ready',
  position: 1,
  created_at: Date.now(),
  comments: [],
}

describe('CardTile', () => {
  it('renders card title', () => {
    render(<CardTile card={card} onCardClick={vi.fn()} />)
    expect(screen.getByText('Fix bug')).toBeInTheDocument()
  })

  it('renders assignee name when provided', () => {
    render(<CardTile card={card} onCardClick={vi.fn()} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it("renders 'Unassigned' when assignee is null", () => {
    render(<CardTile card={{ ...card, assignee: null }} onCardClick={vi.fn()} />)
    expect(screen.getByText('Unassigned')).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(<CardTile card={card} onCardClick={vi.fn()} />)
    expect(screen.getByText('Short desc')).toBeInTheDocument()
  })

  it('does not render description element when description is null', () => {
    render(<CardTile card={{ ...card, description: null }} onCardClick={vi.fn()} />)
    expect(screen.queryByText('Short desc')).toBeNull()
  })

  it('calls onCardClick with the card object when clicked', () => {
    const handler = vi.fn()
    render(<CardTile card={card} onCardClick={handler} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fix bug' }))
    expect(handler).toHaveBeenCalledWith(card)
  })

  it('calls onCardClick when Enter key is pressed', () => {
    const handler = vi.fn()
    render(<CardTile card={card} onCardClick={handler} />)
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' })
    expect(handler).toHaveBeenCalledWith(card)
  })

  it('calls onCardClick when Space key is pressed', () => {
    const handler = vi.fn()
    render(<CardTile card={card} onCardClick={handler} />)
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' })
    expect(handler).toHaveBeenCalledWith(card)
  })

  it('is keyboard-focusable', () => {
    render(<CardTile card={card} onCardClick={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveAttribute('tabindex', '0')
  })
})
