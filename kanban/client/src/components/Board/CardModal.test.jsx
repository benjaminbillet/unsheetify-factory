import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CardModal from './CardModal.jsx'

const card = {
  id: '1',
  title: 'Fix bug',
  assignee: 'Alice',
  description: 'Some description',
  column: 'ready',
  position: 1,
  created_at: Date.now(),
  comments: [],
}

describe('CardModal', () => {
  it('has dialog role', () => {
    render(<CardModal card={card} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('renders card title inside dialog', () => {
    render(<CardModal card={card} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Fix bug')
  })

  it('renders assignee name', () => {
    render(<CardModal card={card} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Alice')
  })

  it("renders 'Unassigned' when assignee is null", () => {
    render(<CardModal card={{ ...card, assignee: null }} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Unassigned')
  })

  it('renders description when present', () => {
    render(<CardModal card={card} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Some description')
  })

  it("renders 'No description' when description is null", () => {
    render(<CardModal card={{ ...card, description: null }} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('No description')
  })

  it('calls onClose when close button is clicked', () => {
    const handler = vi.fn()
    render(<CardModal card={card} onClose={handler} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape key is pressed', () => {
    const handler = vi.fn()
    render(<CardModal card={card} onClose={handler} />)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when modal overlay is clicked', () => {
    const handler = vi.fn()
    render(<CardModal card={card} onClose={handler} />)
    fireEvent.click(document.querySelector('.modal-overlay'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when modal content area is clicked', () => {
    const handler = vi.fn()
    render(<CardModal card={card} onClose={handler} />)
    fireEvent.click(screen.getByRole('dialog'))
    expect(handler).not.toHaveBeenCalled()
  })
})
