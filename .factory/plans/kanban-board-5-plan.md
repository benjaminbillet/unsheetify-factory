# Task 5: Implement Database Query Functions

## Context

The Kanban board app needs a data layer before any REST API or UI work can proceed. Task 4 (migrations) is a dependency but its files do not yet exist, so this plan creates the migration SQL as well. All database operations use `better-sqlite3` (synchronous, no async/await) with named-parameter prepared statements. The server uses ES modules (`"type": "module"`), so all files use `import`/`export` syntax with `.js` extensions.

## Files to Create

| File | Purpose |
|---|---|
| `server/db/migrations/001_init.sql` | Schema definition (idempotent `IF NOT EXISTS`) |
| `server/db/queries.js` | All query functions (~220 lines) |
| `server/test/db.test.mjs` | Unit tests using Node built-in test runner |

**Base path**: `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-5/kanban/`

## Pre-requisite

Run `npm install` in the workspace root before executing any tests:
```
cd /Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-5/kanban && npm install
```

Also update `server/package.json` test script to run both test files:
```json
"test": "node --test test/server.test.mjs test/db.test.mjs"
```

---

## TDD Execution Order

Follow Red → Green → Refactor for each subtask. Write the test file first (all tests), run to confirm failure, then implement.

**Test command** (run from `server/` directory):
```
node --test test/db.test.mjs
```

---

## Subtask 1: Basic CRUD Operations

### 1a. Write tests first (`server/test/db.test.mjs`)

#### Test isolation rule
**Every describe block (except `initDb and closeDb` and `Error Classes`) MUST use `beforeEach`/`afterEach` — NOT `before`/`after` — to call `initDb(':memory:')` and `closeDb()`.** This gives each `it` test a completely fresh in-memory database, preventing state accumulated by earlier tests in the same block from breaking later tests (e.g., extra cards in a column would corrupt position assertions).

#### Test structure skeleton
```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initDb, closeDb, getDb,
  getCards, createCard, updateCard, deleteCard, moveCard, createComment,
  NotFoundError, DatabaseError, ForeignKeyError,
} from '../db/queries.js';
```

#### Describe: `initDb and closeDb`
Each test manages its own DB lifecycle (no beforeEach/afterEach here — these tests are exercising that lifecycle).
- `'initDb with :memory: returns a Database instance'` — call `initDb(':memory:')`, assert returned value is truthy and has a `.prepare` function; then `closeDb()`
- `'initDb creates the cards table'` — `initDb(':memory:')`, then `getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cards'").get()` → assert `result.name === 'cards'`; then `closeDb()`
- `'initDb creates the comments table'` — same for `name='comments'`; then `closeDb()`
- `'initDb enables foreign keys'` — `initDb(':memory:')`, then `getDb().pragma('foreign_keys', { simple: true })` → assert `=== 1`; then `closeDb()`. **Note**: `db.pragma('foreign_keys')` without `{ simple: true }` returns an array object, not a scalar. Always use `{ simple: true }` for scalar assertions.
- `'closeDb closes the database'` — `initDb(':memory:')`, store `const raw = getDb()`, call `closeDb()`, assert `() => raw.prepare('SELECT 1')` throws
- `'initDb can be called again after closeDb'` — init, close, init again → assert no error; then `closeDb()`

#### Describe: `getCards` (beforeEach: `initDb(':memory:')`, afterEach: `closeDb()`)
- `'returns empty array when no cards exist'` — assert `getCards()` deep equals `[]`
- `'returns cards with empty comments array'` — `createCard({ title: 'T' })`, `getCards()` → assert `result[0].comments` deep equals `[]`
- `'returns cards ordered by column then position (alphabetical column order)'` — create 2 cards in `'done'` column (positions will be 1.0 and 2.0) and 1 card in `'ready'` column. Call `getCards()`. Assert: `result[0].column === 'done'`, `result[1].column === 'done'`, `result[2].column === 'ready'`. Assert `result[0].position < result[1].position`. **Rationale**: `ORDER BY "column"` is alphabetical; `'done' < 'ready'` so done-column cards appear first.
- `'nests comments under the correct card'` — create card A and card B; create 2 comments on A and 1 on B via `createComment`; call `getCards()`; find each card by id; assert `cardA.comments.length === 2` and `cardB.comments.length === 1`; assert each comment's `card_id` matches its parent
- `'comments are ordered by created_at within a card'` — create one card, then raw-insert 3 comments out of order with explicit `created_at` values to guarantee ordering is by `created_at`, not insertion order. Exact setup:
  ```javascript
  const card = createCard({ title: 'T' });
  const db = getDb();
  const ins = db.prepare(
    'INSERT INTO comments (id, card_id, author, content, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  ins.run('c3', card.id, 'Author', 'Third',  3000);
  ins.run('c1', card.id, 'Author', 'First',  1000);
  ins.run('c2', card.id, 'Author', 'Second', 2000);
  const result = getCards().find(c => c.id === card.id);
  assert.equal(result.comments[0].created_at, 1000);
  assert.equal(result.comments[1].created_at, 2000);
  assert.equal(result.comments[2].created_at, 3000);
  ```

#### Describe: `createCard` (beforeEach: `initDb(':memory:')`, afterEach: `closeDb()`)
- `'returns card with all required fields'` — `createCard({ title: 'My card' })` → assert result has fields: `id`, `title`, `assignee`, `column`, `position`, `description`, `created_at`
- `'generates a valid UUID v4 for id'` — assert `card.id` matches regex `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`
- `'sets created_at to a recent Unix timestamp in ms'` — record `const t0 = Date.now()`, create card, record `const t1 = Date.now()`; assert `card.created_at >= t0 && card.created_at <= t1`
- `'defaults column to ready'` — `createCard({ title: 'X' })` → assert `card.column === 'ready'`
- `'defaults assignee and description to null'` — assert `card.assignee === null` and `card.description === null`
- `'assigns position 1.0 to the first card in a column'` — `createCard({ title: 'A', column: 'done' })` → assert `card.position === 1.0`
- `'assigns position max+1 to subsequent cards in the same column'` — create 3 cards all in `'done'`; assert positions are `1.0`, `2.0`, `3.0` respectively
- `'positions are independent per column'` — create card in `'ready'` (pos 1.0), then create card in `'done'`; assert the `'done'` card's position is `1.0` (not 2.0)
- `'uses provided column value'` — `createCard({ title: 'X', column: 'in_progress' })` → assert `card.column === 'in_progress'`
- `'stores optional fields when provided'` — `createCard({ title: 'Full', assignee: 'Alice', description: 'Desc' })` → assert both fields stored correctly
- `'card appears in getCards() after creation'` — create card, then `getCards()` → assert `cards.some(c => c.id === card.id)`

#### Describe: `updateCard` (beforeEach: `initDb(':memory:')` then `createCard(...)` storing id, afterEach: `closeDb()`)

```javascript
describe('updateCard', () => {
  let cardId;
  beforeEach(() => {
    initDb(':memory:');
    cardId = createCard({ title: 'Original', column: 'ready' }).id;
  });
  afterEach(() => closeDb());
  // ...tests...
});
```

- `'updates title and returns the updated card'` — capture `const updated = updateCard(cardId, { title: 'New' })`; assert `updated.title === 'New'` and `updated.id === cardId`
- `'partial update does not modify unspecified fields'` — capture `const updated = updateCard(cardId, { title: 'Partial' })`; assert `updated.description === null` and `updated.column === 'ready'`
- `'can update multiple fields at once'` — capture `const updated = updateCard(cardId, { title: 'Multi', assignee: 'Bob', description: 'Desc' })`; assert `updated.title === 'Multi'`, `updated.assignee === 'Bob'`, `updated.description === 'Desc'`
- `'returned card matches state in database'` — call `updateCard`, then `getCards()`, find card by id; assert title matches
- `'throws NotFoundError for a non-existent id'` — `try { updateCard('no-such-id', { title: 'X' }) } catch(e) { assert.ok(e instanceof NotFoundError) }`
- `'error message contains the id'` — catch error from `updateCard('bad-id', {...})` → assert `e.message.includes('bad-id')`
- `'ignores fields not in the allowlist (SQL injection prevention)'` — `updateCard(cardId, { title: 'Safe', malicious: 'DROP TABLE cards' })` → assert success, then `getCards()` → assert table still has the card

#### Describe: `deleteCard` (beforeEach: `initDb(':memory:')` then `createCard(...)`, afterEach: `closeDb()`)

```javascript
describe('deleteCard', () => {
  let cardId;
  beforeEach(() => {
    initDb(':memory:');
    cardId = createCard({ title: 'Delete me' }).id;
  });
  afterEach(() => closeDb());
  // ...tests...
});
```

- `'returns true on successful deletion'` — assert `deleteCard(cardId) === true`
- `'card no longer appears in getCards() after deletion'` — `deleteCard(cardId)`; `getCards()` → assert `cards.every(c => c.id !== cardId)`
- `'throws NotFoundError for a non-existent id'` — try/catch `deleteCard('no-such-id')` → assert `e instanceof NotFoundError`
- `'throws NotFoundError if card was already deleted'` — `deleteCard(cardId)` (first call succeeds); try/catch second `deleteCard(cardId)` → assert `e instanceof NotFoundError`
- `'cascade-deletes associated comments when card is deleted'` — `createComment(cardId, { author: 'A', content: 'B' })`; `createComment(cardId, { author: 'C', content: 'D' })`; `deleteCard(cardId)`; use `getDb().prepare('SELECT * FROM comments WHERE card_id = ?').all(cardId)` → assert result is empty array

### 1b. Implementation: `server/db/migrations/001_init.sql`

```sql
CREATE TABLE IF NOT EXISTS cards (
  id          TEXT    PRIMARY KEY,
  title       TEXT    NOT NULL,
  assignee    TEXT,
  "column"    TEXT    NOT NULL DEFAULT 'ready',
  position    REAL    NOT NULL,
  description TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT    PRIMARY KEY,
  card_id    TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  author     TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cards_column_position ON cards("column", position);
CREATE INDEX IF NOT EXISTS idx_comments_card_id ON comments(card_id);
```

**Note**: Do NOT include `PRAGMA` statements in the SQL file. Pragmas are set programmatically in `initDb()` via `db.pragma()` before `db.exec()` is called. Mixing pragmas into migration SQL causes confusion and can misbehave if `db.exec` processes them in unexpected order.

### 1c. Implementation: `server/db/queries.js` (CRUD part)

```javascript
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Custom Errors ---
export class NotFoundError extends Error {
  constructor(msg) { super(msg); this.name = 'NotFoundError'; }
}
export class DatabaseError extends Error {
  constructor(msg) { super(msg); this.name = 'DatabaseError'; }
}
export class ForeignKeyError extends DatabaseError {
  constructor(msg) { super(msg); this.name = 'ForeignKeyError'; }
}

// --- Module-level singletons ---
let db = null;
let stmts = {};

export function getDb() { return db; }

// --- initDb ---
export function initDb(dbPath = 'data/kanban.db') {
  const resolvedPath = dbPath === ':memory:' ? ':memory:' : resolve(process.cwd(), dbPath);
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  }
  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const sql = readFileSync(resolve(__dirname, 'migrations', '001_init.sql'), 'utf8');
  db.exec(sql);
  _prepareStatements();
  return db;
}

function _prepareStatements() {
  stmts.getAllCards     = db.prepare('SELECT * FROM cards ORDER BY "column", position');
  stmts.getAllComments  = db.prepare('SELECT * FROM comments ORDER BY created_at');
  stmts.insertCard     = db.prepare(
    'INSERT INTO cards (id, title, assignee, "column", position, description, created_at) VALUES (@id, @title, @assignee, @column, @position, @description, @created_at)'
  );
  stmts.getCardById    = db.prepare('SELECT * FROM cards WHERE id = ?');
  stmts.maxPosInCol    = db.prepare('SELECT MAX(position) AS maxPos FROM cards WHERE "column" = ?');
  stmts.deleteCard     = db.prepare('DELETE FROM cards WHERE id = ?');
  stmts.insertComment  = db.prepare(
    'INSERT INTO comments (id, card_id, author, content, created_at) VALUES (@id, @card_id, @author, @content, @created_at)'
  );
  stmts.getCommentById = db.prepare('SELECT * FROM comments WHERE id = ?');
  stmts.getSiblings    = db.prepare(
    'SELECT id, position FROM cards WHERE "column" = ? AND id != ? ORDER BY position'
  );
  stmts.updateCardPos  = db.prepare(
    'UPDATE cards SET "column" = @column, position = @position WHERE id = @id'
  );
}

export function closeDb() {
  if (db) { db.close(); db = null; stmts = {}; }
}

// --- getCards ---
export function getCards() {
  const cards = stmts.getAllCards.all();
  const comments = stmts.getAllComments.all();
  const byCard = {};
  for (const c of comments) {
    (byCard[c.card_id] ??= []).push(c);
  }
  return cards.map(card => ({ ...card, comments: byCard[card.id] ?? [] }));
}

// --- createCard ---
export function createCard(data) {
  const { title, assignee = null, column = 'ready', description = null } = data;
  const id = uuidv4();
  const created_at = Date.now();
  const { maxPos } = stmts.maxPosInCol.get(column);
  const position = maxPos === null ? 1.0 : maxPos + 1.0;
  stmts.insertCard.run({ id, title, assignee, column, position, description, created_at });
  return stmts.getCardById.get(id);
}

// --- updateCard ---
export function updateCard(id, data) {
  const allowed = ['title', 'assignee', 'column', 'description', 'position'];
  const fields = Object.keys(data).filter(k => allowed.includes(k));
  if (fields.length === 0) {
    const card = stmts.getCardById.get(id);
    if (!card) throw new NotFoundError(`Card not found: ${id}`);
    return card;
  }
  const setClause = fields.map(f => `"${f}" = @${f}`).join(', ');
  const result = db.prepare(`UPDATE cards SET ${setClause} WHERE id = @id`).run({ ...data, id });
  if (result.changes === 0) throw new NotFoundError(`Card not found: ${id}`);
  return stmts.getCardById.get(id);
}

// --- deleteCard ---
export function deleteCard(id) {
  const result = stmts.deleteCard.run(id);
  if (result.changes === 0) throw new NotFoundError(`Card not found: ${id}`);
  return true;
}
```

---

## Subtask 2: moveCard with Fractional Indexing

### Function signature clarification

The task specifies `moveCard(id, column, position)`. The `position` parameter here is an **integer 0-based target index** (not a floating-point fractional value). The function computes the fractional position value internally using the sibling list. The parameter is named `position` in the exported API to match the task spec.

### 2a. Write tests first (add to db.test.mjs)

#### Describe: `moveCard` (beforeEach: `initDb(':memory:')`, afterEach: `closeDb()`)

Each test is self-contained (creates its own cards within the test body):

- `'moves card to empty column'` — create A in 'ready'; capture `const result = moveCard(A.id, 'done', 0)`; assert `result.column === 'done'` and `result.position === 1.0`

- `'moves card to first position in populated column'` — create B and C in 'done' (B gets pos 1.0, C gets 2.0); create A in 'ready'; capture `const result = moveCard(A.id, 'done', 0)`; assert `result.id === A.id`, `result.column === 'done'`, and `result.position < B.position` (B.position from the createCard snapshot = 1.0; result.position = 0.5). **Important**: use `result.position`, NOT `A.position` — `A` is the stale createCard snapshot and its `.position` is still the 'ready' column value.

- `'moves card to last position in populated column'` — create B(1.0) and C(2.0) in 'done'; create A in 'ready'; capture `const result = moveCard(A.id, 'done', 2)` (position=2 >= 2 siblings → after last); assert `result.position > C.position` (C.position=2.0; result.position=3.0). Use `result.position`, not `A.position`.

- `'moves card to middle position in column'` — create B(1.0), C(2.0), D(3.0) in 'done'; create A in 'ready'; capture `const result = moveCard(A.id, 'done', 1)` (between B and C); assert `B.position < result.position && result.position < C.position` (B=1.0, result=1.5, C=2.0). Use `result.position`, not `A.position`.

- `'returned card reflects updated column and position'` — create A in 'ready'; `const result = moveCard(A.id, 'done', 0)`; assert `result.id === A.id`, `result.column === 'done'`, `typeof result.position === 'number'`

- `'moves card within same column to later position'` — create A(1.0), B(2.0), C(3.0) all in 'ready'; `moveCard(A.id, 'ready', 1)` → siblings=[B(2.0),C(3.0)], inserts between B and C giving A position 2.5; verify by fetching `getCards().filter(c => c.column === 'ready').sort((a,b) => a.position - b.position)` and asserting `sorted[0].id === B.id`, `sorted[1].id === A.id`, `sorted[2].id === C.id`. Do NOT compare `A.position` directly — `A` is the stale createCard snapshot; use the sorted array IDs instead.

- `'moves card within same column to earlier position'` — create A(1.0), B(2.0), C(3.0) in 'ready'; `moveCard(C.id, 'ready', 0)` → before A; assert order is C, A, B

- `'renormalizes column when position gap falls below 0.001'` — raw-insert two cards with near-identical positions, then move a third card between them and verify renormalization fires. Exact setup:
  ```javascript
  const db = getDb();
  const insertCard = db.prepare(
    'INSERT INTO cards (id, title, "column", position, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  insertCard.run('renorm-1', 'Card One', 'renorm_test', 1.0,    1000);
  insertCard.run('renorm-2', 'Card Two', 'renorm_test', 1.0004, 2000);
  const A = createCard({ title: 'A', column: 'ready' });
  moveCard(A.id, 'renorm_test', 1); // gap 0.0004 < 0.001 → renormalize
  const cards = getCards()
    .filter(c => c.column === 'renorm_test')
    .sort((a, b) => a.position - b.position);
  // Assert all positions are whole numbers (renorm assigns 1.0, 2.0, 3.0)
  for (const c of cards) assert.ok(c.position % 1 === 0, `position ${c.position} is not whole`);
  // Assert relative order preserved: renorm-1 still before renorm-2
  const r1 = cards.find(c => c.id === 'renorm-1');
  const r2 = cards.find(c => c.id === 'renorm-2');
  assert.ok(r1.position < r2.position);
  ```

- `'throws NotFoundError for a non-existent card id'` — `try { moveCard('no-such-id', 'ready', 0) } catch(e) { assert.ok(e instanceof NotFoundError) }`

- `'negative position value treated as first position'` — create B in 'done' (pos 1.0); create A in 'ready'; capture `const result = moveCard(A.id, 'done', -5)`; assert `result.position < B.position` (result.position=0.5, B.position=1.0). Use `result.position`, not `A.position`.

- `'position beyond end treated as last position'` — create B(1.0) and C(2.0) in 'done'; create A in 'ready'; capture `const result = moveCard(A.id, 'done', 999)`; assert `result.position > C.position` (result.position=3.0, C.position=2.0). Use `result.position`, not `A.position`.

### 2b. Implementation: `moveCard` (add to queries.js)

The `position` parameter is the integer 0-based target rank among siblings (cards in the target column excluding the moved card):

```javascript
export function moveCard(id, column, position) {
  const card = stmts.getCardById.get(id);
  if (!card) throw new NotFoundError(`Card not found: ${id}`);

  const doMove = db.transaction(() => {
    const siblings = stmts.getSiblings.all(column, id);
    // siblings: sorted by position, excludes the moved card itself

    if (siblings.length === 0) {
      stmts.updateCardPos.run({ column, position: 1.0, id });
    } else if (position <= 0) {
      stmts.updateCardPos.run({ column, position: siblings[0].position / 2, id });
    } else if (position >= siblings.length) {
      stmts.updateCardPos.run({ column, position: siblings[siblings.length - 1].position + 1.0, id });
    } else {
      const before = siblings[position - 1].position;
      const after  = siblings[position].position;
      const gap    = after - before;

      if (gap >= 0.001) {
        stmts.updateCardPos.run({ column, position: (before + after) / 2, id });
      } else {
        // Renormalize: splice moved card into siblings at the target index, then
        // assign clean integer positions (1.0, 2.0, 3.0, ...) to all cards in column
        const renorm = db.prepare('UPDATE cards SET "column" = ?, position = ? WHERE id = ?');
        const newOrder = [
          ...siblings.slice(0, position),
          { id },
          ...siblings.slice(position),
        ];
        newOrder.forEach((s, i) => renorm.run(column, i + 1.0, s.id));
      }
    }

    return stmts.getCardById.get(id);
  });

  return doMove();
}
```

**Key invariants**:
- `getSiblings` excludes the moved card — same-column and cross-column moves use identical logic
- In the renormalization path, `newOrder` includes all siblings plus the moved card at the target index; the loop updates every card in the column (including the moved card) to a clean integer position
- `db.prepare()` inside the transaction callback is valid in better-sqlite3 (only `.run()` calls are transactional)
- No special case needed for same-column moves; `getSiblings` handles exclusion automatically

---

## Subtask 3: Comment Operations

### 3a. Write tests first (add to db.test.mjs)

#### Describe: `createComment` (beforeEach: `initDb(':memory:')` + `createCard(...)`, afterEach: `closeDb()`)

```javascript
describe('createComment', () => {
  let cardId;
  beforeEach(() => {
    initDb(':memory:');
    cardId = createCard({ title: 'Parent card' }).id;
  });
  afterEach(() => closeDb());
  // ...tests...
});
```

- `'returns comment with all fields'` — `createComment(cardId, { author: 'Alice', content: 'Hello' })` → assert `comment.id`, `comment.card_id === cardId`, `comment.author === 'Alice'`, `comment.content === 'Hello'`, `typeof comment.created_at === 'number'`
- `'generates a valid UUID v4 for comment id'` — assert matches `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`
- `'sets created_at to a recent timestamp'` — record `t0 = Date.now()`, create comment, record `t1 = Date.now()`; assert `comment.created_at >= t0 && comment.created_at <= t1`
- `'comment appears nested under the card in getCards()'` — create comment; `getCards()` → find card by id; assert `card.comments.length === 1` and `card.comments[0].content === 'Hello'`
- `'multiple comments accumulate under the card'` — create 3 comments; `getCards()` → find card → assert `card.comments.length === 3`
- `'throws ForeignKeyError for a non-existent cardId'` — `try { createComment('no-such-card', { author: 'X', content: 'Y' }) } catch(e) { assert.ok(e instanceof ForeignKeyError) }`
- `'ForeignKeyError is also an instance of DatabaseError'` — catch error from non-existent cardId; assert `e instanceof DatabaseError`

### 3b. Implementation: `createComment` (add to queries.js)

```javascript
export function createComment(cardId, data) {
  const { author, content } = data;
  const id = uuidv4();
  const created_at = Date.now();
  try {
    stmts.insertComment.run({ id, card_id: cardId, author, content, created_at });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      throw new ForeignKeyError(`Card not found: ${cardId}`);
    }
    throw new DatabaseError(err.message);
  }
  return stmts.getCommentById.get(id);
}
```

**Note**: The FK constraint only fires if `PRAGMA foreign_keys = ON` is active. `initDb()` sets this before running migrations. The error code `'SQLITE_CONSTRAINT_FOREIGNKEY'` is exposed as `err.code` by better-sqlite3.

---

## Subtask 4: Prepared Statements

All hot-path queries are pre-cached in `_prepareStatements()` called at the end of `initDb()`. The `updateCard` function cannot be pre-prepared because its SET clause is dynamically constructed from `Object.keys(data)`. It calls `db.prepare()` inline on each invocation — this is intentional and safe (better-sqlite3's `prepare` is very fast).

No additional work needed beyond verifying `_prepareStatements()` covers all functions except `updateCard` and the inline renormalization `prepare` inside `moveCard`.

---

## Subtask 5: Error Handling

### Error classes (in queries.js)
```javascript
export class NotFoundError extends Error { ... }          // card not found by id
export class DatabaseError extends Error { ... }           // generic DB failure
export class ForeignKeyError extends DatabaseError { ... } // FK constraint violated
```

### Error handling tests (add to db.test.mjs)

#### Describe: `Error Classes` (no DB needed, no beforeEach/afterEach)
- `'NotFoundError is instanceof Error with correct name and message'` — `const e = new NotFoundError('test msg')`; assert `e instanceof Error`, `e.name === 'NotFoundError'`, `e.message === 'test msg'`
- `'ForeignKeyError is instanceof DatabaseError and Error'` — `const e = new ForeignKeyError('fk')`; assert `e instanceof ForeignKeyError`, `e instanceof DatabaseError`, `e instanceof Error`, `e.name === 'ForeignKeyError'`

### Where errors are thrown

| Function | Condition | Error type |
|---|---|---|
| `updateCard` | `changes === 0` after UPDATE | `NotFoundError` |
| `updateCard` | empty `fields` + card not found | `NotFoundError` |
| `deleteCard` | `changes === 0` after DELETE | `NotFoundError` |
| `moveCard` | `getCardById` returns null | `NotFoundError` |
| `createComment` | `err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY'` | `ForeignKeyError` |
| `createComment` | any other DB error | `DatabaseError` |

---

## Critical Implementation Notes

1. **`column` is a reserved word in SQLite** — quote it as `"column"` in ALL SQL strings in queries.js (SELECT, INSERT, UPDATE, WHERE, ORDER BY, CREATE TABLE, CREATE INDEX). Missing a single quote causes a runtime syntax error.

2. **`db.pragma()` returns arrays by default** — when asserting a scalar value from a pragma call, always use the `{ simple: true }` option: `db.pragma('foreign_keys', { simple: true })` returns `1`, while `db.pragma('foreign_keys')` returns `[{ foreign_keys: 1 }]`.

3. **WAL mode on `:memory:` databases** — `PRAGMA journal_mode = WAL` silently stays as `'memory'` for in-memory databases (SQLite does not support WAL on in-memory DBs). Do not assert the resulting mode in tests. The `initDb` call should not throw.

4. **FK enforcement requires pragma** — `PRAGMA foreign_keys = ON` in `initDb` is mandatory. Without it: (a) `ON DELETE CASCADE` does nothing, (b) inserting a comment with a non-existent `card_id` silently succeeds instead of throwing. All cascade and FK tests depend on this pragma being set.

5. **`assert.throws` + instanceof** — `assert.throws(fn, MyErrorClass)` does NOT check `instanceof` in Node's `assert/strict`. To test for a specific error class, use try/catch: `try { fn() } catch(e) { assert.ok(e instanceof MyClass) }`. Or use `assert.throws(fn, { name: 'ClassName' })` which checks `err.name`.

6. **`getDb()` export** — needed for the cascade-delete test (5.5) to directly query the `comments` table, and for the renormalization test (6.8) to raw-insert cards with specific positions.

7. **Named params vs positional** — use `@name` style with object binding for INSERT/UPDATE statements; use `?` positional for simple lookups (getCardById, deleteCard, etc.). Do not mix styles within one `.prepare()` statement.

8. **`moveCard` `position` parameter semantics** — The exported function is `moveCard(id, column, position)` where `position` is an integer 0-based target index (the slot where the moved card should end up among its siblings after the move). It is NOT a fractional float value; that is computed internally.

9. **Stale card snapshots in tests** — `createCard()` and `moveCard()` return plain row objects. After calling `moveCard(A.id, ...)`, the original `A` variable still holds the pre-move position. Always use `moveCard`'s return value (e.g. `const result = moveCard(...)`) or re-fetch via `getCards()` when asserting the moved card's new position. Only sibling cards (B, C, D) that were NOT moved retain valid stale positions.

---

## Verification

After implementation, from the `server/` directory:

```bash
# Run DB tests
node --test test/db.test.mjs

# Run all server tests
node --test test/server.test.mjs test/db.test.mjs

# Basic smoke test (from server/ directory)
node -e "
import('./db/queries.js').then(({ initDb, getCards, createCard, createComment }) => {
  initDb(':memory:');
  const card = createCard({ title: 'Smoke test' });
  createComment(card.id, { author: 'Tester', content: 'Works!' });
  console.log(JSON.stringify(getCards(), null, 2));
});
"
```

Expected output for smoke test: a JSON array containing one card with one nested comment.
