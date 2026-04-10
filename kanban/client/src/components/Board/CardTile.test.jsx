import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import CardTile from './CardTile.jsx'

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: vi.fn(() => ({
    attributes: { 'aria-roledescription': 'sortable' },
    listeners: { onPointerDown: vi.fn() },
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
}))
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: vi.fn(() => '') } },
}))

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

  it('useSortable is called with the card id', () => {
    render(<CardTile card={card} onCardClick={vi.fn()} />)
    expect(useSortable).toHaveBeenCalledWith({ id: card.id })
  })

  it('CardTile spreads aria attributes from useSortable', () => {
    render(<CardTile card={card} onCardClick={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-roledescription', 'sortable')
  })

  it('CardTile does not have dragging class when isDragging is false', () => {
    render(<CardTile card={card} onCardClick={vi.fn()} />)
    expect(screen.getByRole('button')).not.toHaveClass('card-tile-dragging')
  })

  it('CardTile has dragging class when isDragging is true', () => {
    useSortable.mockReturnValueOnce({
      attributes: { 'aria-roledescription': 'sortable' },
      listeners: { onPointerDown: vi.fn() },
      setNodeRef: vi.fn(),
      transform: null,
      transition: null,
      isDragging: true,
    })
    render(<CardTile card={card} onCardClick={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveClass('card-tile-dragging')
  })

  it('CardTile applies inline transform style from useSortable', () => {
    CSS.Transform.toString.mockReturnValueOnce('translate3d(0px,10px,0)')
    useSortable.mockReturnValueOnce({
      attributes: { 'aria-roledescription': 'sortable' },
      listeners: { onPointerDown: vi.fn() },
      setNodeRef: vi.fn(),
      transform: { x: 0, y: 10, scaleX: 1, scaleY: 1 },
      transition: 'transform 200ms ease',
      isDragging: false,
    })
    render(<CardTile card={card} onCardClick={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveStyle({
      transform: 'translate3d(0px,10px,0)',
      transition: 'transform 200ms ease',
    })
  })
})

describe('CardTile — inline editing', () => {
  // Edit mode entry
  it('clicking title text renders a title input initialized to the card title', () => {
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Fix bug' }))
    expect(screen.getByRole('textbox', { name: 'Edit title' })).toHaveValue('Fix bug')
  })

  it('clicking title text does not call onCardClick', () => {
    const onCardClick = vi.fn()
    render(<CardTile card={card} onCardClick={onCardClick} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Fix bug' }))
    expect(onCardClick).not.toHaveBeenCalled()
  })

  it('clicking title text focuses the title input automatically', async () => {
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Fix bug' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Edit title' })).toHaveFocus())
  })

  it('clicking assignee text renders an assignee input initialized to the card assignee', () => {
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByText('Alice'))
    expect(screen.getByRole('textbox', { name: 'Edit assignee' })).toHaveValue('Alice')
  })

  it('clicking assignee text does not call onCardClick', () => {
    const onCardClick = vi.fn()
    render(<CardTile card={card} onCardClick={onCardClick} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByText('Alice'))
    expect(onCardClick).not.toHaveBeenCalled()
  })

  it('clicking assignee text focuses the assignee input automatically', async () => {
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByText('Alice'))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Edit assignee' })).toHaveFocus())
  })

  it('clicking assignee text renders an empty input when assignee is null', () => {
    render(<CardTile card={{ ...card, assignee: null }} onCardClick={vi.fn()} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByText('Unassigned'))
    expect(screen.getByRole('textbox', { name: 'Edit assignee' })).toHaveValue('')
  })

  it('clicking the card body (not title/assignee) still calls onCardClick when not editing', () => {
    const onCardClick = vi.fn()
    render(<CardTile card={card} onCardClick={onCardClick} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fix bug' }))
    expect(onCardClick).toHaveBeenCalledWith(card)
  })

  // Edit mode guard
  it('clicking the card body while in title edit mode does not call onCardClick', () => {
    const onCardClick = vi.fn()
    render(<CardTile card={card} onCardClick={onCardClick} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Fix bug' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fix bug' }))
    expect(onCardClick).not.toHaveBeenCalled()
  })

  // Mutual exclusivity
  it('clicking title while editing assignee closes assignee edit and opens title edit', () => {
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByText('Alice'))
    expect(screen.getByRole('textbox', { name: 'Edit assignee' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('heading', { name: 'Fix bug' }))
    expect(screen.queryByRole('textbox', { name: 'Edit assignee' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Edit title' })).toBeInTheDocument()
  })

  it('clicking assignee while editing title closes title edit and opens assignee edit', () => {
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Fix bug' }))
    expect(screen.getByRole('textbox', { name: 'Edit title' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Alice'))
    expect(screen.queryByRole('textbox', { name: 'Edit title' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Edit assignee' })).toBeInTheDocument()
  })

  // Enter key saves
  it('pressing Enter on title input calls onUpdate(id, { title }) and exits edit mode', async () => {
    const onUpdate = vi.fn().mockResolvedValue({})
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Fix bug' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit title' }), { target: { value: 'New title' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit title' }), { key: 'Enter' })
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('1', { title: 'New title' }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Edit title' })).not.toBeInTheDocument())
  })

  it('pressing Enter on assignee input calls onUpdate(id, { assignee }) and exits edit mode', async () => {
    const onUpdate = vi.fn().mockResolvedValue({})
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByText('Alice'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit assignee' }), { target: { value: 'Bob' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit assignee' }), { key: 'Enter' })
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('1', { assignee: 'Bob' }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Edit assignee' })).not.toBeInTheDocument())
  })

  it('pressing Enter with empty assignee calls onUpdate(id, { assignee: null })', async () => {
    const onUpdate = vi.fn().mockResolvedValue({})
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByText('Alice'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit assignee' }), { target: { value: '' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit assignee' }), { key: 'Enter' })
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('1', { assignee: null }))
  })

  // Escape key cancels
  it('pressing Escape on title input cancels edit without calling onUpdate', () => {
    const onUpdate = vi.fn()
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Fix bug' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit title' }), { key: 'Escape' })
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('pressing Escape on title input restores original title text', () => {
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Fix bug' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit title' }), { target: { value: 'Changed title' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit title' }), { key: 'Escape' })
    expect(screen.getByRole('heading', { name: 'Fix bug' })).toBeInTheDocument()
  })

  it('pressing Escape on assignee input cancels edit without calling onUpdate', () => {
    const onUpdate = vi.fn()
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByText('Alice'))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit assignee' }), { key: 'Escape' })
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('pressing Escape on assignee input restores original assignee text', () => {
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByText('Alice'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit assignee' }), { target: { value: 'Changed' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit assignee' }), { key: 'Escape' })
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  // Blur saves
  it('blurring title input calls onUpdate(id, { title })', async () => {
    const onUpdate = vi.fn().mockResolvedValue({})
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Fix bug' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit title' }), { target: { value: 'Blurred title' } })
    fireEvent.blur(screen.getByRole('textbox', { name: 'Edit title' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('1', { title: 'Blurred title' }))
  })

  it('blurring assignee input calls onUpdate(id, { assignee })', async () => {
    const onUpdate = vi.fn().mockResolvedValue({})
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByText('Alice'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit assignee' }), { target: { value: 'Bob' } })
    fireEvent.blur(screen.getByRole('textbox', { name: 'Edit assignee' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('1', { assignee: 'Bob' }))
  })

  it('blurring assignee input with empty value calls onUpdate(id, { assignee: null })', async () => {
    const onUpdate = vi.fn().mockResolvedValue({})
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByText('Alice'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit assignee' }), { target: { value: '' } })
    fireEvent.blur(screen.getByRole('textbox', { name: 'Edit assignee' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('1', { assignee: null }))
  })

  // Validation
  it('empty title shows validation error and does not call onUpdate', () => {
    const onUpdate = vi.fn()
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Fix bug' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit title' }), { target: { value: '' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit title' }), { key: 'Enter' })
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required')
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('whitespace-only title shows validation error and does not call onUpdate', () => {
    const onUpdate = vi.fn()
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Fix bug' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit title' }), { target: { value: '   ' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit title' }), { key: 'Enter' })
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required')
    expect(onUpdate).not.toHaveBeenCalled()
  })

  // Error handling and rollback
  it('onUpdate failure on title save stays in edit mode with typed value preserved', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('Server error'))
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Fix bug' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit title' }), { target: { value: 'New title' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit title' }), { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Server error'))
    expect(screen.getByRole('textbox', { name: 'Edit title' })).toHaveValue('New title')
  })

  it('onUpdate failure on title save shows an error alert', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('Server error'))
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Fix bug' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit title' }), { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Server error'))
  })

  it('onUpdate failure on assignee save stays in edit mode and shows an error alert', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('Assignee error'))
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByText('Alice'))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit assignee' }), { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Assignee error'))
    expect(screen.getByRole('textbox', { name: 'Edit assignee' })).toBeInTheDocument()
  })

  // Visual feedback
  it('title edit mode applies card-tile-editing class to the tile', () => {
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Fix bug' }))
    expect(screen.getByRole('button', { name: 'Fix bug' })).toHaveClass('card-tile-editing')
  })

  it('assignee edit mode applies card-tile-editing class to the tile', () => {
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByText('Alice'))
    expect(screen.getByRole('button', { name: 'Fix bug' })).toHaveClass('card-tile-editing')
  })

  it('shows saving indicator while save is in-flight', async () => {
    const onUpdate = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<CardTile card={card} onCardClick={vi.fn()} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Fix bug' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit title' }), { key: 'Enter' })
    await waitFor(() => expect(screen.getByLabelText('Saving')).toBeInTheDocument())
  })
})
