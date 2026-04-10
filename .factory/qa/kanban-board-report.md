# QA Report — Task 13: Drag and Drop Functionality with dnd-kit

**Date:** 2026-04-10
**Branch:** `kanban-board/kanban-board-13` (commit `ba815ca`)
**Reviewer role:** QA Engineer (read-only, no fixes applied)

---

## 1. Scope

Task 13 implements drag-and-drop for the Kanban board using the `@dnd-kit` library family. The following files were created or modified:

| File | Change |
|------|--------|
| `kanban/client/package.json` | Added `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |
| `kanban/client/src/components/Board/Board.jsx` | Full rewrite — DndContext, sensors, handleDragStart/End, DragOverlay, pure helpers |
| `kanban/client/src/components/Board/Column.jsx` | Added SortableContext, useDroppable, column-drag-over CSS class |
| `kanban/client/src/components/Board/CardTile.jsx` | Added useSortable hook, CSS transform style, isDragging class |
| `kanban/client/src/components/Board/Board.css` | Added `.card-drag-overlay` styles |
| `kanban/client/src/components/Board/Column.css` | Added `.column-drag-over` styles |
| `kanban/client/src/components/Board/CardTile.css` | Added `.card-tile-dragging` styles |
| `kanban/client/src/components/Board/Board.test.jsx` | 42 tests covering DnD setup, handlers, overlay, pure utilities |
| `kanban/client/src/components/Board/Column.test.jsx` | 12 tests covering SortableContext, useDroppable, drag-over class |
| `kanban/client/src/components/Board/CardTile.test.jsx` | 43 tests covering useSortable integration, transform, isDragging |

---

## 2. Commands Found and Executed

All commands were run from `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-13/kanban`.

No `Makefile` was present. Commands discovered from:
- `kanban/client/package.json` (`scripts.lint`, `scripts.test`, `scripts.build`)
- `kanban/server/package.json` (`scripts.test`)
- Root `package.json` (`scripts.test:setup`, `scripts.test:server`)

| # | Command | Source | Purpose |
|---|---------|--------|---------|
| 1 | `npm -w client run lint` | `client/package.json` → `scripts.lint` | ESLint on `src/` |
| 2 | `npm -w client run test` | `client/package.json` → `scripts.test` | Vitest client unit tests |
| 3 | `npm -w client run build` | `client/package.json` → `scripts.build` | Vite production build |
| 4 | `npm run test:setup` (root) | Root `package.json` → `scripts.test:setup` | Node built-in tests for project structure/config |
| 5 | `npm run test:server` (root) | Root `package.json` → `scripts.test:server` | Node built-in tests for server API/DB/WebSocket |

---

## 3. Command Results

### 3.1 Lint — `npm -w client run lint`

**Result: PASS**

ESLint completed with no errors or warnings. Exit code 0.

```
> kanban-client@1.0.0 lint
> eslint src
```

---

### 3.2 Client Tests — `npm -w client run test`

**Result: PASS**

All 11 test suites pass with 436 individual tests.

```
 ✓ src/api/client.test.js                             (27 tests)
 ✓ src/hooks/useWebSocket.test.js                     (42 tests)
 ✓ src/components/CardModal/CommentList.test.jsx      (32 tests)
 ✓ src/components/Board/CardTile.test.jsx             (43 tests)
 ✓ src/components/CreateCardForm.test.jsx             (33 tests)
 ✓ src/components/CardModal/BlockEditor.test.jsx      (32 tests)
 ✓ src/components/Board/Column.test.jsx               (12 tests)
 ✓ src/components/Board/Board.test.jsx                (42 tests)
 ✓ src/components/Board/CardModal.test.jsx            (68 tests)
 ✓ src/App.test.jsx                                   ( 4 tests)
 ✓ src/hooks/useBoard.test.js                        (101 tests)

 Test Files  11 passed (11)
      Tests  436 passed (436)
   Duration  5.89s
```

Note: Several `act(...)` warnings appear in stderr from `useBoard.test.js` WebSocket integration tests. These are pre-existing warnings from prior tasks and do not cause test failures.

**Task-13-specific test suites:**

| Suite | Tests | Coverage |
|-------|-------|----------|
| `Board.test.jsx` | 42 | DndContext setup, onDragStart, onDragEnd (8 scenarios), DragOverlay, `findCardColumn`, `calculatePosition` |
| `Column.test.jsx` | 12 | SortableContext renders, card IDs passed as items, `column-drag-over` class on/off |
| `CardTile.test.jsx` | 43 | `useSortable` called with card id, aria attributes spread, dragging class, CSS transform inline style |

---

### 3.3 Client Build — `npm -w client run build`

**Result: PASS**

```
vite v5.4.21 building for production...
✓ 562 modules transformed.
dist/index.html                     0.48 kB │ gzip:   0.30 kB
dist/assets/index-CMjj2VUK.css     30.46 kB │ gzip:   6.17 kB
dist/assets/module-BvCTiNll.js     77.23 kB │ gzip:  27.78 kB
dist/assets/native-B5Vb9Oiz.js    380.35 kB │ gzip:  82.06 kB
dist/assets/index-u0MuBirt.js   1,407.56 kB │ gzip: 436.88 kB

(!) Some chunks are larger than 500 kB after minification.
✓ built in 1.64s
```

The chunk-size advisory warning is pre-existing — it originates from the `@blocknote` rich-text editor introduced in task 14, not from task 13 changes. The build succeeds (exit code 0).

---

### 3.4 Setup/Integration Tests — `npm run test:setup`

**Result: PASS**

```
# tests 76
# suites 13
# pass 76
# fail 0
# duration_ms 56ms
```

All 76 structural tests pass (package.json shape, Docker config, directory structure, vite proxy settings, etc.).

---

### 3.5 Server Tests — `npm run test:server` (`npm -w server run test`)

**Result: FAIL**

```
not ok 1 - test/cards.test.mjs
not ok 2 - test/comments.test.mjs
not ok 3 - test/db.test.mjs
not ok 4 - test/server.test.mjs
ok 5 - WebSocket server setup and client connection
ok 6 - broadcast(event, payload)
ok 7 - Heartbeat / ping mechanism
ok 8 - Client disconnection and cleanup
ok 9 - closeWs with open connections

# tests 25
# pass 21
# fail 4
```

**Root cause:** The server workspace's dependencies (`express`, `better-sqlite3`, `cors`, `uuid`) are not installed. The directory `/kanban/server/node_modules/` does not exist. The 4 failing test files (`cards.test.mjs`, `comments.test.mjs`, `db.test.mjs`, `server.test.mjs`) all import the main `server/index.js` which in turn requires `express`. Node.js throws `ERR_MODULE_NOT_FOUND: Cannot find package 'express'` at module resolution time, causing all tests in those files to fail before any assertion runs.

The 21 passing tests are the `ws.test.mjs` suite, which creates its own `ws` server inline without importing `server/index.js`. The `ws` package is available in the root `node_modules/` (hoisted by npm workspaces), so those tests can load.

**Impact assessment:** This failure is an **environment/dependency installation issue**, not a defect introduced by task 13. The server code itself was not modified by task 13 (drag-and-drop is a client-only feature). The same failure would have occurred on the base branch before task 13 was applied. No server test was broken or regressed by this task.

---

## 4. Implementation Review

### 4.1 Package Installation

**Requirement:** Install `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

**Status: Correct**

All three packages are present in `client/package.json` under `dependencies`:
- `@dnd-kit/core@^6.1.0` (installed: 6.3.1)
- `@dnd-kit/sortable@^8.0.0` (installed: 8.0.0)
- `@dnd-kit/utilities@^3.2.2` (installed: 3.2.2)

Confirmed with `npm ls @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`.

---

### 4.2 Board — DndContext Wrapping

**Requirement:** Wrap Board in `DndContext` with `closestCenter` collision detection

**Status: Correct**

`Board.jsx` imports `DndContext`, `closestCenter`, `DragOverlay`, `useSensor`, `useSensors`, `MouseSensor`, `TouchSensor` from `@dnd-kit/core`. The return JSX wraps everything in:

```jsx
<DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
  ...
  <DragOverlay>...</DragOverlay>
  ...
</DndContext>
```

Sensors are configured with appropriate activation constraints:
- `MouseSensor`: `{ activationConstraint: { distance: 8 } }` (prevents accidental drags on click)
- `TouchSensor`: `{ activationConstraint: { delay: 200, tolerance: 5 } }` (prevents conflicts with scroll)

All hooks (`useSensors`, `useSensor`) are declared before any early returns, satisfying React's Rules of Hooks.

---

### 4.3 Column — SortableContext

**Requirement:** Make Column components use `SortableContext`

**Status: Correct**

`Column.jsx` imports `SortableContext`, `verticalListSortingStrategy` from `@dnd-kit/sortable` and `useDroppable` from `@dnd-kit/core`.

```jsx
const { setNodeRef, isOver } = useDroppable({ id: columnId })
const cardIds = cards.map(c => c.id)

<SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
  <div className="column-cards" ref={setNodeRef}>
    ...
  </div>
</SortableContext>
```

The droppable `ref` is attached to `column-cards` div (inside `SortableContext`). The column itself uses `isOver` to conditionally apply the `column-drag-over` CSS class, providing visual feedback when a card is hovered over the column.

---

### 4.4 CardTile — useSortable Hook

**Requirement:** Add `useSortable` hook to `CardTile` components

**Status: Correct**

`CardTile.jsx` imports `useSortable` from `@dnd-kit/sortable` and `CSS` from `@dnd-kit/utilities`:

```jsx
const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })

const style = {
  transform: CSS.Transform.toString(transform),
  transition,
}
```

The card div receives `ref={setNodeRef}`, `style={style}`, and spreads `{...attributes}` and `{...restListeners}`. The `isDragging` flag adds a `card-tile-dragging` CSS class.

One implementation nuance worth noting: the code destructures `onKeyDown` from `listeners` to compose it with the inline editing keyboard handler:

```jsx
const { onKeyDown: dndKeyDown, ...restListeners } = listeners ?? {}
```

This correctly handles the case where `listeners` may be `null`/`undefined` (via the `?? {}` fallback). The composed handler suppresses DnD keyboard events while a field is in edit mode, preventing conflicts between edit mode and DnD keyboard navigation.

---

### 4.5 onDragEnd Handler

**Requirement:** Implement `onDragEnd` handler to call `moveCard` API; handle both cross-column moves and within-column reordering

**Status: Correct**

`Board.jsx` implements `handleDragEnd` with the following logic:

**Guard conditions:**
- Returns early if `over` is null (dropped outside any droppable)
- Returns early if `active.id === over.id` (dropped on itself)
- Returns early if `sourceColumn` is not found
- Returns early if `targetColumn` is not found
- Returns early for same-column header drop (no-op)

**Cross-column move:**
Uses `calculatePosition()` exported pure helper to compute fractional position. Filters out the dragged card from target column before computing the insert index. Falls back to appending if `overId` is a column ID (dropped on empty column header).

**Within-column reorder:**
Uses `arrayMove()` from `@dnd-kit/sortable` to compute the new order, then re-derives `position` as the midpoint of neighbors:
```js
const before = reordered[newIndex - 1]?.position ?? 0
const after = reordered[newIndex + 1]?.position
const newPosition = after !== undefined ? (before + after) / 2 : before + 1
```

In both cases, `moveCard(activeId, targetColumn, newPosition)` is called, which triggers the optimistic state update and API PATCH call in `useBoard.js`.

**Observation — moveCard API call:** The task requirement states "call moveCard API". The implementation calls `useBoard`'s `moveCard` function, which internally calls `apiUpdateCard` with `{ column, position }` via `PATCH /api/cards/:id`. This is architecturally correct — there is no dedicated `moveCard` REST endpoint; moves go through the generic update endpoint.

---

### 4.6 Visual Feedback During Drag

**Requirement:** Add visual feedback during drag with CSS transforms

**Status: Correct**

Three layers of visual feedback are implemented:

1. **CSS transform on dragged card** — `CardTile` applies `transform: CSS.Transform.toString(transform)` and `transition` as inline styles. dnd-kit updates `transform` in real-time as the user drags, smoothly moving the card element.

2. **Dragging placeholder** — When `isDragging` is true, `.card-tile-dragging` is applied:
   ```css
   .card-tile-dragging {
     opacity: 0.3;
     background: #d0d4e0;
     box-shadow: none;
     transform: none !important;
   }
   ```
   This leaves a faded placeholder in the card's original position.

3. **DragOverlay** — `Board.jsx` renders a `DragOverlay` that shows a floating ghost card during drag. The `handleDragStart` handler sets `activeCard` state; the overlay renders the card's title, assignee, and description. The overlay card has `.card-drag-overlay` CSS:
   ```css
   .card-drag-overlay {
     opacity: 0.95;
     box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
     cursor: grabbing;
     transform: rotate(1.5deg);
   }
   ```

4. **Column drag-over highlight** — When a card is dragged over a column, `.column-drag-over` applies a blue dashed outline:
   ```css
   .column-drag-over {
     background: #d8dff0;
     outline: 2px dashed #4a6fa5;
     outline-offset: -2px;
   }
   ```

---

### 4.7 Pure Utility Functions (Exported for Testing)

Two pure helpers are exported from `Board.jsx`:

**`findCardColumn(cardId, cards)`** — Iterates over the cards state object to find which column contains a given card ID. Normalizes `in_progress` state key back to `in-progress` API format. Returns `null` if not found.

**`calculatePosition(sortedCards, insertIndex)`** — Computes fractional position for cross-column drops: returns 1.0 for empty columns, midpoint between neighbors when inserting between cards, or `lastPosition + 1` when appending.

Both are tested directly via dynamic `import('./Board.jsx')` in `Board.test.jsx`.

---

### 4.8 Code Quality Observations

1. **`useBoard.moveCard` call correctness:** The `handleDragEnd` function calls `moveCard(activeId, targetColumn, newPosition)` where `targetColumn` is always in API format (`'ready'`, `'in-progress'`, `'done'`). The `useBoard.moveCard` function documents that it expects API format. This is consistent.

2. **Edge case — same-column reorder with `oldIndex === newIndex`:** The handler correctly guards with `if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return` — no unnecessary API call is made when a card is dropped back in its original position.

3. **`listeners ?? {}`:** This guards against `listeners` being `null` when `useSortable` is mocked or when the sortable context is not active.

4. **Position arithmetic:** The position calculation uses fractional midpoint bisection (e.g., `(2 + 4) / 2 = 3`). Over many reorders this can lead to precision exhaustion, but this is an accepted limitation of the fractional indexing pattern at this scale.

5. **No TypeScript / no prop-types:** Consistent with the project's established convention — eslint config explicitly disables `react/prop-types`. Not a defect.

---

## 5. Overall Assessment

| Check | Result | Notes |
|-------|--------|-------|
| ESLint (client) | PASS | No errors or warnings |
| Client unit tests (436 tests) | PASS | All 11 suites pass |
| Client production build | PASS | Bundle succeeds; chunk-size advisory is pre-existing |
| Setup/integration tests (76 tests) | PASS | All structural checks pass |
| Server tests | FAIL | 4 of 5 test files fail due to missing server `node_modules` (express, better-sqlite3 not installed). Pre-existing environment issue; no server code was modified by this task |
| `@dnd-kit` packages installed | Correct | All three required packages present and installed |
| Board wrapped in DndContext | Correct | closestCenter, sensors, onDragStart, onDragEnd all wired |
| Column uses SortableContext | Correct | items={cardIds}, verticalListSortingStrategy, useDroppable |
| CardTile uses useSortable | Correct | setNodeRef, transform style, isDragging class, listeners spread |
| onDragEnd calls moveCard | Correct | Both cross-column and within-column paths call moveCard |
| Cross-column reordering | Correct | calculatePosition used; handles empty column, insert before, append |
| Within-column reordering | Correct | arrayMove + midpoint position arithmetic |
| Visual feedback — CSS transform | Correct | CSS.Transform.toString(transform) applied as inline style |
| Visual feedback — dragging placeholder | Correct | card-tile-dragging class: opacity 0.3, no shadow |
| Visual feedback — DragOverlay ghost card | Correct | Floating ghost with rotate(1.5deg) and heavier shadow |
| Visual feedback — column highlight | Correct | column-drag-over: dashed blue outline when isOver |
| No regressions in existing tests | Correct | All 436 client tests pass including previously-written suites |

**The client-side implementation fully satisfies all task 13 requirements. The server test failures are caused by missing npm dependencies in the server workspace (an environment setup issue predating this task) and do not reflect any defect in the drag-and-drop implementation.**

QA Result: PASS
