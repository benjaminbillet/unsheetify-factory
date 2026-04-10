# Task 13: Drag and Drop with dnd-kit

## Context
The Kanban board needs drag-and-drop so users can move cards between columns and reorder them within a column. The backend already has fractional positioning support (`PATCH /api/cards/:id` with `{ column, position }`) and the `useBoard` hook already exposes `moveCard(id, targetColumn, position)` with optimistic updates and rollback. No drag-and-drop library is installed yet.

## Architecture Decisions
- **dnd-kit packages**: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- **Collision detection**: `closestCenter` (works well for vertical lists)
- **Strategy**: `verticalListSortingStrategy` inside each column's `SortableContext`
- **Column IDs** (for dnd-kit): API format — `"ready"`, `"in-progress"`, `"done"`
- **Card IDs** (for dnd-kit): the card's `id` UUID directly
- **Activation constraint**: `distance: 8` px for `MouseSensor` — prevents accidental drags, preserves click-to-open-modal behavior
- **Empty columns**: each Column also uses `useDroppable` (same ID as columnId) so cards can be dropped onto empty columns
- **DragOverlay**: renders a copy of the dragged card (floats under cursor, not in the DOM flow); placed inside `DndContext` but outside `SortableContext`
- **Position formula**: midpoint of neighbors in the target column after removing the active card
- **Utility functions**: `findCardColumn`, `calculatePosition`, and `COLUMN_IDS` are defined at **module level** (outside the Board component function) in `Board.jsx` so they can be exported and unit-tested independently

## Files to Create or Modify

| File | Change |
|---|---|
| `client/package.json` | Add dnd-kit deps |
| `client/src/components/Board/Board.jsx` | DndContext + DragOverlay + onDragStart + onDragEnd |
| `client/src/components/Board/Board.test.jsx` | Add dnd-kit mocks + tests for drag handler logic |
| `client/src/components/Board/Column.jsx` | SortableContext + useDroppable, accept `columnId` prop |
| `client/src/components/Board/Column.test.jsx` | Add `columnId` to all existing renders + sortable/droppable tests |
| `client/src/components/Board/CardTile.jsx` | useSortable hook integration |
| `client/src/components/Board/CardTile.test.jsx` | Add dnd-kit mock + drag state/style tests |
| `client/src/components/Board/CardTile.css` | `.card-tile-dragging` styles |
| `client/src/components/Board/Board.css` | `.card-drag-overlay` styles |
| `client/src/components/Board/Column.css` | `.column-drag-over` styles |

---

## Subtask-by-Subtask TDD Plan

---

### Subtask 1 — Install and configure dnd-kit with DndContext

#### Red (tests first)

**File**: `Board.test.jsx` — add dnd-kit mocks at the **top of the file** (module level, outside any describe block) and add a new `describe('drag and drop setup')` block.

The mocks must be added as the very first `vi.mock()` calls in the file so they apply to all describe blocks (including existing ones).

Also update the existing imports:
- Add `act` to the `@testing-library/react` import: `import { render, screen, fireEvent, within, act } from '@testing-library/react'`
- Add `afterEach` to the vitest import: `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'`

Add a global `afterEach` (alongside the existing `beforeEach`) to clear all mock call histories between tests. This is required because `DEFAULT_STATE.moveCard` is a module-level `vi.fn()` whose call history persists across tests — without clearing it, `not.toHaveBeenCalled()` assertions fail after any test that does call `moveCard`:

```js
afterEach(() => {
  vi.clearAllMocks()
})
```

```js
// Capture handlers for use in tests
let capturedOnDragStart
let capturedOnDragEnd

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragStart, onDragEnd }) => {
    capturedOnDragStart = onDragStart
    capturedOnDragEnd = onDragEnd
    return <div data-testid="dnd-context">{children}</div>
  },
  closestCenter: vi.fn(),
  DragOverlay: ({ children }) => <div data-testid="drag-overlay">{children}</div>,
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
  MouseSensor: class MouseSensor {},
  TouchSensor: class TouchSensor {},
}))
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }) => <>{children}</>,
  useSortable: vi.fn(() => ({
    attributes: {}, listeners: {}, setNodeRef: vi.fn(),
    transform: null, transition: null, isDragging: false,
  })),
  verticalListSortingStrategy: 'vertical',
  arrayMove: vi.fn((arr, from, to) => {
    const result = [...arr]
    const [item] = result.splice(from, 1)
    result.splice(to, 0, item)
    return result
  }),
}))
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: vi.fn(() => '') } },
}))
```

**Test cases to write** (confirm they FAIL before implementation):
1. `renders DndContext wrapping the board` — `screen.getByTestId('dnd-context')` exists after `render(<Board />)`
2. `DndContext receives onDragEnd handler` — after render, `capturedOnDragEnd` is a function
3. `DndContext receives onDragStart handler` — after render, `capturedOnDragStart` is a function
4. `renders DragOverlay inside DndContext` — `screen.getByTestId('drag-overlay')` exists

#### Green (implementation)

**`client/package.json`**: Add to `dependencies`:
```json
"@dnd-kit/core": "^6.1.0",
"@dnd-kit/sortable": "^8.0.0",
"@dnd-kit/utilities": "^3.2.2"
```
Run `npm install` inside `client/`.

**`Board.jsx`** — full revised structure (showing hooks placement relative to early returns):
```jsx
import { useState } from 'react'
import { DndContext, closestCenter, DragOverlay, useSensor, useSensors, MouseSensor, TouchSensor } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useBoard, columnToKey } from '../../hooks/useBoard.js'
import Column from './Column.jsx'
import CardModal from './CardModal.jsx'
import './Board.css'

// Module-level constants and pure utilities (exported for testing)
export const COLUMN_IDS = ['ready', 'in-progress', 'done']

export function findCardColumn(cardId, cards) {
  for (const [key, colCards] of Object.entries(cards)) {
    if (colCards.some(c => c.id === cardId)) {
      return key === 'in_progress' ? 'in-progress' : key
    }
  }
  return null
}

export function calculatePosition(sortedCards, insertIndex) {
  if (sortedCards.length === 0) return 1.0
  const before = insertIndex > 0 ? sortedCards[insertIndex - 1].position : 0
  const after = insertIndex < sortedCards.length ? sortedCards[insertIndex].position : undefined
  return after !== undefined ? (before + after) / 2 : before + 1
}

export default function Board() {
  const { cards, loading, error, updateCard, deleteCard, addComment, moveCard } = useBoard()
  const [selectedCardId, setSelectedCardId] = useState(null)
  const [activeCard, setActiveCard] = useState(null)

  // ALL hooks must be declared BEFORE early returns (React Rules of Hooks)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  if (loading) return <div className="board-loading" aria-label="Loading">Loading…</div>
  if (error) return <div className="board-error" role="alert">{error}</div>

  const allCards = [...cards.ready, ...cards.in_progress, ...cards.done]
  const selectedCard = selectedCardId ? (allCards.find(c => c.id === selectedCardId) ?? null) : null

  function handleDragStart({ active }) {
    setActiveCard(allCards.find(c => c.id === active.id) ?? null)
  }

  function handleDragEnd({ active, over }) {
    setActiveCard(null)
    if (!over || active.id === over.id) return

    const activeId = active.id
    const overId = over.id

    const sourceColumn = findCardColumn(activeId, cards)
    if (!sourceColumn) return

    const isDroppedOnColumn = COLUMN_IDS.includes(overId)
    const targetColumn = isDroppedOnColumn ? overId : findCardColumn(overId, cards)
    if (!targetColumn) return

    const sourceKey = columnToKey(sourceColumn)
    const targetKey = columnToKey(targetColumn)

    // No-op: dropped card on its own column header/empty area
    if (sourceKey === targetKey && isDroppedOnColumn) return

    if (sourceKey === targetKey) {
      // Same-column reorder
      const colCards = cards[targetKey]
      const oldIndex = colCards.findIndex(c => c.id === activeId)
      const newIndex = colCards.findIndex(c => c.id === overId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

      const reordered = arrayMove(colCards, oldIndex, newIndex)
      const before = reordered[newIndex - 1]?.position ?? 0
      const after = reordered[newIndex + 1]?.position
      const newPosition = after !== undefined ? (before + after) / 2 : before + 1
      moveCard(activeId, targetColumn, newPosition)
    } else {
      // Cross-column move
      const targetCards = cards[targetKey].filter(c => c.id !== activeId)
      let insertIndex = isDroppedOnColumn
        ? targetCards.length
        : targetCards.findIndex(c => c.id === overId)
      if (insertIndex === -1) insertIndex = targetCards.length

      const newPosition = calculatePosition(targetCards, insertIndex)
      moveCard(activeId, targetColumn, newPosition)
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter}
                onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="board">
        <Column title="Ready" columnId="ready" cards={cards.ready} onCardClick={(card) => setSelectedCardId(card.id)} />
        <Column title="In Progress" columnId="in-progress" cards={cards.in_progress} onCardClick={(card) => setSelectedCardId(card.id)} />
        <Column title="Done" columnId="done" cards={cards.done} onCardClick={(card) => setSelectedCardId(card.id)} />
      </div>
      <DragOverlay>
        {activeCard ? (
          <div className="card-tile card-drag-overlay">
            <h3 className="card-tile-title">{activeCard.title}</h3>
            <p className="card-tile-assignee">{activeCard.assignee ?? 'Unassigned'}</p>
            {activeCard.description && (
              <p className="card-tile-description">{activeCard.description}</p>
            )}
          </div>
        ) : null}
      </DragOverlay>
      {selectedCard && (
        <CardModal
          card={selectedCard}
          onClose={() => setSelectedCardId(null)}
          onUpdate={updateCard}
          onDelete={deleteCard}
          onAddComment={addComment}
        />
      )}
    </DndContext>
  )
}
```

---

### Subtask 2 — Implement sortable columns and cards

#### Red (tests first)

**`Column.test.jsx`**:

Add mocks at the top of the file (module level):
```js
import { useDroppable } from '@dnd-kit/core'

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children, items }) => (
    <div data-testid="sortable-context" data-items={JSON.stringify(items)}>{children}</div>
  ),
  verticalListSortingStrategy: 'vertical',
}))
vi.mock('@dnd-kit/core', () => ({
  useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
}))
```

**IMPORTANT**: Update ALL existing `render(<Column ... />)` calls to include `columnId="ready"` (or appropriate value). The `useDroppable` hook requires an `id` argument; without `columnId`, `useDroppable({ id: undefined })` would be called, which is incorrect. Every existing test render becomes:
```jsx
render(<Column title="Ready" cards={MOCK_CARDS} onCardClick={vi.fn()} columnId="ready" />)
```

**Test cases to write** (new tests that FAIL before implementation):
1. `Column renders SortableContext` — `getByTestId('sortable-context')` exists
2. `Column passes card IDs to SortableContext items` — `JSON.parse(getByTestId('sortable-context').dataset.items)` equals `['1','2','3']`
3. `Column applies column-drag-over class when isOver is true`:
   ```js
   // Update mock for this single test:
   useDroppable.mockReturnValueOnce({ setNodeRef: vi.fn(), isOver: true })
   render(<Column title="Ready" cards={MOCK_CARDS} onCardClick={vi.fn()} columnId="ready" />)
   expect(screen.getByRole('region', { name: 'Ready' })).toHaveClass('column-drag-over')
   ```
4. `Column does not apply column-drag-over class when isOver is false` — default mock returns `isOver: false`; class absent

**`CardTile.test.jsx`**:

Add mocks at the top of the file (module level). Import `useSortable` and `CSS` so they can be used directly in tests (since `vi.mock` makes these imports return the mocked versions):
```js
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

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
```

**Test cases to write**:
1. `useSortable is called with the card id` — `expect(useSortable).toHaveBeenCalledWith({ id: card.id })`
2. `CardTile spreads aria attributes from useSortable` — rendered element has `aria-roledescription="sortable"`
3. `CardTile does not have dragging class when isDragging is false` — `expect(screen.getByRole('button')).not.toHaveClass('card-tile-dragging')`
4. `CardTile has dragging class when isDragging is true`:
   ```js
   useSortable.mockReturnValueOnce({
     attributes: { 'aria-roledescription': 'sortable' },
     listeners: { onPointerDown: vi.fn() },
     setNodeRef: vi.fn(),
     transform: null,
     transition: null,
     isDragging: true,   // <-- only this changes
   })
   render(<CardTile card={card} onCardClick={vi.fn()} />)
   expect(screen.getByRole('button')).toHaveClass('card-tile-dragging')
   ```
5. `CardTile applies inline transform style from useSortable`:
   (`CSS` is already imported at the top of the file — do NOT put an import inside the test body):
   ```js
   // Body of the test only — CSS is the module-level import from @dnd-kit/utilities
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
   ```
6. `existing tests still pass` — `calls onCardClick when clicked`, `calls onCardClick when Enter key is pressed`, `calls onCardClick when Space key is pressed` must all still pass (see notes on keydown merging below)

#### Green (implementation)

**`Column.jsx`**:
```jsx
import CardTile from './CardTile.jsx'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import './Column.css'

export default function Column({ title, cards, columnId, onCardClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId })
  const cardIds = cards.map(c => c.id)

  return (
    <section className={`column${isOver ? ' column-drag-over' : ''}`} aria-label={title}>
      <header className="column-header">
        <h2 className="column-title">{title}</h2>
        <span className="column-count" aria-label={`${cards.length} cards`}>
          {cards.length}
        </span>
      </header>
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div className="column-cards" ref={setNodeRef}>
          {cards.length === 0
            ? <p className="column-empty">No cards</p>
            : cards.map(card => <CardTile key={card.id} card={card} onCardClick={onCardClick} />)}
        </div>
      </SortableContext>
    </section>
  )
}
```

**`CardTile.jsx`** — integrate `useSortable` and carefully merge the keydown handlers:

> **Keydown merge rationale**: `{...listeners}` from `useSortable` may include an `onKeyDown` that would overwrite the card's existing `onKeyDown` (which opens the modal). To preserve modal-opening on Enter/Space, the two handlers are merged manually. All other listeners are spread normally.

> **`className` prop removed**: `CardTile` does NOT accept a `className` prop. The `DragOverlay` renders card content as a plain `<div>` (not as `<CardTile>`) specifically to avoid calling `useSortable` outside a `SortableContext`, which would throw at runtime.

```jsx
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import './CardTile.css'

export default function CardTile({ card, onCardClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const { onKeyDown: dndKeyDown, ...restListeners } = listeners ?? {}

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onCardClick(card)
    }
    dndKeyDown?.(e)
  }

  const classes = ['card-tile', isDragging && 'card-tile-dragging']
    .filter(Boolean).join(' ')

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={classes}
      role="button"
      tabIndex={0}
      onClick={() => onCardClick(card)}
      onKeyDown={handleKeyDown}
      aria-label={card.title}
      {...attributes}
      {...restListeners}
    >
      <h3 className="card-tile-title">{card.title}</h3>
      <p className="card-tile-assignee">{card.assignee ?? 'Unassigned'}</p>
      {card.description && <p className="card-tile-description">{card.description}</p>}
    </div>
  )
}
```

---

### Subtask 3 — Add drag end handler for position updates

#### Red (tests first)

**`Board.test.jsx`** — add `describe('onDragEnd handler')` block. The `capturedOnDragEnd` variable was set up in Subtask 1's mock.

For each test, render Board with a specific `useBoard` mock state, then call `capturedOnDragEnd(...)` directly:

```js
describe('onDragEnd handler', () => {
  const CARD_C1 = { id: 'c1', title: 'Card 1', column: 'ready', position: 1, assignee: null, description: null, created_at: 0, comments: [] }
  const CARD_C2 = { id: 'c2', title: 'Card 2', column: 'done', position: 2, assignee: null, description: null, created_at: 0, comments: [] }
  const CARD_C3 = { id: 'c3', title: 'Card 3', column: 'done', position: 4, assignee: null, description: null, created_at: 0, comments: [] }

  it('does nothing when over is null', () => {
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1], in_progress: [], done: [] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'c1' }, over: null })
    expect(DEFAULT_STATE.moveCard).not.toHaveBeenCalled()
  })

  it('does nothing when active.id equals over.id', () => {
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1], in_progress: [], done: [] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'c1' }, over: { id: 'c1' } })
    expect(DEFAULT_STATE.moveCard).not.toHaveBeenCalled()
  })

  it('calls moveCard when card dropped on empty column', () => {
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1], in_progress: [], done: [] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'c1' }, over: { id: 'done' } })
    expect(DEFAULT_STATE.moveCard).toHaveBeenCalledWith('c1', 'done', 1.0)
  })

  it('calls moveCard with position before over card for cross-column drop', () => {
    // c2(pos=2), c3(pos=4) in done; drag c1 from ready over c2 → insert before c2 → position = (0+2)/2 = 1
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1], in_progress: [], done: [CARD_C2, CARD_C3] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'c1' }, over: { id: 'c2' } })
    expect(DEFAULT_STATE.moveCard).toHaveBeenCalledWith('c1', 'done', 1)
  })

  it('calls moveCard for same-column reorder moving card down', () => {
    // [c1(1), c2(2), c3(3)] → drag c1 over c3 → arrayMove([c1,c2,c3],0,2)=[c2,c3,c1] → before=c3.pos=3, after=undefined → 3+1=4
    const c1 = { ...CARD_C1, column: 'ready', position: 1 }
    const c2 = { ...CARD_C2, column: 'ready', position: 2 }
    const c3 = { ...CARD_C3, column: 'ready', position: 3 }
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [c1, c2, c3], in_progress: [], done: [] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'c1' }, over: { id: 'c3' } })
    expect(DEFAULT_STATE.moveCard).toHaveBeenCalledWith('c1', 'ready', 4)
  })

  it('does not call moveCard when card dropped on its own column header', () => {
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1, { ...CARD_C2, column: 'ready' }], in_progress: [], done: [] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'c1' }, over: { id: 'ready' } })
    expect(DEFAULT_STATE.moveCard).not.toHaveBeenCalled()
  })

  it('does not call moveCard when source card is not found in any column', () => {
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1], in_progress: [], done: [] } })
    render(<Board />)
    capturedOnDragEnd({ active: { id: 'nonexistent' }, over: { id: 'done' } })
    expect(DEFAULT_STATE.moveCard).not.toHaveBeenCalled()
  })
})
```

#### Green (implementation)
The full `handleDragEnd` and supporting utilities are shown in Subtask 1's implementation. They are already complete. This subtask's Green phase is completing the logic shown there. No additional code needed beyond what Subtask 1 scaffolded.

---

### Subtask 4 — Visual feedback during drag operations

#### Red (tests first)

**`Board.test.jsx`** — add `describe('drag overlay')`:
```js
describe('drag overlay', () => {
  it('DragOverlay is empty when no card is being dragged', () => {
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [], in_progress: [], done: [] } })
    render(<Board />)
    // DragOverlay renders its children prop as null when no active card
    expect(screen.getByTestId('drag-overlay')).toBeEmptyDOMElement()
  })

  it('DragOverlay shows card title during drag', () => {
    useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [MOCK_CARD], in_progress: [], done: [] } })
    render(<Board />)
    act(() => {
      capturedOnDragStart({ active: { id: MOCK_CARD.id } })
    })
    // The overlay renders a plain div (NOT CardTile) to avoid calling useSortable outside SortableContext
    expect(screen.getByTestId('drag-overlay')).not.toBeEmptyDOMElement()
    expect(within(screen.getByTestId('drag-overlay')).getByText(MOCK_CARD.title)).toBeInTheDocument()
  })
})
```

**`CardTile.test.jsx`** — the dragging class test is already written in Subtask 2. No additional tests needed here.

#### Green (implementation)

**`CardTile.css`** — add:
```css
.card-tile-dragging {
  opacity: 0.3;
  background: #d0d4e0;
  box-shadow: none;
  transform: none !important;
}
```

**`Board.css`** — add (this class is applied directly to the plain `<div>` rendered inside DragOverlay, which also carries the `card-tile` class for base styling):
```css
.card-drag-overlay {
  opacity: 0.95;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  cursor: grabbing;
  transform: rotate(1.5deg);
}
```

**`Column.css`** — add:
```css
.column-drag-over {
  background: #d8dff0;
  outline: 2px dashed #4a6fa5;
  outline-offset: -2px;
}
```

The `DragOverlay`, `handleDragStart`, and `activeCard` state are already implemented in Subtask 1's Board.jsx.

---

### Subtask 5 — Handle both cross-column and within-column reordering

This subtask adds edge-case tests to validate the `handleDragEnd` logic in detail. All implementation is already done in Subtask 1/3.

#### Red (tests first)

**`Board.test.jsx`** — add additional test cases inside `describe('onDragEnd handler')`:

```js
it('same-column reorder moving card up', () => {
  // [c1(1), c2(2), c3(3)] → drag c3 over c1 → arrayMove([c1,c2,c3],2,0)=[c3,c1,c2] → before=0, after=c1.pos=1 → (0+1)/2=0.5
  const c1 = { ...CARD_C1, column: 'ready', position: 1 }
  const c2 = { ...CARD_C2, column: 'ready', position: 2 }
  const c3 = { ...CARD_C3, column: 'ready', position: 3 }
  useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [c1, c2, c3], in_progress: [], done: [] } })
  render(<Board />)
  capturedOnDragEnd({ active: { id: 'c3' }, over: { id: 'c1' } })
  expect(DEFAULT_STATE.moveCard).toHaveBeenCalledWith('c3', 'ready', 0.5)
})

it('cross-column move appends to non-empty column when dropped on column header', () => {
  // done has c2(2); drag c1 over 'done' column → append → position = 2 + 1 = 3
  const c2 = { ...CARD_C2, column: 'done', position: 2 }
  useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1], in_progress: [], done: [c2] } })
  render(<Board />)
  capturedOnDragEnd({ active: { id: 'c1' }, over: { id: 'done' } })
  expect(DEFAULT_STATE.moveCard).toHaveBeenCalledWith('c1', 'done', 3)
})

it('cross-column move inserts before over card when between two cards', () => {
  // in_progress has c2(2), c3(4); drag c1 over c3 → insert before c3 → position = (2+4)/2 = 3
  const c2 = { ...CARD_C2, column: 'in-progress', position: 2 }
  const c3 = { ...CARD_C3, column: 'in-progress', position: 4 }
  useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1], in_progress: [c2, c3], done: [] } })
  render(<Board />)
  capturedOnDragEnd({ active: { id: 'c1' }, over: { id: 'c3' } })
  expect(DEFAULT_STATE.moveCard).toHaveBeenCalledWith('c1', 'in-progress', 3)
})

it('does not call moveCard if same position in same column', () => {
  // Only one card; reorder to self (oldIndex === newIndex guard)
  useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [CARD_C1], in_progress: [], done: [] } })
  render(<Board />)
  // Simulate dragging c1 onto itself with same index (should be caught by active.id === over.id guard)
  capturedOnDragEnd({ active: { id: 'c1' }, over: { id: 'c1' } })
  expect(DEFAULT_STATE.moveCard).not.toHaveBeenCalled()
})
```

#### Green (implementation)
All implementation complete from Subtask 1/3. Run tests to confirm green.

---

## Utility Functions — Unit Tests

**Since `findCardColumn` and `calculatePosition` are exported from `Board.jsx`**, write focused unit tests for them within `Board.test.jsx` in a separate `describe` block (or a new file `Board.utils.test.jsx` — either is fine):

```js
import { findCardColumn, calculatePosition } from './Board.jsx'

describe('findCardColumn', () => {
  const cardsState = {
    ready: [{ id: 'r1', position: 1 }],
    in_progress: [{ id: 'ip1', position: 1 }],
    done: [{ id: 'd1', position: 1 }],
  }
  it('returns "ready" for card in ready column', () => {
    expect(findCardColumn('r1', cardsState)).toBe('ready')
  })
  it('returns "in-progress" for card in in_progress column', () => {
    expect(findCardColumn('ip1', cardsState)).toBe('in-progress')
  })
  it('returns "done" for card in done column', () => {
    expect(findCardColumn('d1', cardsState)).toBe('done')
  })
  it('returns null when card not found', () => {
    expect(findCardColumn('missing', cardsState)).toBeNull()
  })
})

describe('calculatePosition', () => {
  it('returns 1.0 for empty column', () => {
    expect(calculatePosition([], 0)).toBe(1.0)
  })
  it('returns half of first card position when inserting at index 0', () => {
    expect(calculatePosition([{ position: 4 }], 0)).toBe(2)
  })
  it('returns last position + 1 when appending', () => {
    expect(calculatePosition([{ position: 3 }], 1)).toBe(4)
  })
  it('returns midpoint when inserting between two cards', () => {
    expect(calculatePosition([{ position: 2 }, { position: 6 }], 1)).toBe(4)
  })
})
```

---

## Verification

1. **Run tests**: `cd kanban/client && npm test` — all existing tests must still pass; new drag-related tests must pass
2. **Manual smoke test**:
   - Start server: `cd kanban/server && npm start`
   - Start client: `cd kanban/client && npm run dev`
   - Drag a card between columns → card appears in new column, position persists on page refresh
   - Reorder cards within a column → order persists on page refresh
   - Click a card without dragging → modal opens (8px activation constraint prevents accidental drag)
   - Drag card to empty column → card moves correctly, column highlights on hover
   - Drop card on own column header → no change
   - Verify drag overlay appears during drag with visual rotation/shadow effect
   - Verify dragged card placeholder becomes faded (opacity) in original position

## Key Utilities to Reuse

| Utility | File | Purpose |
|---|---|---|
| `moveCard(id, col, pos)` | `hooks/useBoard.js` | API call + optimistic update + rollback |
| `columnToKey(col)` | `hooks/useBoard.js` | `'in-progress'` → `'in_progress'` |
| `arrayMove(arr, from, to)` | `@dnd-kit/sortable` | Reorder array for same-column position calculation |
| `CSS.Transform.toString(t)` | `@dnd-kit/utilities` | Convert transform object to CSS string |

## Key Correctness Notes

1. **Hooks before early returns**: `useSensors`, `useSensor`, and `useState(null)` for `activeCard` must be declared before the `if (loading)` and `if (error)` early returns in Board.jsx (React Rules of Hooks).

2. **No-op guard for same-column column-drop**: When `isDroppedOnColumn && sourceKey === targetKey`, skip immediately — do NOT call moveCard, even if other cards exist in the column.

3. **`listeners` destructuring**: Always use `const { onKeyDown: dndKeyDown, ...restListeners } = listeners ?? {}` and handle `dndKeyDown` in the merged `handleKeyDown` to avoid overwriting the modal-open keyboard behavior.

4. **`DragOverlay` placement**: Must be a direct child of `DndContext`, NOT inside any `SortableContext` or the `.board` div.

5. **`useDroppable` ID = `columnId`**: Column IDs used for `useDroppable` (`"ready"`, `"in-progress"`, `"done"`) are different from card UUIDs, so no ID collision with `SortableContext` items.

6. **`Column.test.jsx` migration**: Every existing `render(<Column ... />)` call must add `columnId="ready"` (or the appropriate column id) — otherwise `useDroppable({ id: undefined })` is called.
