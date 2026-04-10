# Task 15: Create CommentList Component

## Context

The Kanban board application (`client/src/components/Board/CardModal.jsx`) already has a basic read-only comment display section (lines 185–208) using `toLocaleString()` for timestamps, but it has **no comment creation form** and timestamps are not in relative format. The `useBoard` hook already exposes `addComment(cardId, data)` (optimistic update + API call), but `Board.jsx` does not pass it to `CardModal`, and `CardModal` has no `onAddComment` prop.

This task extracts the comment functionality into a new `CommentList` component in its own subdirectory, adds a comment creation form, and upgrades timestamps to relative format ("2 hours ago").

**Note:** `Board.test.jsx` already has `addComment: vi.fn()` in `DEFAULT_STATE` — it does **not** need to be modified.

---

## Files to Create

| File | Purpose |
|------|---------|
| `client/src/components/CardModal/CommentList.test.jsx` | All CommentList unit tests (written first, TDD) |
| `client/src/components/CardModal/CommentList.jsx` | Component implementation |
| `client/src/components/CardModal/CommentList.css` | Component styles |

## Files to Modify

| File | Change |
|------|--------|
| `client/src/components/Board/CardModal.jsx` | Add `onAddComment` prop; replace inline comment section with `<CommentList>`; remove old `import`s not needed |
| `client/src/components/Board/CardModal.css` | Remove orphaned `.modal-comments*` selectors (10 rules, lines 128–178) |
| `client/src/components/Board/CardModal.test.jsx` | Fix the one timestamp test that will break (line 415–419); add `onAddComment={vi.fn()}` to all `render(<CardModal …/>)` calls |
| `client/src/components/Board/Board.jsx` | Destructure `addComment` from `useBoard()`; pass as `onAddComment` to `<CardModal>` |

---

## Subtask 1 — Comment Display (Red → Green → Refactor)

### 1a. Write tests first (`CommentList.test.jsx`)

```js
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import CommentList, { formatRelativeTime } from './CommentList.jsx'

const comments = [
  { id: 'cm1', card_id: '1', author: 'Bob',   content: 'Looks good!', created_at: 1700000000000 },
  { id: 'cm2', card_id: '1', author: 'Alice', content: 'Needs work',  created_at: 1700000001000 },
]
const noop = () => Promise.resolve()
```

**Test cases for comment display — write as concrete test bodies:**

```js
describe('CommentList — display', () => {
  it('renders a "Comments" heading', () => {
    render(<CommentList comments={[]} onAddComment={noop} />)
    expect(screen.getByRole('heading', { name: /comments/i })).toBeInTheDocument()
  })

  it('renders "No comments yet" when comments array is empty', () => {
    render(<CommentList comments={[]} onAddComment={noop} />)
    expect(screen.getByText(/no comments yet/i)).toBeInTheDocument()
  })

  it('does not render "No comments yet" when comments exist', () => {
    render(<CommentList comments={comments} onAddComment={noop} />)
    expect(screen.queryByText(/no comments yet/i)).not.toBeInTheDocument()
  })

  it('renders each comment author name', () => {
    render(<CommentList comments={comments} onAddComment={noop} />)
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('renders each comment content text', () => {
    render(<CommentList comments={comments} onAddComment={noop} />)
    expect(screen.getByText('Looks good!')).toBeInTheDocument()
    expect(screen.getByText('Needs work')).toBeInTheDocument()
  })

  it('renders comments in chronological order even when input is out of order', () => {
    // Provide fixture with newer comment (cm2) first in the array
    const outOfOrder = [comments[1], comments[0]]
    render(<CommentList comments={outOfOrder} onAddComment={noop} />)
    const items = screen.getAllByTestId('comment')
    expect(items[0]).toHaveTextContent('Looks good!')  // cm1, older, should appear first
    expect(items[1]).toHaveTextContent('Needs work')   // cm2, newer
  })

  it('renders a <time> element with ISO dateTime attribute for each comment', () => {
    render(<CommentList comments={comments} onAddComment={noop} />)
    const items = screen.getAllByTestId('comment')
    expect(within(items[0]).getByRole('time')).toHaveAttribute('dateTime', new Date(1700000000000).toISOString())
    expect(within(items[1]).getByRole('time')).toHaveAttribute('dateTime', new Date(1700000001000).toISOString())
  })
})
```

### 1b. Implement `CommentList.jsx` (minimum to pass display tests)

```jsx
import { useState } from 'react'
import './CommentList.css'

export function formatRelativeTime(timestamp) { return '' }  // stub — replaced in subtask 3

export default function CommentList({ comments, onAddComment }) {
  // Sort chronologically (oldest first) regardless of input order
  const sorted = [...comments].sort((a, b) => a.created_at - b.created_at)

  return (
    <section className="comment-list">
      <h3 className="comment-list-heading">Comments</h3>
      {sorted.length === 0 ? (
        <p className="comment-list-empty">No comments yet</p>
      ) : (
        <ul className="comment-list-items">
          {sorted.map(cm => (
            <li key={cm.id} data-testid="comment" className="comment-item">
              <div className="comment-meta">
                <span className="comment-author">{cm.author}</span>
                <time className="comment-time" dateTime={new Date(cm.created_at).toISOString()}>
                  {formatRelativeTime(cm.created_at)}
                </time>
              </div>
              <p className="comment-content">{cm.content}</p>
            </li>
          ))}
        </ul>
      )}
      {/* form added in subtask 2 */}
    </section>
  )
}
```

---

## Subtask 2 — Comment Creation Form (Red → Green → Refactor)

### 2a. Add form tests to `CommentList.test.jsx`

```js
describe('CommentList — form', () => {
  it('renders an author name input', () => {
    render(<CommentList comments={[]} onAddComment={noop} />)
    expect(screen.getByRole('textbox', { name: /author name/i })).toBeInTheDocument()
  })

  it('renders a comment textarea', () => {
    render(<CommentList comments={[]} onAddComment={noop} />)
    expect(screen.getByRole('textbox', { name: /comment/i })).toBeInTheDocument()
  })

  it('renders an "Add Comment" submit button', () => {
    render(<CommentList comments={[]} onAddComment={noop} />)
    expect(screen.getByRole('button', { name: /add comment/i })).toBeInTheDocument()
  })

  it('shows validation error "Author name is required" when submitting with empty author', async () => {
    render(<CommentList comments={[]} onAddComment={noop} />)
    fireEvent.change(screen.getByRole('textbox', { name: /comment/i }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Author name is required')
  })

  it('shows validation error "Comment text is required" when author filled but content empty', async () => {
    render(<CommentList comments={[]} onAddComment={noop} />)
    fireEvent.change(screen.getByRole('textbox', { name: /author name/i }), { target: { value: 'Bob' } })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Comment text is required')
  })

  it('calls onAddComment with { author, content } on valid submission', async () => {
    const onAddComment = vi.fn().mockResolvedValue({})
    render(<CommentList comments={[]} onAddComment={onAddComment} />)
    fireEvent.change(screen.getByRole('textbox', { name: /author name/i }), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByRole('textbox', { name: /comment/i }), { target: { value: 'Looks good!' } })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))
    await waitFor(() => expect(onAddComment).toHaveBeenCalledWith({ author: 'Bob', content: 'Looks good!' }))
  })

  it('clears form fields after successful submission', async () => {
    const onAddComment = vi.fn().mockResolvedValue({})
    render(<CommentList comments={[]} onAddComment={onAddComment} />)
    fireEvent.change(screen.getByRole('textbox', { name: /author name/i }), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByRole('textbox', { name: /comment/i }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: /author name/i })).toHaveValue(''))
    expect(screen.getByRole('textbox', { name: /comment/i })).toHaveValue('')
  })

  it('disables submit button while onAddComment is pending', () => {
    const onAddComment = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<CommentList comments={[]} onAddComment={onAddComment} />)
    fireEvent.change(screen.getByRole('textbox', { name: /author name/i }), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByRole('textbox', { name: /comment/i }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))
    expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled()
  })

  it('shows "Submitting…" text while pending', () => {
    const onAddComment = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<CommentList comments={[]} onAddComment={onAddComment} />)
    fireEvent.change(screen.getByRole('textbox', { name: /author name/i }), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByRole('textbox', { name: /comment/i }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))
    expect(screen.getByRole('button')).toHaveTextContent('Submitting…')
  })

  it('shows error message (role="alert") when onAddComment rejects', async () => {
    const onAddComment = vi.fn().mockRejectedValue(new Error('Network error'))
    render(<CommentList comments={[]} onAddComment={onAddComment} />)
    fireEvent.change(screen.getByRole('textbox', { name: /author name/i }), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByRole('textbox', { name: /comment/i }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network error'))
  })

  it('keeps form values when onAddComment rejects', async () => {
    const onAddComment = vi.fn().mockRejectedValue(new Error('fail'))
    render(<CommentList comments={[]} onAddComment={onAddComment} />)
    fireEvent.change(screen.getByRole('textbox', { name: /author name/i }), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByRole('textbox', { name: /comment/i }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))
    await waitFor(() => expect(onAddComment).toHaveBeenCalled())
    expect(screen.getByRole('textbox', { name: /author name/i })).toHaveValue('Bob')
    expect(screen.getByRole('textbox', { name: /comment/i })).toHaveValue('hi')
  })
})
```

Also import `fireEvent` and `waitFor` at the top of the test file.

### 2b. Add form to `CommentList.jsx`

Add inside the component function:
```jsx
const [author, setAuthor]             = useState('')
const [content, setContent]           = useState('')
const [isSubmitting, setIsSubmitting] = useState(false)
const [error, setError]               = useState(null)

async function handleSubmit(e) {
  e.preventDefault()
  if (author.trim() === '') { setError('Author name is required'); return }
  if (content.trim() === '') { setError('Comment text is required'); return }
  setIsSubmitting(true); setError(null)
  try {
    await onAddComment({ author: author.trim(), content: content.trim() })
    setAuthor(''); setContent('')
  } catch (err) {
    setError(err.message)
  } finally {
    setIsSubmitting(false)
  }
}
```

Append after the `<ul>` / empty-state paragraph, still inside `<section>`:
```jsx
<form className="comment-form" onSubmit={handleSubmit}>
  {error && <p role="alert" className="comment-form-error">{error}</p>}
  <input
    type="text"
    aria-label="Author name"
    value={author}
    onChange={e => setAuthor(e.target.value)}
    disabled={isSubmitting}
  />
  <textarea
    aria-label="Comment"
    value={content}
    onChange={e => setContent(e.target.value)}
    disabled={isSubmitting}
    rows={3}
  />
  <button type="submit" disabled={isSubmitting}>
    {isSubmitting ? 'Submitting…' : 'Add Comment'}
  </button>
</form>
```

---

## Subtask 3 — Timestamp Formatting & Styling (Red → Green → Refactor)

### 3a. Add `formatRelativeTime` unit tests to `CommentList.test.jsx`

Use `vi.useFakeTimers()` / `vi.setSystemTime(NOW)` to freeze `Date.now()`. In each test, set the fake time to `NOW`, then call `formatRelativeTime(NOW - delta)`:

```js
describe('formatRelativeTime', () => {
  const NOW = 1_700_000_000_000  // arbitrary fixed "now"

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('returns "just now" for a timestamp 30 seconds ago', () => {
    expect(formatRelativeTime(NOW - 30_000)).toBe('just now')
  })

  it('returns "just now" for a timestamp 59 seconds ago', () => {
    expect(formatRelativeTime(NOW - 59_000)).toBe('just now')
  })

  it('returns "1 minute ago" for a timestamp exactly 60 seconds ago', () => {
    expect(formatRelativeTime(NOW - 60_000)).toBe('1 minute ago')
  })

  it('returns "2 minutes ago" for a timestamp 2 minutes ago', () => {
    expect(formatRelativeTime(NOW - 2 * 60_000)).toBe('2 minutes ago')
  })

  it('returns "59 minutes ago" for a timestamp 59 minutes ago', () => {
    expect(formatRelativeTime(NOW - 59 * 60_000)).toBe('59 minutes ago')
  })

  it('returns "1 hour ago" for a timestamp exactly 60 minutes ago', () => {
    expect(formatRelativeTime(NOW - 60 * 60_000)).toBe('1 hour ago')
  })

  it('returns "3 hours ago" for a timestamp 3 hours ago', () => {
    expect(formatRelativeTime(NOW - 3 * 3_600_000)).toBe('3 hours ago')
  })

  it('returns "23 hours ago" for a timestamp 23 hours ago', () => {
    expect(formatRelativeTime(NOW - 23 * 3_600_000)).toBe('23 hours ago')
  })

  it('returns "yesterday" for a timestamp exactly 24 hours ago', () => {
    expect(formatRelativeTime(NOW - 24 * 3_600_000)).toBe('yesterday')
  })

  it('returns "yesterday" for a timestamp 47 hours ago', () => {
    expect(formatRelativeTime(NOW - 47 * 3_600_000)).toBe('yesterday')
  })

  it('returns "2 days ago" for a timestamp exactly 48 hours ago', () => {
    expect(formatRelativeTime(NOW - 48 * 3_600_000)).toBe('2 days ago')
  })

  it('returns "29 days ago" for a timestamp 29 days ago', () => {
    expect(formatRelativeTime(NOW - 29 * 24 * 3_600_000)).toBe('29 days ago')
  })

  it('returns toLocaleDateString() for a timestamp 30+ days ago', () => {
    const ts = NOW - 30 * 24 * 3_600_000
    expect(formatRelativeTime(ts)).toBe(new Date(ts).toLocaleDateString())
  })
})
```

Also add this integration test **inside the `formatRelativeTime` describe block** (so `beforeEach`/`afterEach` manage the fake timers safely — if the assertion fails, real timers are still restored):
```js
  it('renders relative timestamp inside the <time> element in the comment list', () => {
    const twoHoursAgo = NOW - 2 * 3_600_000
    render(<CommentList
      comments={[{ id: 'c1', card_id: '1', author: 'Bob', content: 'hi', created_at: twoHoursAgo }]}
      onAddComment={noop}
    />)
    expect(screen.getByRole('time')).toHaveTextContent('2 hours ago')
  })
```

### 3b. Implement `formatRelativeTime` (exported from `CommentList.jsx`)

Replace the stub from subtask 1:

```js
export function formatRelativeTime(timestamp) {
  const diff    = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours   = Math.floor(minutes / 60)
  const days    = Math.floor(hours / 24)

  if (seconds < 60)  return 'just now'
  if (minutes < 60)  return minutes === 1 ? '1 minute ago'  : `${minutes} minutes ago`
  if (hours   < 24)  return hours   === 1 ? '1 hour ago'    : `${hours} hours ago`
  if (days    === 1) return 'yesterday'
  if (days    < 30)  return `${days} days ago`
  return new Date(timestamp).toLocaleDateString()
}
```

### 3c. Create `CommentList.css`

```css
/* Section wrapper */
.comment-list {
  margin-top: 1.25rem;
  border-top: 1px solid #eee;
  padding-top: 1rem;
}

.comment-list-heading {
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #444;
}

.comment-list-empty {
  font-size: 0.8rem;
  color: #999;
  font-style: italic;
}

/* Comment list */
.comment-list-items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.comment-item {
  font-size: 0.8rem;
}

.comment-meta {
  display: flex;
  gap: 0.5rem;
  color: #777;
  margin-bottom: 0.2rem;
}

.comment-author {
  font-weight: 600;
  color: #333;
}

.comment-time {
  font-size: 0.75rem;
}

.comment-content {
  color: #333;
}

/* Comment creation form */
.comment-form {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.comment-form-error {
  color: #c0392b;
  font-size: 0.8rem;
  margin: 0;
}

.comment-form input,
.comment-form textarea {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-family: inherit;
}

.comment-form textarea {
  resize: vertical;
}

.comment-form button[type="submit"] {
  align-self: flex-start;
  padding: 0.3rem 0.75rem;
  font-size: 0.8rem;
  border: 1px solid #1a1a2e;
  border-radius: 4px;
  background: none;
  cursor: pointer;
}

.comment-form button[type="submit"]:hover:not(:disabled) {
  background: #1a1a2e;
  color: #fff;
}

.comment-form button[type="submit"]:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

---

## Integration: Update Existing Files

### `CardModal.jsx`

1. Add `onAddComment` to props (default to no-op to prevent crashes in tests that don't supply it):
   ```jsx
   export default function CardModal({ card, onClose, onUpdate, onDelete, onAddComment = () => Promise.resolve() }) {
   ```
2. Add import at top of file:
   ```jsx
   import CommentList from '../CardModal/CommentList.jsx'
   ```
3. Replace lines 185–208 (the entire `<section className="modal-comments">…</section>`) with:
   ```jsx
   <CommentList
     comments={card.comments}
     onAddComment={(data) => onAddComment(card.id, data)}
   />
   ```

### `CardModal.css`

Remove the entire "Comments" block (lines 128–178) — these selectors are now orphaned:
```css
/* DELETE the following rules: */
.modal-comments { … }
.modal-comments-heading { … }
.modal-comments-list { … }
.modal-comment { … }
.modal-comment-meta { … }
.modal-comment-author { … }
.modal-comment-time { … }
.modal-comment-content { … }
.modal-no-comments { … }
```

### `CardModal.test.jsx`

**a) Update the breaking timestamp test** (currently line 415–419):
```js
// REMOVE old test:
// it('renders each comment timestamp using toLocaleString()', ...)

// ADD replacement:
it('renders <time> elements with ISO dateTime attributes for each comment', () => {
  render(<CardModal card={cardWithComments} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} onAddComment={vi.fn()} />)
  const times = document.querySelectorAll('time')
  expect(times[0]).toHaveAttribute('dateTime', new Date(1700000000000).toISOString())
  expect(times[1]).toHaveAttribute('dateTime', new Date(1700000001000).toISOString())
})
```

**b) Add `onAddComment={vi.fn()}` to every `render(<CardModal …/>)` call** in the file. There are roughly 40 render calls — all follow the same pattern `render(<CardModal card={…} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />)`. Add `onAddComment={vi.fn()}` to each. (The default no-op in the component means existing tests won't crash without it, but being explicit is good practice.)

### `Board.jsx`

```jsx
const { cards, loading, error, updateCard, deleteCard, addComment } = useBoard()
// …
<CardModal
  card={selectedCard}
  onClose={() => setSelectedCardId(null)}
  onUpdate={updateCard}
  onDelete={deleteCard}
  onAddComment={addComment}
/>
```

---

## Execution Order (per-subtask TDD cycle)

### Subtask 1 — Comment Display
1. **Create** `CommentList.test.jsx` with the Subtask 1 display tests only (the `CommentList — display` describe block)
2. **Run** `npm test` → all Subtask 1 tests fail (red) ✓
3. **Create** `CommentList.jsx` with display-only implementation (stub `formatRelativeTime` returning `''`, no form yet) and `CommentList.css` (full CSS can be written now)
4. **Run** `npm test` → Subtask 1 tests pass (green) ✓

### Subtask 2 — Comment Creation Form
5. **Add** Subtask 2 form tests to `CommentList.test.jsx` (the `CommentList — form` describe block)
6. **Run** `npm test` → new form tests fail (red), display tests still pass ✓
7. **Update** `CommentList.jsx` to add form state and form JSX
8. **Run** `npm test` → all CommentList tests pass (green) ✓

### Subtask 3 — Timestamp Formatting
9. **Add** Subtask 3 `formatRelativeTime` tests to `CommentList.test.jsx` (the `formatRelativeTime` describe block, including the integration test inside it)
10. **Run** `npm test` → `formatRelativeTime` tests fail (red), others still pass ✓
11. **Update** `CommentList.jsx`: replace the `formatRelativeTime` stub with the real implementation
12. **Run** `npm test` → all CommentList tests pass (green) ✓

### Integration
13. **Modify** `CardModal.jsx` (add `CommentList` import, replace comment section, add `onAddComment` default prop)
14. **Modify** `CardModal.css` (remove orphaned `.modal-comments*` rules)
15. **Modify** `CardModal.test.jsx` (replace broken timestamp test + add `onAddComment={vi.fn()}` to all renders)
16. **Modify** `Board.jsx` (destructure `addComment`, pass as `onAddComment` to `CardModal`)
17. **Run full test suite** → all pass ✓
18. **Refactor** if needed, re-run

---

## Verification

```bash
cd /Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-15/kanban/client
npm test
```

Expected: All existing tests pass (including `Board.test.jsx` which already has `addComment: vi.fn()` in its mock state) + all new `CommentList.test.jsx` tests pass.

Manual smoke test:
1. `npm run dev` + start server
2. Open a card modal → see "Comments" section + "No comments yet" + empty form
3. Fill in author + comment → click "Add Comment" → comment appears immediately (optimistic) with relative timestamp (e.g. "just now")
4. Refresh → comment persists, timestamp updates to e.g. "1 minute ago"
