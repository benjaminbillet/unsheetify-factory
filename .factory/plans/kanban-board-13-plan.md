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
- **Empty columns**: each Column also uses `useDroppable` so cards can be dropped onto empty columns
- **DragOverlay**: renders a copy of the dragged card (floats under cursor, not in the DOM flow)
- **Position formula**: midpoint of neighbors in the target column after removing the active card

## Files to Create or Modify

| File | Change |
|---|---|
| `client/package.json` | Add dnd-kit deps |
| `client/src/components/Board/Board.jsx` | DndContext + DragOverlay + onDragEnd |
| `client/src/components/Board/Board.test.jsx` | Tests for onDragEnd logic |
| `client/src/components/Board/Column.jsx` | SortableContext + useDroppable, accept `columnId` prop |
| `client/src/components/Board/Column.test.jsx` | Tests for sortable context & droppable |
| `client/src/components/Board/CardTile.jsx` | useSortable hook integration |
| `client/src/components/Board/CardTile.test.jsx` | Tests for drag state styles & attributes |
| `client/src/components/Board/CardTile.css` | `.card-tile-dragging` styles |
| `client/src/components/Board/Board.css` | `.card-drag-overlay` styles |

## Subtask-by-Subtask TDD Plan

---

### Subtask 1 — Install and configure dnd-kit with DndContext

#### Red (tests first)
**File**: `Board.test.jsx` — add a new `describe('drag and drop setup')` block  
Mock `@dnd-kit/core` at the top of the file:
```js
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }) => (
    <div data-testid="dnd-context" data-has-ondragend={!!onDragEnd}>{children}</div>
  ),
  closestCenter: vi.fn(),
  DragOverlay: ({ children }) => <div data-testid="drag-overlay">{children}</div>,
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
  MouseSensor: class MouseSensor {},
  TouchSensor: class TouchSensor {},
  KeyboardSensor: class KeyboardSensor {},
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
1. `renders DndContext wrapping the board` — `screen.getByTestId('dnd-context')` exists
2. `DndContext receives onDragEnd handler` — `data-has-ondragend="true"` attribute present
3. `renders DragOverlay inside DndContext` — `screen.getByTestId('drag-overlay')` exists

#### Green (implementation)
**`client/package.json`**: Add to `dependencies`:
```json
"@dnd-kit/core": "^6.1.0",
"@dnd-kit/sortable": "^8.0.0",
"@dnd-kit/utilities": "^3.2.2"
```
Run `npm install` in `client/`.

**`Board.jsx`** — wrap return value:
```jsx
import { DndContext, closestCenter, DragOverlay, useSensor, useSensors, MouseSensor, TouchSensor } from '@dnd-kit/core'

const sensors = useSensors(
  useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
)

const [activeCard, setActiveCard] = useState(null)

function handleDragStart({ active }) {
  const all = [...cards.ready, ...cards.in_progress, ...cards.done]
  setActiveCard(all.find(c => c.id === active.id) ?? null)
}

function handleDragEnd(event) { /* filled in Subtask 3 */ setActiveCard(null) }

return (
  <DndContext sensors={sensors} collisionDetection={closestCenter}
              onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
    <div className="board">
      <Column ... />
      ...
    </div>
    <DragOverlay>
      {activeCard
        ? <CardTile card={activeCard} onCardClick={() => {}} className="card-drag-overlay" />
        : null}
    </DragOverlay>
  </DndContext>
)
```

---

### Subtask 2 — Implement sortable columns and cards

#### Red (tests first)

**`Column.test.jsx`** — add `describe('sortable context')`:  
Add mock at top:
```js
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

**Test cases**:
1. `Column passes card IDs to SortableContext items` — `JSON.parse(getByTestId('sortable-context').dataset.items)` equals `['1','2','3']`
2. `Column applies drag-over class when isOver is true` — mock `useDroppable` returning `isOver: true`, check `column-drag-over` class present

**`CardTile.test.jsx`** — add `describe('sortable behavior')`:  
Add mock at top:
```js
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: vi.fn(() => ({
    attributes: { 'aria-pressed': false },
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

**Test cases**:
1. `useSortable is called with the card id` — `expect(useSortable).toHaveBeenCalledWith({ id: card.id })`
2. `CardTile spreads aria attributes from useSortable` — rendered element has `aria-pressed` attribute
3. `CardTile does not have dragging class when isDragging is false` — no `.card-tile-dragging` class
4. `CardTile has dragging class when isDragging is true` — mock `isDragging: true`, class `card-tile-dragging` present
5. `CardTile applies inline transform style from useSortable` — mock `transform: { x: 0, y: 10, scaleX: 1, scaleY: 1 }`, CSS.Transform.toString returns `'translate3d(0px,10px,0)'`, check `style.transform` on element

#### Green (implementation)

**`Column.jsx`**:
```jsx
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'

export default function Column({ title, cards, columnId, onCardClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId })
  const cardIds = cards.map(c => c.id)

  return (
    <section className={`column${isOver ? ' column-drag-over' : ''}`} aria-label={title}>
      <header className="column-header">...</header>
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

**`Board.jsx`**: Pass `columnId` to each Column:
```jsx
<Column title="Ready" columnId="ready" cards={cards.ready} ... />
<Column title="In Progress" columnId="in-progress" cards={cards.in_progress} ... />
<Column title="Done" columnId="done" cards={cards.done} ... />
```

**`CardTile.jsx`**:
```jsx
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export default function CardTile({ card, onCardClick, className }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onCardClick(card)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card-tile${isDragging ? ' card-tile-dragging' : ''}${className ? ` ${className}` : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onCardClick(card)}
      onKeyDown={handleKeyDown}
      aria-label={card.title}
      {...attributes}
      {...listeners}
    >
      <h3 className="card-tile-title">{card.title}</h3>
      <p className="card-tile-assignee">{card.assignee ?? 'Unassigned'}</p>
      {card.description && <p className="card-tile-description">{card.description}</p>}
    </div>
  )
}
```

Note: `{...listeners}` is spread last for pointer events but `onKeyDown` is defined before it. Since listeners also include `onKeyDown` from dnd-kit, and the explicit `onKeyDown` is defined on the element before spread, the spread will OVERWRITE it. To fix: merge keydown handlers.

**Fix**: combine handlers:
```jsx
onKeyDown={(e) => {
  // Run modal-open logic
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick(card) }
  // Also run dnd-kit keyboard handler (if any)
  listeners?.onKeyDown?.(e)
}}
// Spread all listeners EXCEPT onKeyDown
{...Object.fromEntries(Object.entries(listeners ?? {}).filter(([k]) => k !== 'onKeyDown'))}
```

---

### Subtask 3 — Add drag end handler for position updates

#### Red (tests first)

**`Board.test.jsx`** — add `describe('onDragEnd handler')`:

Helper to simulate drag end:
```js
function getDragEndHandler() {
  render(<Board />)
  // Extract the onDragEnd prop from the mocked DndContext
  // The mock renders data-has-ondragend; we need to capture the handler.
  // Refine mock to capture:
}
```

Refine `DndContext` mock to capture `onDragEnd`:
```js
let capturedOnDragEnd
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }) => {
    capturedOnDragEnd = onDragEnd
    return <div>{children}</div>
  },
  ...
}))
```

**Test cases**:
1. `does nothing when over is null` — `capturedOnDragEnd({ active: { id: 'c1' }, over: null })`; `moveCard` not called
2. `does nothing when active.id equals over.id` — `capturedOnDragEnd({ active: { id: 'c1' }, over: { id: 'c1' } })`; `moveCard` not called
3. `calls moveCard when card dropped on different column (empty)` — setup cards state with card in `ready`; simulate dragEnd with `over.id = 'done'`; expect `moveCard('c1', 'done', 1)` called
4. `calls moveCard with midpoint position for cross-column drop onto card` — card c2 in `done` at position 2, card c3 at position 4; drag c1 from `ready` over c2; expect `moveCard('c1', 'done', 1)` (inserted before c2: position = 2/2 = 1)
5. `calls moveCard for same-column reorder` — cards c1(pos=1), c2(pos=2), c3(pos=3) in `ready`; drag c1 over c3; `arrayMove` called; expect `moveCard('c1', 'ready', 2.5)` (avg of c2=2 and c3=3)
6. `does not call moveCard when dropping card on its own column and no change` — card c1 only card in `ready`; dragEnd with `over.id = 'ready'`; moveCard not called (position would be same)

#### Green (implementation)

**`Board.jsx`** — implement `handleDragEnd`:

```js
import { arrayMove } from '@dnd-kit/sortable'
import { columnToKey } from '../../hooks/useBoard.js'

const COLUMN_IDS = ['ready', 'in-progress', 'done']

function findCardColumn(cardId, cards) {
  for (const [key, colCards] of Object.entries(cards)) {
    if (colCards.some(c => c.id === cardId)) {
      // key is state key; convert back to API format
      return key === 'in_progress' ? 'in-progress' : key
    }
  }
  return null
}

function calculatePosition(sortedCards, insertIndex) {
  if (sortedCards.length === 0) return 1.0
  const before = insertIndex > 0 ? sortedCards[insertIndex - 1].position : 0
  const after = insertIndex < sortedCards.length ? sortedCards[insertIndex].position : undefined
  return after !== undefined ? (before + after) / 2 : before + 1
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

  if (sourceKey === targetKey && !isDroppedOnColumn) {
    // Same-column reorder
    const colCards = cards[targetKey]
    const oldIndex = colCards.findIndex(c => c.id === activeId)
    const newIndex = colCards.findIndex(c => c.id === overId)
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

    const reordered = arrayMove(colCards, oldIndex, newIndex)
    // active card is now at newIndex in reordered
    const before = reordered[newIndex - 1]?.position ?? 0
    const after = reordered[newIndex + 1]?.position
    const newPosition = after !== undefined ? (before + after) / 2 : before + 1
    moveCard(activeId, targetColumn, newPosition)
  } else {
    // Cross-column move (or drop on column itself)
    const targetCards = cards[targetKey].filter(c => c.id !== activeId)

    let insertIndex
    if (isDroppedOnColumn) {
      insertIndex = targetCards.length  // append to end
    } else {
      insertIndex = targetCards.findIndex(c => c.id === overId)
      if (insertIndex === -1) insertIndex = targetCards.length
    }

    // Skip if moving to same column and position would be unchanged
    if (sourceKey === targetKey && targetCards.length === 0) return

    const newPosition = calculatePosition(targetCards, insertIndex)
    moveCard(activeId, targetColumn, newPosition)
  }
}
```

Also export `findCardColumn` and `calculatePosition` from `Board.jsx` (or extract to a utility) so they can be unit-tested in isolation.

---

### Subtask 4 — Visual feedback during drag operations

#### Red (tests first)

**`CardTile.test.jsx`** — add to `describe('sortable behavior')`:
1. `applies card-tile-dragging class when isDragging is true` — already written in Subtask 2
2. `CardTile in drag overlay has additional className applied` — render with `className="card-drag-overlay"`, check class present on root div

**`Board.test.jsx`** — add `describe('drag overlay')`:
1. `DragOverlay renders nothing when no card is being dragged` — no active card, overlay contents empty
2. `DragOverlay renders CardTile with active card during drag` — simulate `onDragStart`; mock captures `onDragStart` handler; after calling it, DragOverlay should show the card

#### Green (implementation)

**`CardTile.css`** — add:
```css
.card-tile-dragging {
  opacity: 0.3;
  background: #d0d4e0;
  box-shadow: none;
}
```

**`Board.css`** — add:
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

The `DragOverlay` and `handleDragStart`/`setActiveCard` are already implemented in Subtask 1.

---

### Subtask 5 — Handle both cross-column and within-column reordering

This subtask validates edge cases in the `handleDragEnd` logic (already implemented above). Additional tests:

**`Board.test.jsx`** — add to `describe('onDragEnd handler')`:
1. `within-column reorder moving card up` — cards [c1(1), c2(2), c3(3)] in ready; drag c3 over c1; expect position = `0 + 1/2 = 0.5` (before c1)
2. `cross-column move to position between two cards` — c1 in `ready`; `done` has c2(2), c3(6); drag c1 over c2; expect position = `1` (= 2/2, before c2)
3. `cross-column append to non-empty column` — `done` has c2(2); drag c1 over `done` column; expect position `3` (= 2 + 1)
4. `cross-column move inserts before over card` — `in-progress` has c2(2), c3(4); drag c1 from `ready` over c3; expect position = `(2+4)/2 = 3`
5. `moveCard is not called if active card not found` — over.id is a card that does not exist; moveCard not called

---

## `calculatePosition` Utility (exported for testing)

Extract to `Board.jsx` or `client/src/utils/dragPosition.js`:
```js
export function calculatePosition(sortedCards, insertIndex) {
  if (sortedCards.length === 0) return 1.0
  const before = insertIndex > 0 ? sortedCards[insertIndex - 1].position : 0
  const after = insertIndex < sortedCards.length ? sortedCards[insertIndex].position : undefined
  return after !== undefined ? (before + after) / 2 : before + 1
}
```

Write a dedicated test file `dragPosition.test.js` (or include in `Board.test.jsx`):
- `returns 1.0 for empty column`
- `returns half of first card position when inserting at index 0`
- `returns last position + 1 when appending`
- `returns midpoint when inserting between two cards`

---

## Verification

1. **Run tests**: `cd kanban/client && npm test` — all existing tests must still pass; new drag-related tests must pass
2. **Manual smoke test**:
   - Start server: `cd kanban/server && npm start`
   - Start client: `cd kanban/client && npm run dev`
   - Drag a card between columns → card appears in new column, position persists on refresh
   - Reorder cards within a column → order persists on refresh
   - Click a card without dragging → modal opens (distance constraint check)
   - Drag card to empty column → card moves correctly
   - Verify drag overlay appears during drag with visual rotation/shadow

## Key Utilities to Reuse

| Utility | File | Purpose |
|---|---|---|
| `moveCard(id, col, pos)` | `hooks/useBoard.js` | API call + optimistic update + rollback |
| `columnToKey(col)` | `hooks/useBoard.js` | `'in-progress'` → `'in_progress'` |
| `arrayMove(arr, from, to)` | `@dnd-kit/sortable` | Reorder array for same-column moves |
| `CSS.Transform.toString(t)` | `@dnd-kit/utilities` | Convert transform object to CSS string |
