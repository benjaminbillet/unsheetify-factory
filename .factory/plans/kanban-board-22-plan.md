# Task 22 — Add Inline Editing Functionality

## Context

The Kanban board needs click-to-edit capability so users can update card titles and assignees without opening modals for every small change. The `CardModal` component already has a complete inline editing implementation (Edit buttons, Save/Cancel, Enter/Escape, validation, error display). What is missing:

1. **CardTile** has zero inline editing — the entire tile is a single clickable button that opens the modal. We need click-on-title and click-on-assignee to activate in-place text inputs.
2. **CardModal** lacks blur auto-save — its inputs only save via explicit Save button or Enter key; the task spec requires "save on blur".

Both gaps must be implemented TDD: write failing tests first, then implement.

---

## Architecture Decisions

- **CardTile edit UX**: clicking the title/assignee text (with `stopPropagation`) enters edit mode. The outer tile's click still fires `onCardClick` when the user clicks any non-editing area. No explicit Save/Cancel buttons — save on blur or Enter, cancel on Escape.
- **CardTile error behavior**: on API failure, **exit edit mode and roll back** to original value (compact tile; user can re-click to retry). This differs from CardModal which stays in edit mode on error.
- **CardModal blur-save**: add `onBlur` to both inputs. Use a `skipBlurRef` (set on Cancel/Save `mouseDown`) to prevent the blur event that fires when a button is clicked from double-triggering a save.
- **Prop threading**: `onUpdate` needs to flow `Board → Column → CardTile`. `Column.jsx` gains a pass-through `onUpdate` prop.
- **`skipBlurRef` pattern**: `mousedown` on Cancel/Save sets `skipBlurRef.current = true`; the input's `onBlur` checks and clears it.

---

## Critical Files

| File | Action |
|------|--------|
| `client/src/components/Board/CardTile.test.jsx` | Add `describe('CardTile — inline editing')` block (~25 tests) |
| `client/src/components/Board/CardTile.jsx` | Add inline editing state, handlers, and JSX |
| `client/src/components/Board/CardTile.css` | Add `.card-tile-editing`, `.card-tile-error` styles |
| `client/src/components/Board/Column.jsx` | Thread `onUpdate` prop through to `CardTile` |
| `client/src/components/Board/Board.jsx` | Pass `onUpdate={updateCard}` to `<Column>` |
| `client/src/components/Board/CardModal.test.jsx` | Add blur-save tests for title and assignee |
| `client/src/components/Board/CardModal.jsx` | Add `onBlur` handlers + `skipBlurRef` to title/assignee inputs |

---

## Subtask 1 — CardTile Click-to-Edit (TDD)

### Step 1 (Red): Write tests in `CardTile.test.jsx`

Add a new `describe('CardTile — inline editing', () => { ... })` block. Each test receives `onUpdate={vi.fn()}`. The card fixture at the top of the file is reused.

```
// Edit mode entry
'clicking title text renders a title input initialized to the card title'
'clicking title text does not call onCardClick'
'clicking assignee text renders an assignee input initialized to the card assignee'
'clicking assignee text does not call onCardClick'
'clicking assignee text renders an empty input when assignee is null'
'clicking the card body (not title/assignee) still calls onCardClick'

// Enter key saves
'pressing Enter on title input calls onUpdate(id, { title }) and exits edit mode'
'pressing Enter on assignee input calls onUpdate(id, { assignee }) and exits edit mode'
'pressing Enter with empty assignee calls onUpdate(id, { assignee: null })'

// Escape key cancels
'pressing Escape on title input cancels edit without calling onUpdate'
'pressing Escape on title input restores original title text'
'pressing Escape on assignee input cancels edit without calling onUpdate'
'pressing Escape on assignee input restores original assignee text'

// Blur saves
'blurring title input calls onUpdate(id, { title })'
'blurring assignee input calls onUpdate(id, { assignee })'
'blurring assignee input with empty value calls onUpdate(id, { assignee: null })'

// Validation
'empty title shows validation error and does not call onUpdate'
'whitespace-only title shows validation error and does not call onUpdate'

// Error handling and rollback
'onUpdate failure on title save exits edit mode and restores original title'
'onUpdate failure on title save shows an error alert'
'onUpdate failure on assignee save exits edit mode and shows an error alert'

// Visual feedback
'title edit mode applies card-tile-editing class to the tile'
'assignee edit mode applies card-tile-editing class to the tile'
'shows saving indicator while save is in-flight'
```

### Step 2 (Green): Implement `CardTile.jsx`

```jsx
import { useState, useRef } from 'react'
import './CardTile.css'

export default function CardTile({ card, onCardClick, onUpdate }) {
  const [isEditingTitle, setIsEditingTitle]     = useState(false)
  const [editTitle, setEditTitle]               = useState(card.title)
  const [isEditingAssignee, setIsEditingAssignee] = useState(false)
  const [editAssignee, setEditAssignee]         = useState(card.assignee ?? '')
  const [isSaving, setIsSaving]                 = useState(false)
  const [saveError, setSaveError]               = useState(null)
  const skipBlurRef                             = useRef(false)

  async function handleSaveTitle() {
    if (editTitle.trim() === '') { setSaveError('Title is required'); return }
    setIsSaving(true); setSaveError(null)
    try {
      await onUpdate(card.id, { title: editTitle })
      setIsEditingTitle(false)
    } catch (err) {
      setEditTitle(card.title)        // local rollback
      setIsEditingTitle(false)        // exit edit mode on failure
      setSaveError(err.message)
    } finally { setIsSaving(false) }
  }

  async function handleSaveAssignee() {
    setIsSaving(true); setSaveError(null)
    try {
      await onUpdate(card.id, { assignee: editAssignee === '' ? null : editAssignee })
      setIsEditingAssignee(false)
    } catch (err) {
      setEditAssignee(card.assignee ?? '')  // local rollback
      setIsEditingAssignee(false)
      setSaveError(err.message)
    } finally { setIsSaving(false) }
  }

  const isEditing = isEditingTitle || isEditingAssignee

  return (
    <div
      className={`card-tile${isEditing ? ' card-tile-editing' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => !isEditing && onCardClick(card)}
      onKeyDown={e => {
        if (isEditing) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick(card) }
      }}
      aria-label={card.title}
    >
      {/* Title */}
      {isEditingTitle ? (
        <div className="card-tile-field-edit">
          <input
            aria-label="Edit title"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  { skipBlurRef.current = true; handleSaveTitle() }
              if (e.key === 'Escape') { skipBlurRef.current = true; setIsEditingTitle(false); setEditTitle(card.title); setSaveError(null) }
            }}
            onBlur={() => {
              if (skipBlurRef.current) { skipBlurRef.current = false; return }
              handleSaveTitle()
            }}
          />
          {isSaving && <span aria-label="Saving">Saving…</span>}
        </div>
      ) : (
        <h3
          className="card-tile-title"
          onClick={e => { e.stopPropagation(); setEditTitle(card.title); setIsEditingTitle(true); setSaveError(null) }}
        >
          {card.title}
        </h3>
      )}

      {/* Assignee */}
      {isEditingAssignee ? (
        <div className="card-tile-field-edit">
          <input
            aria-label="Edit assignee"
            value={editAssignee}
            onChange={e => setEditAssignee(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  { skipBlurRef.current = true; handleSaveAssignee() }
              if (e.key === 'Escape') { skipBlurRef.current = true; setIsEditingAssignee(false); setEditAssignee(card.assignee ?? ''); setSaveError(null) }
            }}
            onBlur={() => {
              if (skipBlurRef.current) { skipBlurRef.current = false; return }
              handleSaveAssignee()
            }}
          />
          {isSaving && <span aria-label="Saving">Saving…</span>}
        </div>
      ) : (
        <p
          className="card-tile-assignee"
          onClick={e => { e.stopPropagation(); setEditAssignee(card.assignee ?? ''); setIsEditingAssignee(true); setSaveError(null) }}
        >
          {card.assignee ?? 'Unassigned'}
        </p>
      )}

      {card.description && <p className="card-tile-description">{card.description}</p>}
      {saveError && <p role="alert" className="card-tile-error">{saveError}</p>}
    </div>
  )
}
```

### Step 3 (Green): Update `CardTile.css`

Add below existing styles:
```css
.card-tile-editing {
  outline: 2px solid #4a6fa5;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
}

.card-tile-field-edit {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 0.25rem;
}

.card-tile-field-edit input {
  flex: 1;
  font-size: 0.9rem;
  padding: 0.15rem 0.3rem;
  border: 1px solid #4a6fa5;
  border-radius: 3px;
}

.card-tile-error {
  font-size: 0.75rem;
  color: #c0392b;
  margin-top: 0.25rem;
}
```

### Step 4 (Green): Update `Column.jsx`

```jsx
// Add onUpdate to destructured props and forward to CardTile
export default function Column({ title, cards, onCardClick, onUpdate }) {
  // ...
  cards.map(card => (
    <CardTile key={card.id} card={card} onCardClick={onCardClick} onUpdate={onUpdate} />
  ))
}
```

### Step 5 (Green): Update `Board.jsx`

```jsx
<Column title="Ready"       cards={cards.ready}       onCardClick={...} onUpdate={updateCard} />
<Column title="In Progress" cards={cards.in_progress}  onCardClick={...} onUpdate={updateCard} />
<Column title="Done"        cards={cards.done}         onCardClick={...} onUpdate={updateCard} />
```

---

## Subtask 2 — CardModal Blur-Save (TDD)

### Step 1 (Red): Add blur tests in `CardModal.test.jsx`

In `describe('CardModal — edit title')`, add:
```
'blurring the title input calls onUpdate(id, { title })'
'blurring the title input does not call onUpdate when blur is caused by clicking Cancel'
```

In `describe('CardModal — edit assignee')`, add:
```
'blurring the assignee input calls onUpdate(id, { assignee })'
'blurring the assignee input does not call onUpdate when blur is caused by clicking Cancel'
```

For the "Cancel blur" tests, simulate with `fireEvent.mouseDown` on the cancel button before `fireEvent.blur` on the input.

### Step 2 (Green): Update `CardModal.jsx`

Add a single shared `skipBlurRef` at the top of the component:
```jsx
const skipBlurRef = useRef(false)
```

On the title input, add:
```jsx
onBlur={() => {
  if (skipBlurRef.current) { skipBlurRef.current = false; return }
  handleSaveTitle()
}}
```

On both the title Save and Cancel buttons, add:
```jsx
onMouseDown={() => { skipBlurRef.current = true }}
```

Repeat the same pattern for the assignee input and its Save/Cancel buttons.

---

## Subtask 3 — Keyboard Shortcuts & Validation

**CardTile**: Covered in Subtask 1 tests and implementation above.
- Enter → save (via keydown handler calling `handleSave*`)
- Escape → cancel (via keydown handler resetting state)
- Validation: empty/whitespace title → `setSaveError('Title is required')`, no `onUpdate` call

**CardModal**: Already implemented. New blur tests from Subtask 2 complete the coverage. No additional implementation needed for keyboard shortcuts or validation.

---

## Subtask 4 — Error Handling with Rollback

**CardTile** (implemented in Subtask 1):
- `try/catch` in `handleSaveTitle` and `handleSaveAssignee`
- On catch: reset local edit state to `card.title`/`card.assignee`, exit edit mode, set `saveError`
- `useBoard.updateCard` also performs a global state rollback on failure automatically

**CardModal** (already implemented):
- `try/catch` in both save handlers
- On catch: `setSaveError(err.message)`, stay in edit mode
- Global state rollback handled by `useBoard.updateCard`

---

## Verification / Test Strategy

Run the Vitest test suite from the client directory:
```sh
cd kanban/client
npm test
```

Specific checks:
1. **All existing CardTile tests still pass** (backward compatibility — tile click, keyboard, display)
2. **All existing CardModal tests still pass** (no regressions)
3. **New `CardTile — inline editing` tests pass** (~25 tests)
4. **New CardModal blur-save tests pass** (~4 tests)

Manual smoke test:
- Click a card tile's title → input appears, typing updates value, Enter saves, Escape cancels
- Click a card tile's assignee → same behavior; leaving empty saves as "Unassigned"
- Click elsewhere on tile → modal opens as before
- Open modal, click "Edit title", click away (blur) → saves
- Open modal, click "Edit title", press Cancel → no save

---

## Existing Utilities to Reuse

| Utility | Location | Usage |
|---------|----------|-------|
| `updateCard` (from `useBoard`) | `hooks/useBoard.js` | Passed as `onUpdate` prop; handles API call + global state rollback |
| `ApiError` | `api/client.js` | Caught in error handlers; `err.message` shown to user |
| `createPortal` pattern | `CardModal.jsx` | Already in use; no changes needed |
| `vi.fn().mockResolvedValue` / `mockRejectedValue` | test files | Use same patterns as existing CardModal tests |
