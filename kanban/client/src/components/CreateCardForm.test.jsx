import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CreateCardForm from './CreateCardForm.jsx'

// ─── Toggle ──────────────────────────────────────────────────────────────────

describe('CreateCardForm — toggle', () => {
  it('renders the add button in collapsed state by default', () => {
    render(<CreateCardForm onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: /\+ add card/i })).toBeInTheDocument()
  })

  it('does not render the title input in collapsed state', () => {
    render(<CreateCardForm onSubmit={vi.fn()} />)
    expect(screen.queryByLabelText(/title/i)).not.toBeInTheDocument()
  })

  it('clicking the add button reveals the title input', () => {
    render(<CreateCardForm onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
  })

  it('clicking the add button hides itself', () => {
    render(<CreateCardForm onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    expect(screen.queryByRole('button', { name: /\+ add card/i })).not.toBeInTheDocument()
  })

  it('focuses the title input when the form is opened', () => {
    render(<CreateCardForm onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    expect(screen.getByLabelText(/title/i)).toHaveFocus()
  })
})

// ─── Form fields ─────────────────────────────────────────────────────────────

describe('CreateCardForm — form fields', () => {
  // Helper: render and open the form
  function renderOpen() {
    render(<CreateCardForm onSubmit={vi.fn().mockResolvedValue(undefined)} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
  }

  it('renders a Title input when expanded', () => {
    renderOpen()
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
  })

  it('renders an Assignee input when expanded', () => {
    renderOpen()
    expect(screen.getByLabelText(/assignee/i)).toBeInTheDocument()
  })

  it('Title input is controlled and updates on change', () => {
    renderOpen()
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Hello' } })
    expect(screen.getByLabelText(/title/i)).toHaveValue('Hello')
  })

  it('Assignee input is controlled and updates on change', () => {
    renderOpen()
    fireEvent.change(screen.getByLabelText(/assignee/i), { target: { value: 'Alice' } })
    expect(screen.getByLabelText(/assignee/i)).toHaveValue('Alice')
  })

  it('renders an "Add card" submit button', () => {
    renderOpen()
    expect(screen.getByRole('button', { name: /^add card$/i })).toBeInTheDocument()
  })

  it('renders a Cancel button', () => {
    renderOpen()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
  })
})

// ─── Validation ──────────────────────────────────────────────────────────────

describe('CreateCardForm — validation', () => {
  function renderOpen(onSubmit = vi.fn()) {
    render(<CreateCardForm onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
  }

  it('shows inline error when submitted with empty title', () => {
    renderOpen()
    fireEvent.click(screen.getByRole('button', { name: /^add card$/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/title is required/i)
  })

  it('shows inline error when submitted with whitespace-only title', () => {
    renderOpen()
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /^add card$/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/title is required/i)
  })

  it('does not call onSubmit when title is empty', () => {
    const onSubmit = vi.fn()
    renderOpen(onSubmit)
    fireEvent.click(screen.getByRole('button', { name: /^add card$/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('clears validation error when user starts typing in title', () => {
    renderOpen()
    // Trigger error
    fireEvent.click(screen.getByRole('button', { name: /^add card$/i }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    // Type to clear error
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'x' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ─── Submission ───────────────────────────────────────────────────────────────

describe('CreateCardForm — submission', () => {
  it('calls onSubmit with trimmed title and null assignee when assignee is empty', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateCardForm onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Bug fix  ' } })
    fireEvent.click(screen.getByRole('button', { name: /^add card$/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ title: 'Bug fix', assignee: null }))
  })

  it('calls onSubmit with trimmed title and trimmed assignee when both filled', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateCardForm onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Bug fix' } })
    fireEvent.change(screen.getByLabelText(/assignee/i), { target: { value: 'Alice' } })
    fireEvent.click(screen.getByRole('button', { name: /^add card$/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ title: 'Bug fix', assignee: 'Alice' }))
  })

  it('calls onSubmit with null assignee when assignee is whitespace-only', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateCardForm onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'My card' } })
    fireEvent.change(screen.getByLabelText(/assignee/i), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /^add card$/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ title: 'My card', assignee: null }))
  })

  it('submit button shows "Adding…" while onSubmit is pending', () => {
    const onSubmit = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<CreateCardForm onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'My card' } })
    fireEvent.click(screen.getByRole('button', { name: /^add card$/i }))
    expect(screen.getByRole('button', { name: /adding/i })).toBeInTheDocument()
  })

  it('submit button is disabled while onSubmit is pending', () => {
    const onSubmit = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<CreateCardForm onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'My card' } })
    fireEvent.click(screen.getByRole('button', { name: /^add card$/i }))
    expect(screen.getByRole('button', { name: /adding/i })).toBeDisabled()
  })

  it('title and assignee inputs are disabled while onSubmit is pending', () => {
    const onSubmit = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<CreateCardForm onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'My card' } })
    fireEvent.click(screen.getByRole('button', { name: /^add card$/i }))
    expect(screen.getByLabelText(/title/i)).toBeDisabled()
    expect(screen.getByLabelText(/assignee/i)).toBeDisabled()
  })

  it('collapses form and shows add button after successful submission', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateCardForm onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'My card' } })
    fireEvent.click(screen.getByRole('button', { name: /^add card$/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /\+ add card/i })).toBeInTheDocument()
    )
    expect(screen.queryByLabelText(/title/i)).not.toBeInTheDocument()
  })

  it('resets title and assignee fields after successful submission (re-open shows empty inputs)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateCardForm onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'My card' } })
    fireEvent.change(screen.getByLabelText(/assignee/i), { target: { value: 'Alice' } })
    fireEvent.click(screen.getByRole('button', { name: /^add card$/i }))
    // Wait for form to collapse
    await waitFor(() => screen.getByRole('button', { name: /\+ add card/i }))
    // Re-open and verify fields are blank
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    expect(screen.getByLabelText(/title/i)).toHaveValue('')
    expect(screen.getByLabelText(/assignee/i)).toHaveValue('')
  })
})

// ─── Error handling ───────────────────────────────────────────────────────────

describe('CreateCardForm — error handling', () => {
  function renderOpenAndSubmit(onSubmit) {
    render(<CreateCardForm onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'My card' } })
    fireEvent.click(screen.getByRole('button', { name: /^add card$/i }))
  }

  it('shows API error message when onSubmit rejects', async () => {
    renderOpenAndSubmit(vi.fn().mockRejectedValue(new Error('Server error')))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Server error')
    )
  })

  it('keeps form open after onSubmit rejects', async () => {
    renderOpenAndSubmit(vi.fn().mockRejectedValue(new Error('fail')))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
  })

  it('re-enables title input after onSubmit rejects', async () => {
    renderOpenAndSubmit(vi.fn().mockRejectedValue(new Error('fail')))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByLabelText(/title/i)).not.toBeDisabled()
  })

  it('re-enables submit button after onSubmit rejects', async () => {
    renderOpenAndSubmit(vi.fn().mockRejectedValue(new Error('fail')))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^add card$/i })).not.toBeDisabled()
  })

  it('clears API error when user starts typing in title after a failed submit', async () => {
    renderOpenAndSubmit(vi.fn().mockRejectedValue(new Error('fail')))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'x' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ─── Cancel and Escape ────────────────────────────────────────────────────────

describe('CreateCardForm — cancel and Escape', () => {
  it('Cancel button collapses form and shows add button', () => {
    render(<CreateCardForm onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.getByRole('button', { name: /\+ add card/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/title/i)).not.toBeInTheDocument()
  })

  it('Cancel button resets title and assignee fields', () => {
    render(<CreateCardForm onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Typed title' } })
    fireEvent.change(screen.getByLabelText(/assignee/i), { target: { value: 'Bob' } })
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    // Re-open and verify fields are reset
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    expect(screen.getByLabelText(/title/i)).toHaveValue('')
    expect(screen.getByLabelText(/assignee/i)).toHaveValue('')
  })

  it('Escape key collapses the form', () => {
    render(<CreateCardForm onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByRole('button', { name: /\+ add card/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/title/i)).not.toBeInTheDocument()
  })

  it('Escape key resets title and assignee fields', () => {
    render(<CreateCardForm onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Draft' } })
    fireEvent.change(screen.getByLabelText(/assignee/i), { target: { value: 'Carol' } })
    fireEvent.keyDown(document.body, { key: 'Escape' })
    // Re-open and verify reset
    fireEvent.click(screen.getByRole('button', { name: /\+ add card/i }))
    expect(screen.getByLabelText(/title/i)).toHaveValue('')
    expect(screen.getByLabelText(/assignee/i)).toHaveValue('')
  })

  it('Escape key does nothing when form is not open', () => {
    render(<CreateCardForm onSubmit={vi.fn()} />)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    // Add button still present, no errors thrown
    expect(screen.getByRole('button', { name: /\+ add card/i })).toBeInTheDocument()
  })
})
