# Memory

## Product Overview

## Architecture

- 2026-04-10: UI layer lives under `client/src/components/Board/` — Board (container), Column, CardTile, CardModal all co-located there.
- 2026-04-10: `useBoard()` is called only in `Board.jsx`; Column and CardTile are pure presentational components that receive data and callbacks as props.
- 2026-04-10: `selectedCard` state in `Board.jsx` drives modal visibility — when non-null, `CardModal` is rendered.

## Decisions

- 2026-04-10: Plain CSS files (not CSS Modules or styled-components) used for all components, consistent with the existing `App.css` approach.
- 2026-04-10: `<section aria-label={title}>` gives Column the ARIA `region` role (requires an accessible name), enabling `screen.getByRole('region', { name: 'Ready' })` queries in tests.
- 2026-04-10: Board tests mock `useBoard` via `vi.mock('../../hooks/useBoard.js')` and reset with `useBoard.mockReturnValue(DEFAULT_STATE)` in `beforeEach`; each test calls `render(<Board />)` independently (no render in beforeEach) so tests needing custom mock state set it before rendering.

## Workarounds

## Known Issues

## User Preferences
