# Plan: Create Board, Column, and CardTile Components (Task 10)

## Context

The Kanban board app has a working API client (`client/src/api/client.js`) and a `useBoard` custom hook (`client/src/hooks/useBoard.js`) that manages grouped card state. `App.jsx` is a placeholder with a comment where the Board should go. No UI components exist yet. This task builds the visual layer: Board → Column → CardTile, plus a basic CardModal activated by clicking a card.

---

## Architecture Decisions

- **Plain CSS files** (e.g. `Board.css`) — consistent with `App.css`; no CSS modules or styled-components
- **Flexbox** for the three-column layout (no CSS Grid needed here)
- **`useBoard()` called in `Board.jsx`** — column/card data flows down as props; Column and CardTile are pure presentational
- **`selectedCard` state in `Board.jsx`** — drives modal visibility; passed down via `onCardClick` prop chain
- **All component files co-located** under `client/src/components/Board/`
- **Testing**: Vitest + @testing-library/react, matching existing patterns; `vi.mock` to isolate `useBoard`

---

## Files to Create

| File | Purpose |
|------|---------|
| `client/src/components/Board/Board.test.jsx` | Board tests (write first) |
| `client/src/components/Board/Board.jsx` | Board container |
| `client/src/components/Board/Board.css` | Board styles |
| `client/src/components/Board/Column.test.jsx` | Column tests (write first) |
| `client/src/components/Board/Column.jsx` | Column component |
| `client/src/components/Board/Column.css` | Column styles |
| `client/src/components/Board/CardTile.test.jsx` | CardTile tests (write first) |
| `client/src/components/Board/CardTile.jsx` | CardTile component |
| `client/src/components/Board/CardTile.css` | CardTile styles |
| `client/src/components/Board/CardModal.test.jsx` | CardModal tests (write first) |
| `client/src/components/Board/CardModal.jsx` | Card detail modal |
| `client/src/components/Board/CardModal.css` | Modal overlay styles |

## Files to Modify

| File | Change |
|------|--------|
| `client/src/App.jsx` | Import and render `<Board />` in `<main>` |
| `client/src/App.test.jsx` | Add `vi.mock` for `useBoard` (Board now renders inside App) |

---

## Reusable Existing Code

- **`useBoard`** at `client/src/hooks/useBoard.js` — provides `{ cards, loading, error }` where `cards = { ready: Card[], in_progress: Card[], done: Card[] }`
- **`columnToKey`** exported from `useBoard.js` — maps `'in-progress'` → `'in_progress'`
- **Card shape**: `{ id, title, assignee: string|null, description: string|null, column, position, created_at, comments[] }`
- **Test mock pattern** from `useBoard.test.js`: `vi.mock('../api/client.js', () => ({ fetchCards: vi.fn() }))` and `mockResponse()` helper

---

## TDD Implementation Plan

### Subtask 1 — Board Layout Component

#### 1a. Write failing tests: `Board.test.jsx`

```js
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBoard } from '../../hooks/useBoard.js'
import Board from './Board.jsx'

vi.mock('../../hooks/useBoard.js', () => ({ useBoard: vi.fn() }))

const MOCK_CARD = {
  id: 'c1', title: 'Test Card', assignee: 'Alice',
  description: 'A description', column: 'ready',
  position: 1, created_at: Date.now(), comments: [],
}

const DEFAULT_STATE = {
  cards: { ready: [], in_progress: [], done: [] },
  loading: false, error: null,
  createCard: vi.fn(), updateCard: vi.fn(),
  deleteCard: vi.fn(), moveCard: vi.fn(), addComment: vi.fn(),
}

beforeEach(() => {
  useBoard.mockReturnValue(DEFAULT_STATE)
})
```

Test cases:
1. **"renders three column regions"** — `expect(screen.getAllByRole('region')).toHaveLength(3)`
2. **"renders Ready column heading"** — `screen.getByRole('heading', { name: 'Ready' })`
3. **"renders In Progress column heading"** — `screen.getByRole('heading', { name: 'In Progress' })`
4. **"renders Done column heading"** — `screen.getByRole('heading', { name: 'Done' })`
5. **"shows loading indicator when loading is true"** — call `useBoard.mockReturnValue({ ...DEFAULT_STATE, loading: true })`, render, check `screen.getByLabelText('Loading')` is present and columns are absent
6. **"shows error banner when error is set"** — call `useBoard.mockReturnValue({ ...DEFAULT_STATE, error: 'fetch failed' })`, check `screen.getByRole('alert')` contains `'fetch failed'`
7. **"passes ready cards to Ready column"** — `useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [MOCK_CARD], in_progress: [], done: [] } })`, render, verify `screen.getByText('Test Card')` is in the document
8. **"passes in_progress cards to In Progress column"** — same but `in_progress: [{ ...MOCK_CARD, column: 'in-progress' }]`
9. **"passes done cards to Done column"** — same but `done: [{ ...MOCK_CARD, column: 'done' }]`
10. **"opens modal when a card is clicked"** — `useBoard.mockReturnValue({ ...DEFAULT_STATE, cards: { ready: [MOCK_CARD], in_progress: [], done: [] } })`, render, `fireEvent.click(screen.getByRole('button', { name: 'Test Card' }))`, verify `screen.getByRole('dialog')` appears
11. **"closes modal when close button is clicked"** — same setup, open modal, then `fireEvent.click(screen.getByRole('button', { name: /close/i }))`, verify `screen.queryByRole('dialog')` is null

#### 1b. Implement `Board.jsx`

```jsx
import { useState } from 'react'
import { useBoard } from '../../hooks/useBoard.js'
import Column from './Column.jsx'
import CardModal from './CardModal.jsx'
import './Board.css'

export default function Board() {
  const { cards, loading, error } = useBoard()
  const [selectedCard, setSelectedCard] = useState(null)

  if (loading) return <div className="board-loading" aria-label="Loading">Loading…</div>
  if (error)   return <div className="board-error" role="alert">{error}</div>

  return (
    <div className="board">
      <Column title="Ready"       cards={cards.ready}       onCardClick={setSelectedCard} />
      <Column title="In Progress" cards={cards.in_progress} onCardClick={setSelectedCard} />
      <Column title="Done"        cards={cards.done}        onCardClick={setSelectedCard} />
      {selectedCard && <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} />}
    </div>
  )
}
```

#### 1c. `Board.css`

```css
.board { display: flex; gap: 1rem; align-items: flex-start; }
.board-loading { text-align: center; padding: 2rem; color: #666; }
.board-error { padding: 1rem; background: #fee; color: #c00; border-radius: 4px; }
@media (max-width: 768px) { .board { flex-direction: column; } }
```

---

### Subtask 2 — Column Component

#### 2a. Write failing tests: `Column.test.jsx`

```js
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Column from './Column.jsx'

const makeCard = (id, title) => ({
  id, title, assignee: 'Alice', description: 'desc',
  column: 'ready', position: id, created_at: Date.now(), comments: [],
})

const MOCK_CARDS = [makeCard('1', 'Card One'), makeCard('2', 'Card Two'), makeCard('3', 'Card Three')]
```

Test cases — render with `<Column title="Ready" cards={MOCK_CARDS} onCardClick={vi.fn()} />`:
1. **"renders the column title"** — `screen.getByRole('heading', { name: 'Ready' })`
2. **"renders card count equal to number of cards"** — badge span has text content `'3'`; query with `screen.getByLabelText('3 cards')` (the `aria-label` on the count span)
3. **"renders 0 count for empty column"** — render with `cards={[]}`, `screen.getByLabelText('0 cards')`
4. **"renders a CardTile for each card"** — `screen.getByText('Card One')`, `screen.getByText('Card Two')`, `screen.getByText('Card Three')` all present
5. **"renders empty state message when no cards"** — render with `cards={[]}`, `screen.getByText(/no cards/i)`
6. **"calls onCardClick with the correct card when a CardTile is clicked"** — `const handler = vi.fn()`, click `screen.getByRole('button', { name: 'Card One' })`, verify `handler` called with `MOCK_CARDS[0]`

#### 2b. Implement `Column.jsx`

```jsx
import CardTile from './CardTile.jsx'
import './Column.css'

export default function Column({ title, cards, onCardClick }) {
  return (
    <section className="column" aria-label={title}>
      <header className="column-header">
        <h2 className="column-title">{title}</h2>
        <span className="column-count" aria-label={`${cards.length} cards`}>
          {cards.length}
        </span>
      </header>
      <div className="column-cards">
        {cards.length === 0
          ? <p className="column-empty">No cards</p>
          : cards.map(card => (
              <CardTile key={card.id} card={card} onCardClick={onCardClick} />
            ))
        }
      </div>
    </section>
  )
}
```

#### 2c. `Column.css`

```css
.column { flex: 1; min-width: 240px; background: #e8eaf0; border-radius: 8px; padding: 0.75rem; }
.column-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
.column-title { font-size: 1rem; font-weight: 600; color: #1a1a2e; }
.column-count { background: #1a1a2e; color: #fff; border-radius: 999px; padding: 0.1rem 0.5rem; font-size: 0.8rem; }
.column-cards { display: flex; flex-direction: column; gap: 0.5rem; }
.column-empty { color: #888; font-size: 0.875rem; text-align: center; padding: 1rem 0; }
```

---

### Subtask 3 — CardTile Component

#### 3a. Write failing tests: `CardTile.test.jsx`

```js
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CardTile from './CardTile.jsx'

const card = {
  id: '1', title: 'Fix bug', assignee: 'Alice',
  description: 'Short desc', column: 'ready',
  position: 1, created_at: Date.now(), comments: [],
}
```

All tests render with `render(<CardTile card={card} onCardClick={vi.fn()} />)` unless noted.

Test cases:
1. **"renders card title"** — `screen.getByText('Fix bug')`
2. **"renders assignee name when provided"** — `screen.getByText('Alice')`
3. **"renders 'Unassigned' when assignee is null"** — render with `{ ...card, assignee: null }`, check `screen.getByText('Unassigned')`
4. **"renders description when provided"** — `screen.getByText('Short desc')`
5. **"does not render description element when description is null"** — render with `{ ...card, description: null }`, verify `screen.queryByText('Short desc')` is null
6. **"calls onCardClick with the card object when clicked"** — `const handler = vi.fn()`, `fireEvent.click(screen.getByRole('button', { name: 'Fix bug' }))`, verify `handler` called with `card`
7. **"calls onCardClick when Enter key is pressed"** — `fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' })`, verify handler called with `card`
8. **"calls onCardClick when Space key is pressed"** — `fireEvent.keyDown(screen.getByRole('button'), { key: ' ' })`, verify handler called with `card`
9. **"is keyboard-focusable"** — `expect(screen.getByRole('button')).toHaveAttribute('tabindex', '0')`

#### 3b. Implement `CardTile.jsx`

```jsx
import './CardTile.css'

export default function CardTile({ card, onCardClick }) {
  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onCardClick(card)
    }
  }

  return (
    <div
      className="card-tile"
      role="button"
      tabIndex={0}
      onClick={() => onCardClick(card)}
      onKeyDown={handleKeyDown}
      aria-label={card.title}
    >
      <h3 className="card-tile-title">{card.title}</h3>
      <p className="card-tile-assignee">{card.assignee ?? 'Unassigned'}</p>
      {card.description && (
        <p className="card-tile-description">{card.description}</p>
      )}
    </div>
  )
}
```

#### 3c. `CardTile.css`

```css
.card-tile { background: #fff; border-radius: 6px; padding: 0.75rem; cursor: pointer;
             box-shadow: 0 1px 3px rgba(0,0,0,.1); transition: box-shadow 0.15s, transform 0.15s; }
.card-tile:hover, .card-tile:focus { box-shadow: 0 3px 8px rgba(0,0,0,.15); transform: translateY(-1px); outline: 2px solid #4a6fa5; }
.card-tile-title { font-size: 0.9rem; font-weight: 600; color: #1a1a2e; margin-bottom: 0.25rem; }
.card-tile-assignee { font-size: 0.75rem; color: #666; margin-bottom: 0.25rem; }
.card-tile-description { font-size: 0.8rem; color: #444; overflow: hidden;
                          display: -webkit-box; -webkit-line-clamp: 2;
                          -webkit-box-orient: vertical; }
```

---

### Subtask 4 — CardModal + CSS Styling

#### 4a. Write failing tests: `CardModal.test.jsx`

```js
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CardModal from './CardModal.jsx'

const card = {
  id: '1', title: 'Fix bug', assignee: 'Alice',
  description: 'Some description', column: 'ready',
  position: 1, created_at: Date.now(), comments: [],
}
```

All tests render with `render(<CardModal card={card} onClose={vi.fn()} />)` unless noted.

Test cases:
1. **"has dialog role"** — `screen.getByRole('dialog')` is in the document
2. **"renders card title inside dialog"** — `screen.getByRole('dialog')` contains text `'Fix bug'`
3. **"renders assignee name"** — dialog contains text `'Alice'`
4. **"renders 'Unassigned' when assignee is null"** — render with `{ ...card, assignee: null }`, dialog contains `'Unassigned'`
5. **"renders description when present"** — dialog contains `'Some description'`
6. **"renders 'No description' when description is null"** — render with `{ ...card, description: null }`, dialog contains `'No description'`
7. **"calls onClose when close button is clicked"** — `const handler = vi.fn()`, render with `onClose={handler}`, `fireEvent.click(screen.getByRole('button', { name: /close/i }))`, verify `handler` called once
8. **"calls onClose when Escape key is pressed"** — `const handler = vi.fn()`, render with `onClose={handler}`, `fireEvent.keyDown(document.body, { key: 'Escape' })`, verify `handler` called once
9. **"calls onClose when modal overlay is clicked"** — `const handler = vi.fn()`, render with `onClose={handler}`, `fireEvent.click(document.querySelector('.modal-overlay'))`, verify `handler` called once
10. **"does not call onClose when modal content area is clicked"** — `const handler = vi.fn()`, render with `onClose={handler}`, `fireEvent.click(screen.getByRole('dialog'))`, verify `handler` NOT called

#### 4b. Implement `CardModal.jsx`

```jsx
import { useEffect } from 'react'
import './CardModal.css'

export default function CardModal({ card, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" role="dialog" aria-modal="true"
           aria-label={card.title} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <h2 className="modal-title">{card.title}</h2>
        <p className="modal-assignee"><strong>Assignee:</strong> {card.assignee ?? 'Unassigned'}</p>
        <p className="modal-description">{card.description ?? 'No description'}</p>
      </div>
    </div>
  )
}
```

#### 4c. `CardModal.css`

```css
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex;
                 align-items: center; justify-content: center; z-index: 100; }
.modal-content { background: #fff; border-radius: 8px; padding: 1.5rem; max-width: 480px;
                 width: 90%; position: relative; box-shadow: 0 8px 32px rgba(0,0,0,.2); }
.modal-close { position: absolute; top: 0.75rem; right: 0.75rem; background: none;
               border: none; cursor: pointer; font-size: 1.1rem; color: #666; }
.modal-close:hover { color: #1a1a2e; }
.modal-title { font-size: 1.2rem; font-weight: 700; margin-bottom: 0.75rem; color: #1a1a2e; }
.modal-assignee { font-size: 0.875rem; color: #555; margin-bottom: 0.5rem; }
.modal-description { font-size: 0.875rem; color: #333; line-height: 1.5; }
```

---

### App.jsx Update

Modify `client/src/App.jsx`:
```jsx
import Board from './components/Board/Board.jsx'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Kanban Board</h1>
      </header>
      <main className="app-main">
        <Board />
      </main>
    </div>
  )
}

export default App
```

Modify `client/src/App.test.jsx` — add `vi.mock` for `useBoard` at the top (before imports) since Board now renders inside App and would otherwise trigger real API calls. Preserve all 4 existing tests unchanged:
```js
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import App from './App.jsx'

vi.mock('./hooks/useBoard.js', () => ({
  useBoard: vi.fn(() => ({
    cards: { ready: [], in_progress: [], done: [] },
    loading: false, error: null,
    createCard: vi.fn(), updateCard: vi.fn(),
    deleteCard: vi.fn(), moveCard: vi.fn(), addComment: vi.fn(),
  }))
}))

// ... existing 4 test cases remain unchanged
```

Note: `vi.mock` is hoisted by Vitest automatically, so placement in the file is safe. The mock path `'./hooks/useBoard.js'` is relative to `App.test.jsx` (`client/src/`) and resolves to the same module that Board.jsx imports via `'../../hooks/useBoard.js'` — Vitest deduplicates by resolved path.

---

## TDD Execution Order (per subtask)

For each subtask:
1. **Red**: Create the `*.test.jsx` file, run `npm test -- --run` → confirm failures
2. **Green**: Create the `*.jsx` and `*.css` files → run tests → confirm pass
3. **Refactor**: Clean up while keeping tests green

Run tests from `client/` directory:
```bash
cd kanban/client && npm test -- --run
```

Or watch mode during development:
```bash
cd kanban/client && npm test
```

---

## Verification Checklist

- [ ] All new test files pass: Board, Column, CardTile, CardModal
- [ ] Existing tests still pass: App, useBoard, api/client
- [ ] `npm run build` completes without errors
- [ ] Dev server (`npm run dev`) shows three-column board at localhost:5173
- [ ] Cards from the API appear in the correct column
- [ ] Clicking a card opens the modal with title, assignee, description
- [ ] Pressing Escape or clicking overlay closes the modal
- [ ] Responsive: columns stack on narrow screens
- [ ] Keyboard navigation: Tab → card, Enter/Space → opens modal
