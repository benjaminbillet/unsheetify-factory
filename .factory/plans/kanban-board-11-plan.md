# Plan: CardModal Enhancement (Task #11)

## Context

The project is a Kanban board (React + Vitest). A basic `CardModal` already exists at `client/src/components/Board/CardModal.jsx` — it is read-only and renders a plain overlay (no portal). This task enhances it with: React Portal rendering, editable title/assignee fields, save/cancel/error handling, delete with confirmation, comments section display, and visual polish (backdrop blur, animations, responsive CSS).

The task dependency (#10) is complete. All existing tests (10 CardModal, 11 Board) must keep passing throughout.

---

## Critical Files

| File | Change Type |
|---|---|
| `client/src/components/Board/CardModal.jsx` | Major enhancement |
| `client/src/components/Board/CardModal.test.jsx` | ~40 new tests |
| `client/src/components/Board/Board.jsx` | selectedCardId pattern + pass new props |
| `client/src/components/Board/Board.test.jsx` | 2 new tests for card freshness |
| `client/src/components/Board/CardModal.css` | New classes + blur/animation |

---

## Subtask 1 — Board.jsx: selectedCardId freshness pattern

**Problem**: `Board` stores `selectedCard` as a card *object*. After `updateCard` resolves, `useBoard` updates its `cards` state but `selectedCard` stays stale. Fix: store only the card ID; derive the live card from `cards` state each render.

### Tests first (`Board.test.jsx`) — RED

```js
it('modal reflects updated card data when useBoard cards state changes', () => {
  const card = { ...MOCK_CARD, title: 'Old Title' }
  useBoard.mockReturnValue({
    ...DEFAULT_STATE,
    cards: { ready: [card], in_progress: [], done: [] },
  })
  const { rerender } = render(<Board />)
  fireEvent.click(screen.getByRole('button', { name: 'Old Title' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Old Title')

  // Simulate useBoard updating the card in place (e.g. after updateCard resolves)
  useBoard.mockReturnValue({
    ...DEFAULT_STATE,
    cards: { ready: [{ ...card, title: 'New Title' }], in_progress: [], done: [] },
  })
  rerender(<Board />)
  expect(screen.getByRole('dialog')).toHaveTextContent('New Title')
})

it('modal closes automatically when selected card is removed from cards state', () => {
  useBoard.mockReturnValue({
    ...DEFAULT_STATE,
    cards: { ready: [MOCK_CARD], in_progress: [], done: [] },
  })
  const { rerender } = render(<Board />)
  fireEvent.click(screen.getByRole('button', { name: 'Test Card' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()

  // Simulate card being deleted from state
  useBoard.mockReturnValue({
    ...DEFAULT_STATE,
    cards: { ready: [], in_progress: [], done: [] },
  })
  rerender(<Board />)
  expect(screen.queryByRole('dialog')).toBeNull()
})
```

### Implementation (`Board.jsx`)

Replace:
```jsx
const { cards, loading, error } = useBoard()
const [selectedCard, setSelectedCard] = useState(null)
```
with:
```jsx
const { cards, loading, error, updateCard, deleteCard } = useBoard()
const [selectedCardId, setSelectedCardId] = useState(null)
const allCards = [...cards.ready, ...cards.in_progress, ...cards.done]
const selectedCard = selectedCardId ? (allCards.find(c => c.id === selectedCardId) ?? null) : null
```

Change handlers:
```jsx
// onCardClick in each Column:
onCardClick={(card) => setSelectedCardId(card.id)}

// CardModal invocation:
{selectedCard && (
  <CardModal
    card={selectedCard}
    onClose={() => setSelectedCardId(null)}
    onUpdate={updateCard}
    onDelete={deleteCard}
  />
)}
```

---

## Subtask 2 — React Portal

**Tests first (`CardModal.test.jsx`) — RED**

```js
it('renders modal outside the React root container (via portal)', () => {
  const { container } = render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />)
  // Portal renders into document.body, NOT inside the React render container
  expect(container.contains(document.querySelector('.modal-overlay'))).toBe(false)
  expect(document.body.contains(document.querySelector('.modal-overlay'))).toBe(true)
})

it('cleans up portal content from document.body on unmount', () => {
  const { unmount } = render(<CardModal card={card} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />)
  expect(document.querySelector('.modal-overlay')).not.toBeNull()
  unmount()
  expect(document.querySelector('.modal-overlay')).toBeNull()
})
```

**Note on existing tests**: All 10 existing CardModal tests render with `<CardModal card={card} onClose={vi.fn()} />` (no `onUpdate`/`onDelete`). After the enhancement these props are required for Edit/Delete interactions. The existing tests do not click those buttons, so they will continue to pass — but **all existing `render(...)` calls in `CardModal.test.jsx` must be updated** to include `onUpdate={vi.fn()} onDelete={vi.fn()}` to make the test suite robust and consistent with the new interface.

**Note on portal discoverability**: `screen.getByRole` searches `document.body` by default, so all existing role-based queries keep working after the portal change.

### Implementation (`CardModal.jsx`)

```jsx
import { createPortal } from 'react-dom'
// ...
return createPortal(
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal-content" role="dialog" aria-modal="true" aria-label={card.title}
         onClick={e => e.stopPropagation()}>
      {/* existing content */}
    </div>
  </div>,
  document.body
)
```

New props in signature: `{ card, onClose, onUpdate, onDelete }`

---

## Subtask 3 — Editable Title and Assignee Fields

### New state and refs in `CardModal.jsx`

Add to the `react` import: `useState`, `useRef` (in addition to the existing `useEffect`).

```jsx
const [isEditingTitle, setIsEditingTitle] = useState(false)
const [editTitle, setEditTitle]           = useState(card.title)
const [isEditingAssignee, setIsEditingAssignee] = useState(false)
const [editAssignee, setEditAssignee]     = useState(card.assignee ?? '')
const [isSaving, setIsSaving]             = useState(false)
const [saveError, setSaveError]           = useState(null)

const titleInputRef    = useRef(null)
const assigneeInputRef = useRef(null)
```

**Focus management**: When edit mode is entered, focus must move to the corresponding input automatically. Implement with two effects:

```jsx
useEffect(() => {
  if (isEditingTitle && titleInputRef.current) titleInputRef.current.focus()
}, [isEditingTitle])

useEffect(() => {
  if (isEditingAssignee && assigneeInputRef.current) assigneeInputRef.current.focus()
}, [isEditingAssignee])
```

Attach the refs to the inputs (see JSX below): `ref={titleInputRef}` on the title input and `ref={assigneeInputRef}` on the assignee input.

**Edit mode mutual exclusivity**: Only one field may be in edit mode at a time. Opening one edit field must close the other. This is enforced in the `onClick` handlers (see JSX below). Because mutual exclusivity is enforced, the shared `isSaving` flag is safe — at most one save can be in flight at a time.

### Escape key handler update

**Replace** the existing `useEffect` Escape handler entirely — do not add a second one. Having two handlers would call `onClose` twice in view mode, breaking the existing test `'calls onClose when Escape key is pressed'` which asserts `toHaveBeenCalledTimes(1)`.

When editing, Escape cancels the edit (does NOT close modal):
```jsx
useEffect(() => {
  function onKey(e) {
    if (e.key !== 'Escape') return
    if (isEditingTitle) {
      setIsEditingTitle(false); setEditTitle(card.title); setSaveError(null)
    } else if (isEditingAssignee) {
      setIsEditingAssignee(false); setEditAssignee(card.assignee ?? ''); setSaveError(null)
    } else {
      onClose()
    }
  }
  document.addEventListener('keydown', onKey)
  return () => document.removeEventListener('keydown', onKey)
}, [onClose, isEditingTitle, isEditingAssignee, card.title, card.assignee])
```

### Save handlers

```jsx
async function handleSaveTitle() {
  // Validation: title is required
  if (editTitle.trim() === '') {
    setSaveError('Title is required')
    return
  }
  setIsSaving(true); setSaveError(null)
  try {
    await onUpdate(card.id, { title: editTitle })
    setIsEditingTitle(false)
  } catch (err) { setSaveError(err.message) }
  finally { setIsSaving(false) }
}

async function handleSaveAssignee() {
  setIsSaving(true); setSaveError(null)
  try {
    await onUpdate(card.id, { assignee: editAssignee === '' ? null : editAssignee })
    setIsEditingAssignee(false)
  } catch (err) { setSaveError(err.message) }
  finally { setIsSaving(false) }
}
```

### JSX structure for title field

```jsx
{isEditingTitle ? (
  <div className="modal-field-edit">
    <input
      ref={titleInputRef}
      aria-label="Title"
      value={editTitle}
      onChange={e => setEditTitle(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle() }}
    />
    <button aria-label="Save" onClick={handleSaveTitle} disabled={isSaving}>
      {isSaving ? 'Saving…' : 'Save'}
    </button>
    <button aria-label="Cancel" disabled={isSaving}
      onClick={() => { setIsEditingTitle(false); setEditTitle(card.title); setSaveError(null) }}>
      Cancel
    </button>
  </div>
) : (
  <div className="modal-field-view">
    <h2 className="modal-title">{card.title}</h2>
    <button aria-label="Edit title" onClick={() => {
      setIsEditingTitle(true); setEditTitle(card.title)
      // Mutual exclusivity: close assignee edit if open
      setIsEditingAssignee(false); setEditAssignee(card.assignee ?? ''); setSaveError(null)
    }}>Edit</button>
  </div>
)}
```

JSX structure for assignee field (mirrors title; `aria-label="Assignee"` on input, `aria-label="Edit assignee"` on button):

```jsx
{isEditingAssignee ? (
  <div className="modal-field-edit">
    <input
      ref={assigneeInputRef}
      aria-label="Assignee"
      value={editAssignee}
      onChange={e => setEditAssignee(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') handleSaveAssignee() }}
    />
    <button aria-label="Save" onClick={handleSaveAssignee} disabled={isSaving}>
      {isSaving ? 'Saving…' : 'Save'}
    </button>
    <button aria-label="Cancel" disabled={isSaving}
      onClick={() => { setIsEditingAssignee(false); setEditAssignee(card.assignee ?? ''); setSaveError(null) }}>
      Cancel
    </button>
  </div>
) : (
  <div className="modal-field-view">
    <p className="modal-assignee"><strong>Assignee:</strong> {card.assignee ?? 'Unassigned'}</p>
    <button aria-label="Edit assignee" onClick={() => {
      setIsEditingAssignee(true); setEditAssignee(card.assignee ?? '')
      // Mutual exclusivity: close title edit if open
      setIsEditingTitle(false); setEditTitle(card.title); setSaveError(null)
    }}>Edit</button>
  </div>
)}
```

Description display (read-only, kept from existing implementation — place between assignee field and the error alert):
```jsx
<p className="modal-description">{card.description ?? 'No description'}</p>
```

Shared error display (render once in modal-content, below description):
```jsx
{saveError && <p role="alert" className="modal-error">{saveError}</p>}
```

**Full content order inside `.modal-content`**:
1. Close button (`aria-label="Close"`)
2. Title field (editable block)
3. Assignee field (editable block)
4. Description paragraph (read-only)
5. Error alert (`role="alert"`, only when `saveError` is set)
6. Comments section (`<section>`)
7. Delete button / confirmation block

**Async test pattern**: Any test that asserts on the outcome of `onUpdate` or `onDelete` (which are async) must use `await waitFor(...)`. Example:
```js
const onUpdate = vi.fn().mockResolvedValue({ ...card, title: 'New title' })
// ... render, click edit, change input, click Save ...
await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('1', { title: 'New title' }))
```
Import `waitFor` from `@testing-library/react`. Tests checking the *loading* state (isSaving while promise is pending) do not need `waitFor` — they check synchronous state after `fireEvent.click`.

### Tests (`CardModal.test.jsx`) — new `describe('edit title', ...)` and `describe('edit assignee', ...)`

**Title tests** (15):
- `shows Edit title button in view mode`
- `clicking Edit title shows an input with current title value`
- `clicking Edit title hides the static heading`
- `clicking Edit title focuses the title input`
- `shows Save and Cancel buttons when editing title`
- `Cancel restores original title and exits edit mode`
- `Escape key cancels title edit without closing modal`
- `Save calls onUpdate(id, { title: newTitle })`
- `Save disables button and shows Saving… while pending`
- `Save exits edit mode on success`
- `Save shows alert with error message on rejection`
- `Save stays in edit mode on rejection`
- `Save shows validation error and does not call onUpdate when title is empty`
- `Enter key in title input triggers save`
- `opening title edit cancels any open assignee edit`

**Assignee tests** (13):
- `shows Edit assignee button in view mode`
- `clicking Edit assignee shows an input with current assignee value`
- `clicking Edit assignee shows empty input when assignee is null`
- `clicking Edit assignee focuses the assignee input`
- `shows Save and Cancel buttons when editing assignee`
- `Cancel restores original assignee and exits edit mode`
- `Escape key cancels assignee edit without closing modal`
- `Save calls onUpdate(id, { assignee: newValue })`
- `Save with empty input calls onUpdate(id, { assignee: null })`
- `Save shows alert with error message on rejection`
- `Save stays in edit mode on rejection`
- `Enter key in assignee input triggers save`
- `opening assignee edit cancels any open title edit`

---

## Subtask 4 — Delete with Inline Confirmation

### New state

```jsx
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
const [isDeleting, setIsDeleting]               = useState(false)
```

### Delete handler

```jsx
async function handleConfirmDelete() {
  setIsDeleting(true); setSaveError(null)
  try {
    await onDelete(card.id)
    onClose()
  } catch (err) {
    setSaveError(err.message)
    setShowDeleteConfirm(false)
  } finally { setIsDeleting(false) }
}
```

### JSX (bottom of modal-content)

```jsx
{showDeleteConfirm ? (
  <div className="modal-delete-confirm" role="region" aria-label="Delete confirmation">
    <p>Are you sure you want to delete this card?</p>
    <button aria-label="Confirm delete" onClick={handleConfirmDelete} disabled={isDeleting}>
      {isDeleting ? 'Deleting…' : 'Confirm delete'}
    </button>
    <button aria-label="Keep card" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
      Keep card
    </button>
  </div>
) : (
  <button className="modal-delete" aria-label="Delete"
    onClick={() => setShowDeleteConfirm(true)}>
    Delete
  </button>
)}
```

### Tests — new `describe('delete', ...)` (8)

- `shows Delete button in view mode`
- `clicking Delete shows confirmation prompt with Are you sure`
- `clicking Keep card dismisses confirmation`
- `clicking Confirm delete calls onDelete with card id`
- `Confirm delete button is disabled while onDelete is pending`
- `modal calls onClose after successful delete`
- `shows error alert when onDelete rejects`
- `delete error dismisses confirmation and returns to view mode`

---

## Subtask 5 — Comments Section

### JSX (inside modal-content, below description)

```jsx
<section className="modal-comments">
  <h3 className="modal-comments-heading">Comments</h3>
  {card.comments.length === 0 ? (
    <p className="modal-no-comments">No comments yet</p>
  ) : (
    <ul className="modal-comments-list">
      {card.comments.map(cm => (
        <li key={cm.id} data-testid="comment" className="modal-comment">
          <div className="modal-comment-meta">
            <span className="modal-comment-author">{cm.author}</span>
            <time className="modal-comment-time" dateTime={new Date(cm.created_at).toISOString()}>
              {new Date(cm.created_at).toLocaleString()}
            </time>
          </div>
          <p className="modal-comment-content">{cm.content}</p>
        </li>
      ))}
    </ul>
  )}
</section>
```

### Tests — new `describe('comments', ...)` (7)

```js
// `card` is the file-level fixture already defined at the top of CardModal.test.jsx
const cardWithComments = {
  ...card,
  comments: [
    { id: 'cm1', card_id: '1', author: 'Bob', content: 'Looks good!', created_at: 1700000000000 },
    { id: 'cm2', card_id: '1', author: 'Alice', content: 'Needs work', created_at: 1700000001000 },
  ]
}
```

- `renders a Comments heading`
- `renders each comment author`
- `renders each comment content`
- `renders each comment timestamp using toLocaleString()`
- `renders comments in order (first appears before second in DOM)`
- `renders "No comments yet" when comments array is empty`
- `does not render "No comments yet" when comments exist`

---

## Subtask 6 — CSS Polish (no new tests)

Add to `CardModal.css`:

```css
/* Backdrop blur */
.modal-overlay {
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

/* Fade-in animation */
@keyframes modal-fade-in { from { opacity: 0; } to { opacity: 1; } }
.modal-overlay { animation: modal-fade-in 150ms ease; }

/* Slide-in animation */
@keyframes modal-slide-in { from { transform: translateY(12px); } to { transform: translateY(0); } }
.modal-content { animation: modal-slide-in 150ms ease; }

/* Mobile bottom sheet */
@media (max-width: 600px) {
  .modal-content {
    max-width: 100%; width: 100%; min-height: 60vh;
    border-radius: 12px 12px 0 0;
    position: fixed; bottom: 0; padding: 1.25rem;
  }
}

/* New element classes */
.modal-field-view { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
.modal-field-edit { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.modal-field-edit input { flex: 1; padding: 0.25rem 0.5rem; font-size: 0.875rem; border: 1px solid #ccc; border-radius: 4px; }
.modal-error { color: #c0392b; font-size: 0.8rem; margin: 0.25rem 0; }
.modal-delete { margin-top: 1rem; background: none; border: 1px solid #c0392b; color: #c0392b; padding: 0.3rem 0.75rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
.modal-delete:hover { background: #c0392b; color: #fff; }
.modal-delete-confirm { margin-top: 1rem; padding: 0.75rem; background: #fff5f5; border-radius: 6px; border: 1px solid #f5c6cb; }
.modal-comments { margin-top: 1.25rem; border-top: 1px solid #eee; padding-top: 1rem; }
.modal-comments-heading { font-size: 0.9rem; font-weight: 600; margin-bottom: 0.5rem; color: #444; }
.modal-comments-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.75rem; }
.modal-comment { font-size: 0.8rem; }
.modal-comment-meta { display: flex; gap: 0.5rem; color: #777; margin-bottom: 0.2rem; }
.modal-comment-author { font-weight: 600; }
.modal-comment-time { font-size: 0.75rem; }
.modal-comment-content { color: #333; }
.modal-no-comments { font-size: 0.8rem; color: #999; font-style: italic; }
```

---

## TDD Execution Order Summary

```
1. Board.test.jsx    → 2 new tests (RED) → update Board.jsx (GREEN)
2. CardModal.test.jsx → update all 10 existing render calls to include onUpdate={vi.fn()} onDelete={vi.fn()}
                     → 2 portal tests (RED) → add createPortal (GREEN)
3. CardModal.test.jsx → 28 edit tests (RED) → add edit state + refs + focus effects + mutual exclusivity + validation + Enter key (GREEN)
4. CardModal.test.jsx → 8 delete tests (RED) → add delete confirm (GREEN)
5. CardModal.test.jsx → 7 comment tests (RED) → add comments JSX (GREEN)
6. CardModal.css only → update styles (no new tests)
```

Total new tests: ~47 (2 Board + 45 CardModal)
All 21 existing tests must remain green throughout.

---

## Verification

```bash
cd client && npm test
```

All tests pass. Manual checks:
- Open board, click a card → modal opens centered with blur backdrop
- Edit title → input appears with focus, save → title updates in place
- Edit assignee → same flow; input receives focus; set empty → saves as "Unassigned"
- Delete → confirmation appears → confirm → modal closes, card gone from board
- Escape key: if editing → cancels edit; if viewing → closes modal
- Comments display with author + timestamp; empty state shows "No comments yet"
- Resize to mobile → modal slides up as bottom sheet
