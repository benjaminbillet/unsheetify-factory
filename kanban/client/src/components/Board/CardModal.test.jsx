import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CardModal from './CardModal.jsx'

// vi.mock is hoisted by Vitest before any imports — factory runs before module code
vi.mock('../CardModal/BlockEditor.jsx', () => ({
  default: vi.fn(({ content, onSave, onEditingChange }) => (
    <div data-testid="block-editor">
      <span>{content ?? 'No description'}</span>
      <button aria-label="Edit description" onClick={() => onEditingChange?.(true)}>Edit</button>
      <button aria-label="Cancel description edit" onClick={() => onEditingChange?.(false)}>Cancel</button>
      <button aria-label="Save description" onClick={() => onSave?.('{"blocks":"test"}')}>Save</button>
    </div>
  )),
}))

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
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('renders card title inside dialog', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Fix bug')
  })

  it('renders assignee name', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Alice')
  })

  it("renders 'Unassigned' when assignee is null", () => {
    render(<CardModal card={{ ...card, assignee: null }} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Unassigned')
  })

  it('renders description when present', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Some description')
  })

  it("renders 'No description' when description is null", () => {
    render(<CardModal card={{ ...card, description: null }} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('No description')
  })

  it('calls onClose when close button is clicked', () => {
    const handler = vi.fn()
    render(<CardModal card={card} onClose={handler} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape key is pressed', () => {
    const handler = vi.fn()
    render(<CardModal card={card} onClose={handler} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when modal overlay is clicked', () => {
    const handler = vi.fn()
    render(<CardModal card={card} onClose={handler} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(document.querySelector('.modal-overlay'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when modal content area is clicked', () => {
    const handler = vi.fn()
    render(<CardModal card={card} onClose={handler} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('dialog'))
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('CardModal — portal', () => {
  it('renders modal outside the React root container (via portal)', () => {
    const { container } = render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    // Portal renders into document.body, NOT inside the React render container
    expect(container.contains(document.querySelector('.modal-overlay'))).toBe(false)
    expect(document.body.contains(document.querySelector('.modal-overlay'))).toBe(true)
  })

  it('cleans up portal content from document.body on unmount', () => {
    const { unmount } = render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    expect(document.querySelector('.modal-overlay')).not.toBeNull()
    unmount()
    expect(document.querySelector('.modal-overlay')).toBeNull()
  })
})

describe('CardModal — edit title', () => {
  it('shows Edit title button in view mode', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    expect(screen.getByRole('button', { name: /edit title/i })).toBeInTheDocument()
  })

  it('clicking Edit title shows an input with current title value', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    expect(screen.getByRole('textbox', { name: /title/i })).toHaveValue('Fix bug')
  })

  it('clicking Edit title hides the static heading', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })

  it('clicking Edit title focuses the title input', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    expect(screen.getByRole('textbox', { name: /title/i })).toHaveFocus()
  })

  it('shows Save and Cancel buttons when editing title', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
  })

  it('Cancel restores original title and exits edit mode', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /title/i }), { target: { value: 'Changed' } })
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.getByRole('heading', { name: 'Fix bug' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /title/i })).not.toBeInTheDocument()
  })

  it('Escape key cancels title edit without closing modal', () => {
    const onClose = vi.fn()
    render(<CardModal card={card} onClose={onClose} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /title/i })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Save calls onUpdate(id, { title: newTitle })', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ...card, title: 'New title' })
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /title/i }), { target: { value: 'New title' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('1', { title: 'New title' }))
  })

  it('Save disables button and shows Saving… while pending', () => {
    const onUpdate = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^save$/i })).toHaveTextContent('Saving…')
  })

  it('Save exits edit mode on success', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ...card, title: 'New title' })
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: /title/i })).not.toBeInTheDocument())
  })

  it('Save shows alert with error message on rejection', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('Server error'))
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Server error'))
  })

  it('Save stays in edit mode on rejection', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('fail'))
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalled())
    expect(screen.getByRole('textbox', { name: /title/i })).toBeInTheDocument()
  })

  it('Save shows validation error and does not call onUpdate when title is empty', async () => {
    const onUpdate = vi.fn()
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /title/i }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required')
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('Enter key in title input triggers save', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ...card, title: 'New title' })
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /title/i }), { target: { value: 'New title' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: /title/i }), { key: 'Enter' })
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('1', { title: 'New title' }))
  })

  it('opening title edit cancels any open assignee edit', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    // Open assignee edit first
    fireEvent.click(screen.getByRole('button', { name: /edit assignee/i }))
    expect(screen.getByRole('textbox', { name: /assignee/i })).toBeInTheDocument()
    // Now open title edit
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    expect(screen.queryByRole('textbox', { name: /assignee/i })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /title/i })).toBeInTheDocument()
  })

  it('blurring the title input calls onUpdate(id, { title })', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ...card })
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    fireEvent.blur(screen.getByRole('textbox', { name: /title/i }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('1', { title: 'Fix bug' }))
  })

  it('blurring the title input does not call onUpdate when blur is caused by clicking Cancel', async () => {
    const onUpdate = vi.fn()
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    const cancelButton = screen.getByRole('button', { name: /^cancel$/i })
    fireEvent.mouseDown(cancelButton)
    fireEvent.blur(screen.getByRole('textbox', { name: /title/i }))
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('clicking the Save button does not trigger a double-save via blur', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ...card, title: 'New title' })
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /title/i }), { target: { value: 'New title' } })
    const saveButton = screen.getByRole('button', { name: /^save$/i })
    fireEvent.mouseDown(saveButton)
    fireEvent.blur(screen.getByRole('textbox', { name: /title/i }))
    fireEvent.click(saveButton)
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
  })

  it('Escape key cancels title edit without calling onUpdate', () => {
    const onUpdate = vi.fn()
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onUpdate).not.toHaveBeenCalled()
  })
})

describe('CardModal — edit assignee', () => {
  it('shows Edit assignee button in view mode', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    expect(screen.getByRole('button', { name: /edit assignee/i })).toBeInTheDocument()
  })

  it('clicking Edit assignee shows an input with current assignee value', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit assignee/i }))
    expect(screen.getByRole('textbox', { name: /assignee/i })).toHaveValue('Alice')
  })

  it('clicking Edit assignee shows empty input when assignee is null', () => {
    render(<CardModal card={{ ...card, assignee: null }} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit assignee/i }))
    expect(screen.getByRole('textbox', { name: /assignee/i })).toHaveValue('')
  })

  it('clicking Edit assignee focuses the assignee input', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit assignee/i }))
    expect(screen.getByRole('textbox', { name: /assignee/i })).toHaveFocus()
  })

  it('shows Save and Cancel buttons when editing assignee', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit assignee/i }))
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
  })

  it('Cancel restores original assignee and exits edit mode', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit assignee/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /assignee/i }), { target: { value: 'Bob' } })
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Alice')
    expect(screen.queryByRole('textbox', { name: /assignee/i })).not.toBeInTheDocument()
  })

  it('Escape key cancels assignee edit without closing modal', () => {
    const onClose = vi.fn()
    render(<CardModal card={card} onClose={onClose} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit assignee/i }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /assignee/i })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Save calls onUpdate(id, { assignee: newValue })', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ...card, assignee: 'Bob' })
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit assignee/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /assignee/i }), { target: { value: 'Bob' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('1', { assignee: 'Bob' }))
  })

  it('Save with empty input calls onUpdate(id, { assignee: null })', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ...card, assignee: null })
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit assignee/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /assignee/i }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('1', { assignee: null }))
  })

  it('Save shows alert with error message on rejection', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('Save failed'))
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit assignee/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Save failed'))
  })

  it('Save stays in edit mode on rejection', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('fail'))
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit assignee/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalled())
    expect(screen.getByRole('textbox', { name: /assignee/i })).toBeInTheDocument()
  })

  it('Enter key in assignee input triggers save', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ...card, assignee: 'Bob' })
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit assignee/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /assignee/i }), { target: { value: 'Bob' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: /assignee/i }), { key: 'Enter' })
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('1', { assignee: 'Bob' }))
  })

  it('opening assignee edit cancels any open title edit', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    // Open title edit first
    fireEvent.click(screen.getByRole('button', { name: /edit title/i }))
    expect(screen.getByRole('textbox', { name: /title/i })).toBeInTheDocument()
    // Now open assignee edit
    fireEvent.click(screen.getByRole('button', { name: /edit assignee/i }))
    expect(screen.queryByRole('textbox', { name: /title/i })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /assignee/i })).toBeInTheDocument()
  })

  it('blurring the assignee input calls onUpdate(id, { assignee })', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ...card })
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit assignee/i }))
    fireEvent.blur(screen.getByRole('textbox', { name: /assignee/i }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('1', { assignee: 'Alice' }))
  })

  it('blurring the assignee input does not call onUpdate when blur is caused by clicking Cancel', async () => {
    const onUpdate = vi.fn()
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit assignee/i }))
    const cancelButton = screen.getByRole('button', { name: /^cancel$/i })
    fireEvent.mouseDown(cancelButton)
    fireEvent.blur(screen.getByRole('textbox', { name: /assignee/i }))
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('clicking the assignee Save button does not trigger a double-save via blur', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ...card, assignee: 'Bob' })
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit assignee/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /assignee/i }), { target: { value: 'Bob' } })
    const saveButton = screen.getByRole('button', { name: /^save$/i })
    fireEvent.mouseDown(saveButton)
    fireEvent.blur(screen.getByRole('textbox', { name: /assignee/i }))
    fireEvent.click(saveButton)
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
  })

  it('Escape key cancels assignee edit without calling onUpdate', () => {
    const onUpdate = vi.fn()
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit assignee/i }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onUpdate).not.toHaveBeenCalled()
  })
})

describe('CardModal — delete', () => {
  it('shows Delete button in view mode', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('clicking Delete shows confirmation prompt with Are you sure', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /keep card/i })).toBeInTheDocument()
  })

  it('clicking Keep card dismisses confirmation', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /keep card/i }))
    expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('clicking Confirm delete calls onDelete with card id', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={onDelete} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('1'))
  })

  it('Confirm delete button is disabled while onDelete is pending', () => {
    const onDelete = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={onDelete} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeDisabled()
  })

  it('modal calls onClose after successful delete', async () => {
    const onClose = vi.fn()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(<CardModal card={card} onClose={onClose} onUpdate={vi.fn()} onDelete={onDelete} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows error alert when onDelete rejects', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('Delete failed'))
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={onDelete} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Delete failed'))
  })

  it('delete error dismisses confirmation and returns to view mode', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('fail'))
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={onDelete} onAddComment={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    await waitFor(() => expect(onDelete).toHaveBeenCalled())
    expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument()
  })
})

describe('CardModal — comments', () => {
  // `card` is the file-level fixture already defined at the top of CardModal.test.jsx
  const cardWithComments = {
    ...card,
    comments: [
      { id: 'cm1', card_id: '1', author: 'Bob', content: 'Looks good!', created_at: 1700000000000 },
      { id: 'cm2', card_id: '1', author: 'Alice', content: 'Needs work', created_at: 1700000001000 },
    ],
  }

  it('renders a Comments heading', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /comments/i })).toBeInTheDocument()
  })

  it('renders each comment author', () => {
    render(<CardModal card={cardWithComments} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    const list = screen.getByRole('list')
    expect(within(list).getByText('Bob')).toBeInTheDocument()
    expect(within(list).getByText('Alice')).toBeInTheDocument()
  })

  it('renders each comment content', () => {
    render(<CardModal card={cardWithComments} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    expect(screen.getByText('Looks good!')).toBeInTheDocument()
    expect(screen.getByText('Needs work')).toBeInTheDocument()
  })

  it('renders <time> elements with ISO dateTime attributes for each comment', () => {
    render(<CardModal card={cardWithComments} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    const times = document.querySelectorAll('time')
    expect(times[0]).toHaveAttribute('dateTime', new Date(1700000000000).toISOString())
    expect(times[1]).toHaveAttribute('dateTime', new Date(1700000001000).toISOString())
  })

  it('renders comments in order (first appears before second in DOM)', () => {
    render(<CardModal card={cardWithComments} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    const comments = screen.getAllByTestId('comment')
    expect(comments[0]).toHaveTextContent('Looks good!')
    expect(comments[1]).toHaveTextContent('Needs work')
  })

  it('renders "No comments yet" when comments array is empty', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    expect(screen.getByText(/no comments yet/i)).toBeInTheDocument()
  })

  it('does not render "No comments yet" when comments exist', () => {
    render(<CardModal card={cardWithComments} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
    expect(screen.queryByText(/no comments yet/i)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// CardModal — description (BlockEditor integration)
// ---------------------------------------------------------------------------
describe('CardModal — description', () => {
  it('renders BlockEditor in place of the static description paragraph', () => {
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByTestId('block-editor')).toBeInTheDocument()
  })

  it('BlockEditor receives card.description as its content prop', () => {
    render(<CardModal card={{ ...card, description: 'Some description' }} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByTestId('block-editor')).toHaveTextContent('Some description')
  })

  it('BlockEditor onSave prop calls onUpdate(card.id, { description: json })', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ...card, description: '{"blocks":"test"}' })
    render(<CardModal card={card} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /save description/i }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('1', { description: '{"blocks":"test"}' }))
  })

  it('Escape does not close modal when BlockEditor reports isEditing=true', () => {
    const onClose = vi.fn()
    render(<CardModal card={card} onClose={onClose} onUpdate={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape closes modal after description editing ends', () => {
    const onClose = vi.fn()
    render(<CardModal card={card} onClose={onClose} onUpdate={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel description edit/i }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
