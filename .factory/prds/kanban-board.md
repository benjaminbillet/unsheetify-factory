# Kanban Board

## Problem Statement

Team collaboration tools like Jira, Trello, and Linear are powerful but heavyweight: they require account creation, have complex UIs, and introduce friction for small teams who just want to track work. This project provides a dead-simple, self-hosted kanban board accessible via a shared URL — no login, no setup for team members, just open and use.

## Target Users

Small development or project teams (2–10 people) who:
- Work in a trusted environment (same company or project)
- Want a visual task board without account management overhead
- Need to see each other's changes in real time
- Are comfortable with markdown/rich text for task descriptions

## Success Metrics

- Any team member can create a card, assign it, and move it to "Done" in under 30 seconds
- All connected clients reflect any card change within 500ms
- Zero accounts required — share a URL and you're in
- The app starts with a single `docker compose up` command

---

## Capability Tree

### Capability: Card Management
Full lifecycle management of task cards on the board.

#### Feature: Create Card
- **Description**: Create a new card with a title, optional assignee name, and optional description
- **Inputs**: Title (required), assignee (optional free text), column (defaults to "ready")
- **Outputs**: Persisted card with unique ID returned to client
- **Behavior**: Insert card into DB, assign a position at end of target column, broadcast `card:created` event

#### Feature: Edit Card
- **Description**: Update a card's title, assignee, or description
- **Inputs**: Card ID, updated fields (partial)
- **Outputs**: Updated card persisted and broadcast
- **Behavior**: PATCH update, only modify provided fields, broadcast `card:updated` event

#### Feature: Delete Card
- **Description**: Permanently remove a card and all its comments
- **Inputs**: Card ID
- **Outputs**: Card and comments removed from DB, broadcast to all clients
- **Behavior**: Delete card (cascade-deletes comments), broadcast `card:deleted` event

#### Feature: View Board
- **Description**: Fetch all cards grouped by column with nested comments
- **Inputs**: None
- **Outputs**: All cards ordered by column and position, with comments nested
- **Behavior**: Single GET returning full board state on initial load

---

### Capability: Card Organization
Cards can be moved between columns and reordered within a column via drag and drop.

#### Feature: Move Card Between Columns
- **Description**: Change a card's column (e.g. Ready → In Progress)
- **Inputs**: Card ID, target column, new position index
- **Outputs**: Updated card persisted and broadcast
- **Behavior**: Update column and position fields, recompute sibling positions if needed, broadcast `card:moved`

#### Feature: Reorder Card Within Column
- **Description**: Change a card's vertical position within its current column
- **Inputs**: Card ID, new position index
- **Outputs**: Updated positions persisted and broadcast
- **Behavior**: Recompute positions of affected cards using fractional indexing; renormalize when gaps become too small

---

### Capability: Rich Text Editing
Card descriptions use a block-based Notion-like editor.

#### Feature: Block Editor
- **Description**: Edit card descriptions using BlockNote, a Notion-style block editor
- **Inputs**: Existing description JSON (or empty), user edits
- **Outputs**: Updated description as BlockNote JSON
- **Behavior**: Supports headings, paragraphs, bullet lists, numbered lists, code blocks; content saved as JSON string in DB; rendered as read-only blocks in card tile view

---

### Capability: Commenting
Anyone can add comments to a card using a free-text author name.

#### Feature: Add Comment
- **Description**: Post a comment on a card with an author name and text body
- **Inputs**: Card ID, author name (free text), comment text
- **Outputs**: Persisted comment with timestamp, broadcast to all clients
- **Behavior**: Insert comment into DB, return with created_at, broadcast `comment:created`

#### Feature: View Comments
- **Description**: Display all comments on a card in chronological order
- **Inputs**: Card ID (included in board fetch or card detail fetch)
- **Outputs**: Ordered list of comments
- **Behavior**: Fetched as part of the board state payload, nested under each card

---

### Capability: Realtime Sync
All mutations are broadcast to every connected client via WebSocket.

#### Feature: WebSocket Event Broadcasting
- **Description**: Push typed events to all connected clients after every DB write
- **Inputs**: Event type + payload from any API mutation
- **Outputs**: JSON event delivered to all active WebSocket connections
- **Behavior**: After each DB write, server calls `broadcast(event, payload)`; clients handle: `card:created`, `card:updated`, `card:deleted`, `card:moved`, `comment:created`; clients apply events to local state without a full reload

---

### Capability: Persistence
All board data is stored in a SQLite database on the server.

#### Feature: Database Schema and Migrations
- **Description**: Define and initialize the SQLite schema on server startup
- **Inputs**: Migration SQL files
- **Outputs**: DB file with correct schema, ready for queries
- **Behavior**: Migration runner checks current schema version on boot and applies pending migrations

---

## Repository Structure

```
kanban/
├── server/
│   ├── db/
│   │   ├── migrations/        # Numbered SQL migration files (001_init.sql, ...)
│   │   ├── schema.js          # Migration runner — reads DB version, applies pending migrations
│   │   └── queries.js         # All SQL query functions (no SQL outside this file)
│   ├── api/
│   │   ├── cards.js           # Express router: card CRUD routes
│   │   └── comments.js        # Express router: comment routes
│   ├── ws/
│   │   └── broadcaster.js     # WebSocket server init + broadcast(event, payload)
│   └── index.js               # Entry point: Express app, mounts routers, inits DB + WS
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Board/
│   │   │   │   ├── Board.jsx         # Root board — dnd-kit DndContext, renders columns
│   │   │   │   ├── Column.jsx        # Single column (SortableContext droppable)
│   │   │   │   └── CardTile.jsx      # Card summary tile (useSortable draggable)
│   │   │   ├── CardModal/
│   │   │   │   ├── CardModal.jsx     # Card detail overlay — title, assignee, editor, comments
│   │   │   │   ├── BlockEditor.jsx   # BlockNote editor wrapper (edit + read-only mode)
│   │   │   │   └── CommentList.jsx   # Comment list + add-comment form
│   │   │   └── CreateCardForm.jsx    # Inline new-card form at bottom of "Ready" column
│   │   ├── hooks/
│   │   │   ├── useBoard.js           # Board state, mutation helpers (create/update/delete/move)
│   │   │   └── useWebSocket.js       # WS connection lifecycle + event dispatch to useBoard
│   │   ├── api/
│   │   │   └── client.js             # Typed fetch wrappers for all REST endpoints
│   │   └── App.jsx
│   ├── index.html
│   └── vite.config.js                # Dev proxy /api → :3001
├── Dockerfile                        # Multi-stage: build client, serve with Node
├── docker-compose.yml                # App + named volume for SQLite DB
└── package.json                      # Root workspace scripts: dev, build, start
```

## Module Definitions

### Module: `server/db`
- **Maps to capability**: Persistence
- **Responsibility**: SQLite initialization, migrations, and all query functions — no SQL exists outside this module
- **Exports**:
  - `initDb()` — opens DB file, runs pending migrations
  - `getCards()` — all cards with nested comments, ordered by column + position
  - `createCard(data)` — inserts card, returns it
  - `updateCard(id, data)` — partial update, returns updated card
  - `deleteCard(id)` — deletes card and cascade-deletes comments
  - `moveCard(id, column, position)` — updates column + position, renormalizes siblings if needed
  - `createComment(cardId, data)` — inserts comment, returns it

### Module: `server/api`
- **Maps to capability**: Card Management, Commenting
- **Responsibility**: Express route handlers translating HTTP requests to DB queries and broadcasting events
- **Exports**: `cardsRouter`, `commentsRouter` (Express Routers)

### Module: `server/ws`
- **Maps to capability**: Realtime Sync
- **Responsibility**: WebSocket server lifecycle and broadcasting typed events to all connected clients
- **Exports**:
  - `initWs(httpServer)` — attaches `ws` server
  - `broadcast(event, payload)` — sends `{ event, payload }` JSON to all active connections

### Module: `client/src/hooks`
- **Maps to capability**: Card Management, Realtime Sync
- **Responsibility**: Board state management, REST mutations, WebSocket event application
- **Exports**:
  - `useBoard()` — returns `{ columns, createCard, updateCard, deleteCard, moveCard, addComment }`
  - `useWebSocket(onEvent)` — manages WS connection, calls `onEvent` for each incoming message

### Module: `client/src/components/Board`
- **Maps to capability**: Card Organization
- **Responsibility**: Drag-and-drop board layout using dnd-kit; handles cross-column and within-column reordering
- **Exports**: `Board` component

### Module: `client/src/components/CardModal`
- **Maps to capability**: Rich Text Editing, Commenting
- **Responsibility**: Card detail overlay with BlockNote editor and comments thread
- **Exports**: `CardModal` component

---

## Dependency Chain

### Phase 0: Project Foundation
No dependencies — built first.

- **Project scaffold**: Monorepo with `client/` and `server/` workspaces; root `package.json` with `dev` (parallel Vite + nodemon), `build`, and `start` scripts
- **Docker setup**: Multi-stage Dockerfile; `docker-compose.yml` with named SQLite volume; `NODE_ENV` switching
- **DB schema + migrations**: `server/db/migrations/001_init.sql` defining `cards` and `comments` tables; `schema.js` migration runner that runs on server startup

### Phase 1: Data Layer
Depends on: Phase 0 (DB schema)

- **`server/db/queries.js`**: All DB query functions — depends on DB schema
- **`server/api/cards.js` + `comments.js`**: REST routes (`GET /api/cards`, `POST /api/cards`, `PATCH /api/cards/:id`, `DELETE /api/cards/:id`, `POST /api/cards/:id/comments`) — depends on queries.js

### Phase 2: Basic UI
Depends on: Phase 1 (REST API)

- **`client/src/api/client.js`**: Typed fetch wrappers — depends on REST API contract
- **`useBoard` hook**: Board state loaded via REST, mutation helpers — depends on client.js
- **`Board`, `Column`, `CardTile`**: Static board rendering (no drag yet) — depends on useBoard
- **`CardModal`**: Opens on card click; shows title, assignee, description (read-only), comments — depends on useBoard
- **`CreateCardForm`**: Inline form at bottom of "Ready" column — depends on useBoard

### Phase 3: Interactivity
Depends on: Phase 2 (basic UI)

- **Drag-and-drop** (dnd-kit): Wire Board/Column/CardTile with dnd-kit; call `moveCard` on drop — depends on Board components, client.js
- **Block editor** (BlockNote): Integrate into CardModal description field; save on blur/close — depends on CardModal
- **Inline card editing**: Click-to-edit title and assignee on CardTile and in CardModal — depends on CardModal, CardTile

### Phase 4: Realtime
Depends on: Phase 1 (REST API) + Phase 2 (basic UI)

- **`server/ws/broadcaster.js`**: WebSocket server; call `broadcast` from each API mutation route — depends on server/api
- **`useWebSocket` hook**: Connect to WS, receive events, update useBoard state — depends on useBoard

---

## Development Phases

### Phase 0: Project Foundation
**Goal**: Runnable skeleton — server responds, client loads, Docker works

**Entry Criteria**: Empty repository

**Tasks**:
- [ ] Initialize monorepo: root `package.json` with workspaces and `dev`/`build`/`start` scripts
  - Acceptance: `npm run dev` starts server on :3001 and client on :5173
- [ ] Setup Vite + React in `client/`
  - Acceptance: `http://localhost:5173` renders a React root without errors
- [ ] Setup Express in `server/index.js`
  - Acceptance: `GET /health` returns `{ ok: true }`
- [ ] DB schema: `migrations/001_init.sql` + `schema.js` migration runner
  - Acceptance: On server start, `kanban.db` is created with `cards` and `comments` tables
- [ ] Docker: multi-stage Dockerfile + `docker-compose.yml` with SQLite volume
  - Acceptance: `docker compose up` serves the app on :3000 with persistent data

**Exit Criteria**: App runs in both dev mode and Docker; empty board is reachable

---

### Phase 1: Data Layer
**Goal**: Full CRUD API backed by persistent SQLite

**Entry Criteria**: Phase 0 complete

**Tasks**:
- [ ] `server/db/queries.js`: implement `getCards`, `createCard`, `updateCard`, `deleteCard`, `moveCard`, `createComment`
  - Acceptance: Unit tests for each function pass against an in-memory SQLite DB
- [ ] `server/api/cards.js`: `GET /api/cards`, `POST /api/cards`, `PATCH /api/cards/:id`, `DELETE /api/cards/:id`
  - Acceptance: Integration tests cover happy path + 404 for unknown ID + 400 for missing title
- [ ] `server/api/comments.js`: `POST /api/cards/:id/comments`
  - Acceptance: Comment is persisted and returned with created_at

**Exit Criteria**: All CRUD operations work via REST; data survives server restart

---

### Phase 2: Basic UI
**Goal**: Board is visible and fully usable (no drag, no realtime yet)

**Entry Criteria**: Phase 1 complete

**Tasks**:
- [ ] `client/src/api/client.js`: typed fetch wrappers for all endpoints
- [ ] `useBoard` hook: load cards on mount, expose `createCard`, `updateCard`, `deleteCard`, `moveCard`, `addComment`
- [ ] `Board`, `Column`, `CardTile`: render three columns with cards in correct order
  - Acceptance: Cards fetched from API appear in the right column
- [ ] `CardModal`: open on card click; title, assignee (editable), description (read-only), comment list + form
- [ ] `CreateCardForm`: inline at bottom of "Ready" column; submits title + optional assignee
- [ ] Delete card: button in CardModal; card disappears from board

**Exit Criteria**: A team member can create, view, edit, and delete cards in a browser

---

### Phase 3: Interactivity
**Goal**: Drag-and-drop, rich block editor, inline editing

**Entry Criteria**: Phase 2 complete

**Tasks**:
- [ ] Integrate dnd-kit: `DndContext` in Board, `SortableContext` in Column, `useSortable` in CardTile; handle cross-column and within-column drops
  - Acceptance: Drop updates card position and/or column via API; UI reflects new order without full reload; drag ghost visible during drag
- [ ] Integrate BlockNote into CardModal: replaces plain textarea; saves description JSON on modal close
  - Acceptance: User can write headings, bullets, code blocks; description renders correctly in view mode; JSON stored in DB
- [ ] Inline editing: click title or assignee on CardTile to edit in place

**Exit Criteria**: Full interactive board — drag, rich text, comments all functional

---

### Phase 4: Realtime
**Goal**: All connected clients see changes live

**Entry Criteria**: Phase 1 + Phase 3 complete

**Tasks**:
- [ ] `server/ws/broadcaster.js`: attach `ws` to HTTP server, expose `broadcast(event, payload)`
- [ ] Call `broadcast` from each API route after every successful DB write (cards + comments)
- [ ] `useWebSocket` hook: open WS connection, dispatch incoming events to update `useBoard` state
  - Acceptance: Open two browser tabs — action in tab A appears in tab B within 500ms without refresh

**Exit Criteria**: Realtime sync works for all event types across multiple clients

---

## Test Strategy

### Test Pyramid

```
        /\
       /E2E\        ← 10% (Playwright: create card, drag, comment, realtime)
      /------\
     /Integration\  ← 30% (supertest: API routes + DB round-trips)
    /------------\
   /  Unit Tests  \ ← 60% (DB queries, useBoard hook logic)
  /----------------\
```

### Coverage Requirements
- Line coverage: 70% minimum
- Function coverage: 80% minimum

### Critical Test Scenarios

**`server/db/queries.js`**
- Happy path: create → get → update → delete card
- Edge case: `deleteCard` cascades to comments
- Edge case: `moveCard` correctly reorders sibling positions
- Edge case: position renormalization triggers when gap < 0.001

**REST API (supertest)**
- Full CRUD round-trip for cards and comments
- 404 on unknown card ID
- 400 on missing required `title` field

**`useBoard` hook**
- Board loads correctly from GET /api/cards on mount
- Incoming `card:moved` WebSocket event updates column state

**E2E (Playwright)**
- Create a card in "Ready", drag it to "In Progress", verify column
- Open card, add comment, verify it appears in the comment list
- Open two tabs: create card in tab 1, verify it appears in tab 2 (realtime)

---

## System Components

**Server (Node.js + Express)**
- HTTP server serving REST API + static client build in production
- WebSocket server on the same port (HTTP upgrade) for broadcasting
- SQLite via `better-sqlite3` (synchronous; no async complexity for single-writer workloads)

**Client (React + Vite)**
- Single-page application; loads full board state on mount
- dnd-kit for drag-and-drop
- BlockNote for block-based rich editing
- Native WebSocket API for realtime sync

**Database Schema**

```sql
CREATE TABLE cards (
  id          TEXT    PRIMARY KEY,           -- UUID v4
  title       TEXT    NOT NULL,
  assignee    TEXT,                          -- free text, nullable
  column      TEXT    NOT NULL DEFAULT 'ready',  -- 'ready' | 'in_progress' | 'done'
  position    REAL    NOT NULL,              -- fractional index for ordering within column
  description TEXT,                         -- BlockNote JSON string, nullable
  created_at  INTEGER NOT NULL              -- Unix timestamp ms
);

CREATE TABLE comments (
  id          TEXT    PRIMARY KEY,
  card_id     TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  author      TEXT    NOT NULL,             -- free text display name
  content     TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);
```

## Technology Stack

**Runtime**: Node.js 20 LTS

**Backend**:
- `express` 4 — HTTP server and REST routing
- `ws` — WebSocket server (lightweight, no socket.io overhead)
- `better-sqlite3` — synchronous SQLite driver; ideal for single-writer server
- `uuid` — card and comment ID generation

**Frontend**:
- React 18 + Vite 5
- `@dnd-kit/core` + `@dnd-kit/sortable` — drag and drop
- `@blocknote/react` — Notion-like block editor
- No global state library (useBoard + prop drilling is sufficient at this scale)

**Deployment**:
- Docker multi-stage build (Node 20 Alpine: build stage for client, runtime stage for server)
- `docker-compose.yml` with a named volume mounting `data/kanban.db`
- Dev mode: `nodemon` for server HMR + Vite HMR for client; Vite proxies `/api` and `/ws` to :3001

---

## Risks and Mitigations

**Risk**: BlockNote JSON format is opaque — difficult to query or migrate later
- **Impact**: Low — description search is not a current requirement
- **Likelihood**: Low — no near-term need to query description content
- **Mitigation**: Store as raw TEXT in SQLite; a migration can extract plain text if search is added later

**Risk**: Fractional position ordering loses fidelity after many reorders
- **Impact**: Medium — cards could lose stable ordering after many operations
- **Likelihood**: Low for typical team board usage (< 100 cards)
- **Mitigation**: Renormalize positions (reset to 1, 2, 3...) when the gap between adjacent positions drops below 0.001

**Risk**: No authentication means anyone with the URL can delete all cards
- **Impact**: High if URL leaks outside the intended team
- **Likelihood**: Low in a controlled internal server environment
- **Mitigation**: Document that the app must not be exposed to the public internet; a future `BOARD_PASSWORD` env var can enable HTTP Basic Auth with minimal code change

**Risk**: dnd-kit cross-column drag complexity (hit detection, ghost positioning)
- **Impact**: Medium — poor UX if drag targets are ambiguous
- **Likelihood**: Medium — cross-container DnD requires careful setup
- **Mitigation**: Use dnd-kit's `closestCenter` collision detection + `rectIntersection` fallback; test on Chrome and Firefox before shipping

---

## Appendix

### Open Questions
- Should the "Done" column auto-archive cards after N days? (Not in scope for MVP)
- Should comments support rich text, or is plain text sufficient? (Plain text for MVP)
- Should card creation be possible from any column, or only "Ready"? (MVP: "Ready" only; other columns receive cards via drag)
- Should there be a way to search or filter cards by assignee? (Not in scope for MVP)

### Glossary
- **Column**: One of the three fixed board states — `ready`, `in_progress`, `done`
- **Card**: A task item with title, assignee, description, and comments
- **Position**: A floating-point value used to order cards within a column
- **Broadcast**: Sending a WebSocket event to all currently connected clients
- **BlockNote JSON**: The structured JSON format used by BlockNote to represent block-based document content
