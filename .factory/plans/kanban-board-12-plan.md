# Plan: CreateCardForm Component (Task 12)

## Context

This task adds inline card creation to the Ready column of the Kanban board. Currently, cards can only be created via the API directly — there is no UI for it. We need a togglable form at the bottom of the Ready column that lets users type a title (required) and assignee (optional), then submit to create a card via `useBoard().createCard()`.

The implementation follows the same async-with-loading-state pattern used by `CardModal.jsx` and integrates via a new optional `footer` prop on `Column`.

**Key fact from `useBoard.js` line 132**: `const col = data.column ?? 'ready'` — the hook defaults to `'ready'` when `column` is omitted from the payload. The form does NOT need to pass `column: 'ready'` explicitly.

---

## Architecture

- **New**: `client/src/components/CreateCardForm.jsx` — self-contained (toggle + form + validation + async submission)
- **New**: `client/src/components/CreateCardForm.test.jsx` — full test suite
- **New**: `client/src/components/CreateCardForm.css` — plain CSS matching existing patterns
- **Modify**: `client/src/components/Board/Column.jsx` — add optional `footer` prop rendered below `.column-cards`
- **Modify**: `client/src/components/Board/Column.test.jsx` — add 2 footer tests
- **Modify**: `client/src/components/Board/Board.jsx` — destructure `createCard`, pass `<CreateCardForm onSubmit={createCard} />` as `footer` to Ready column only
- **Modify**: `client/src/components/Board/Board.test.jsx` — add `waitFor` import + 4 integration tests

---

## Subtask 1: CreateCardForm component (TDD)

### Step 1 — Write all tests first (all fail)

Create `client/src/components/CreateCardForm.test.jsx`. **Each test renders the component fresh and creates its own `vi.fn()` mock.** Tests that need the form open must click the toggle button themselves. Tests that need special async behavior (pending, rejecting) create their own mock inline.

```jsx
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
```

### Step 2 — Implement CreateCardForm.jsx

```jsx
import { useState, useEffect, useRef } from 'react'
import './CreateCardForm.css'

export default function CreateCardForm({ onSubmit }) {
  const [isOpen, setIsOpen]                     = useState(false)
  const [title, setTitle]                       = useState('')
  const [assignee, setAssignee]                 = useState('')
  const [isSubmitting, setIsSubmitting]         = useState(false)
  const [validationError, setValidationError]   = useState(null)
  const [apiError, setApiError]                 = useState(null)

  const titleInputRef = useRef(null)

  // Auto-focus title input when form opens (matches CardModal pattern)
  useEffect(() => {
    if (isOpen && titleInputRef.current) titleInputRef.current.focus()
  }, [isOpen])

  // Escape key closes and resets the form (only when open)
  // State setters are stable React guarantees, so [isOpen] is the only dep needed.
  useEffect(() => {
    if (!isOpen) return
    function onKey(e) {
      if (e.key !== 'Escape') return
      setIsOpen(false)
      setTitle('')
      setAssignee('')
      setValidationError(null)
      setApiError(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen])

  function handleOpen() {
    setIsOpen(true)
  }

  // handleClose resets ALL state and collapses the form.
  // Used by: Cancel button, successful submission.
  // The Escape effect duplicates this inline to avoid dep-array issues with a
  // non-memoized function reference.
  function handleClose() {
    setIsOpen(false)
    setTitle('')
    setAssignee('')
    setValidationError(null)
    setApiError(null)
  }

  function handleTitleChange(e) {
    setTitle(e.target.value)
    // Clear both error types so the alert disappears as soon as the user edits
    if (validationError) setValidationError(null)
    if (apiError) setApiError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) {
      setValidationError('Title is required')
      return
    }
    setIsSubmitting(true)
    setApiError(null)
    try {
      await onSubmit({ title: title.trim(), assignee: assignee.trim() || null })
      handleClose()
    } catch (err) {
      setApiError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const displayError = validationError ?? apiError

  if (!isOpen) {
    return (
      <div className="create-card-form">
        <button className="create-card-form-toggle" onClick={handleOpen}>
          + Add card
        </button>
      </div>
    )
  }

  return (
    <div className="create-card-form create-card-form--open">
      <form className="create-card-form-body" onSubmit={handleSubmit}>
        <label htmlFor="ccf-title">Title</label>
        <input
          id="ccf-title"
          ref={titleInputRef}
          aria-label="Title"
          value={title}
          onChange={handleTitleChange}
          disabled={isSubmitting}
        />

        <label htmlFor="ccf-assignee">Assignee</label>
        <input
          id="ccf-assignee"
          aria-label="Assignee"
          value={assignee}
          onChange={e => setAssignee(e.target.value)}
          disabled={isSubmitting}
        />

        {displayError && (
          <p role="alert" className="create-card-form-error">{displayError}</p>
        )}

        <div className="create-card-form-actions">
          <button
            type="submit"
            className="create-card-form-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Adding…' : 'Add card'}
          </button>
          <button
            type="button"
            className="create-card-form-cancel"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
```

**Key notes:**
- `validationError` and `apiError` are mutually exclusive: validation fires before the API call; the API error is cleared at the start of each new submit attempt (`setApiError(null)`)
- `displayError = validationError ?? apiError` — only one is ever set; single `role="alert"` in the DOM
- Escape effect uses inline setters (not `handleClose`) to keep `[isOpen]` as the sole dep, matching the `CardModal.jsx` pattern
- `handleClose` is used by Cancel button and successful submission (same logic, co-located)

### Step 3 — Create CreateCardForm.css

```css
.create-card-form {
  padding-top: 0.5rem;
}

.create-card-form-toggle {
  width: 100%;
  background: none;
  border: 1px dashed #aaa;
  border-radius: 4px;
  padding: 0.4rem 0.75rem;
  color: #555;
  cursor: pointer;
  font-size: 0.875rem;
  text-align: left;
}

.create-card-form-toggle:hover {
  border-color: #1a1a2e;
  color: #1a1a2e;
}

.create-card-form-body {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.create-card-form-body label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #444;
}

.create-card-form-body input {
  width: 100%;
  padding: 0.3rem 0.5rem;
  font-size: 0.875rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
}

.create-card-form-body input:focus {
  border-color: #1a1a2e;
  outline: none;
}

.create-card-form-body input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.create-card-form-error {
  color: #c0392b;
  font-size: 0.8rem;
  margin: 0;
}

.create-card-form-actions {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.25rem;
}

.create-card-form-submit {
  flex: 1;
  background: #1a1a2e;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.35rem 0.75rem;
  font-size: 0.875rem;
  cursor: pointer;
}

.create-card-form-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.create-card-form-cancel {
  background: none;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.35rem 0.75rem;
  font-size: 0.875rem;
  cursor: pointer;
  color: #555;
}

.create-card-form-cancel:hover {
  border-color: #888;
}

.create-card-form-cancel:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

---

## Subtask 2: Column footer prop (TDD)

### Step 1 — Add failing tests to Column.test.jsx

Add at end of the existing `describe('Column', ...)` block:

```js
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
```

### Step 2 — Update Column.jsx

Two changes: destructure `footer`, render `{footer}` after `.column-cards`:

```diff
-export default function Column({ title, cards, onCardClick }) {
+export default function Column({ title, cards, onCardClick, footer }) {
   return (
     <section className="column" aria-label={title}>
       <header className="column-header">
         <h2 className="column-title">{title}</h2>
         <span className="column-count" aria-label={`${cards.length} cards`}>
           {cards.length}
         </span>
       </header>
       <div className="column-cards">
         {cards.length === 0 ? (
           <p className="column-empty">No cards</p>
         ) : (
           cards.map(card => (
             <CardTile key={card.id} card={card} onCardClick={onCardClick} />
           ))
         )}
       </div>
+      {footer}
     </section>
   )
 }
```

When `footer` is `undefined` (not passed), React renders nothing — existing column structure is preserved.

---

## Subtask 3: Board integration (TDD)

### Step 1 — Add failing tests to Board.test.jsx

Add `waitFor` to the existing import line:
```diff
-import { render, screen, fireEvent, within } from '@testing-library/react'
+import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
```

Add a new describe block at the end of the file:

```js
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
```

**Notes:**
- `DEFAULT_STATE` already includes `createCard: vi.fn()` so all existing Board tests continue to pass unchanged.
- The `renders three column regions` test asserts `toHaveLength(3)`. `CreateCardForm` renders `<div>` elements (not `<section>` with aria-label), so the region count stays at 3. ✓
- The `createCard` payload does NOT include `column` — `useBoard.js` line 132 defaults `column` to `'ready'` automatically.

### Step 2 — Update Board.jsx

Four targeted changes:

```diff
 import { useState } from 'react'
 import { useBoard } from '../../hooks/useBoard.js'
 import Column from './Column.jsx'
 import CardModal from './CardModal.jsx'
+import CreateCardForm from '../CreateCardForm.jsx'
 import './Board.css'

 export default function Board() {
-  const { cards, loading, error, updateCard, deleteCard } = useBoard()
+  const { cards, loading, error, createCard, updateCard, deleteCard } = useBoard()
   const [selectedCardId, setSelectedCardId] = useState(null)
   const allCards = [...cards.ready, ...cards.in_progress, ...cards.done]
   const selectedCard = selectedCardId ? (allCards.find(c => c.id === selectedCardId) ?? null) : null

   if (loading) return <div className="board-loading" aria-label="Loading">Loading…</div>
   if (error) return <div className="board-error" role="alert">{error}</div>

   return (
     <div className="board">
-      <Column title="Ready" cards={cards.ready} onCardClick={(card) => setSelectedCardId(card.id)} />
+      <Column
+        title="Ready"
+        cards={cards.ready}
+        onCardClick={(card) => setSelectedCardId(card.id)}
+        footer={<CreateCardForm onSubmit={createCard} />}
+      />
       <Column title="In Progress" cards={cards.in_progress} onCardClick={(card) => setSelectedCardId(card.id)} />
       <Column title="Done" cards={cards.done} onCardClick={(card) => setSelectedCardId(card.id)} />
       {selectedCard && (
         <CardModal
           card={selectedCard}
           onClose={() => setSelectedCardId(null)}
           onUpdate={updateCard}
           onDelete={deleteCard}
         />
       )}
     </div>
   )
 }
```

---

## Execution Order

1. Write `CreateCardForm.test.jsx` (all tests — all fail with module not found)
2. Implement `CreateCardForm.jsx` (makes all CreateCardForm tests pass)
3. Create `CreateCardForm.css` (styles only, no test impact)
4. Add Column footer tests to `Column.test.jsx` (2 new tests fail)
5. Update `Column.jsx` (pass column footer tests)
6. Add Board integration tests to `Board.test.jsx` (4 new tests fail)
7. Update `Board.jsx` (pass board integration tests)
8. Run full test suite — all green

---

## Verification

Run the test suite from the client directory:

```bash
cd kanban/client && npm test
```

Key checks:
- All `CreateCardForm` describe blocks pass (toggle, fields, validation, submission, errors, cancel/Escape)
- Existing Column tests still pass + 2 new footer tests pass
- Existing Board tests still pass (especially `renders three column regions` asserting length 3) + 4 new integration tests pass
- Manual smoke test: `npm run dev` → board loads → Ready column shows "+ Add card" → click → title input auto-focuses → fill title → submit → card appears optimistically in Ready column → form collapses → "+ Add card" button returns
