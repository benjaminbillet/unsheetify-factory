# Task 23: Position Renormalization System

## Context

The Kanban board uses a fractional positioning scheme for card ordering (1.0, 1.5, 1.75…). Repeated insertions between two close cards compress positions until gaps become too small to meaningfully split. The `moveCard` function in `queries.js` already handles gap detection and inline renormalization **for the middle-position case** (gap < 0.001). However:

1. The **first-position edge case** (`position <= 0`) is unhandled — repeated front-insertions can compress `siblings[0].position` below 0.001 without triggering renormalization.
2. The renormalization logic is **inlined** inside `moveCard`, not an extracted/testable/exported function (`renormalizeColumn`).
3. There is **no logging** of renormalization events, and no performance tests.

This task completes all three gaps following strict TDD (Red → Green → Refactor).

---

## Critical Files

| File | Role |
|---|---|
| `kanban/server/db/queries.js` | All DB logic; `moveCard` to be enhanced; `renormalizeColumn` to be extracted and exported |
| `kanban/server/test/db.test.mjs` | All server-side DB unit tests; new tests added here |

---

## Subtask 1 — Gap Detection for First-Position Case

### What already exists
- Middle-position gap check: `if (gap >= 0.001) { midpoint } else { inline renorm }`
- Existing test at line 380–396 covers this path.

### What is missing
The `position <= 0` branch in `moveCard` (line 122) has no gap check. It always computes `siblings[0].position / 2` and applies it — even when that result is < 0.001.

### Tests to write first (add inside `describe('moveCard')` in `db.test.mjs`)

**Red test A — first-position gap triggers renormalization:**
```js
it('renormalizes when moving to first position creates a gap below 0.001', () => {
  const db = getDb();
  const ins = db.prepare(
    'INSERT INTO cards (id, title, "column", position, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  ins.run('fp-1', 'First', 'col_fp', 0.0016, 1000);
  ins.run('fp-2', 'Second', 'col_fp', 1.0, 2000);
  const A = createCard({ title: 'A', column: 'ready' });

  moveCard(A.id, 'col_fp', 0); // move to first position

  const cards = getCards()
    .filter(c => c.column === 'col_fp')
    .sort((a, b) => a.position - b.position);

  for (const c of cards)
    assert.ok(c.position % 1 === 0, `position ${c.position} is not whole`);
  assert.equal(cards[0].id, A.id);   // A is now first
  assert.equal(cards[1].id, 'fp-1');
  assert.equal(cards[2].id, 'fp-2');
});
```

**Red test B — first-position move does NOT renormalize when gap is sufficient:**
```js
it('does not renormalize when moving to first position with sufficient gap', () => {
  const B = createCard({ title: 'B', column: 'done' }); // position 1.0
  const A = createCard({ title: 'A', column: 'ready' });
  const result = moveCard(A.id, 'done', 0);
  // 1.0 / 2 = 0.5, gap = 0.5 >= 0.001 → no renorm, position should be fractional
  assert.ok(result.position < B.position);
  assert.ok(result.position % 1 !== 0);
});
```

### Implementation (in `queries.js`, `moveCard`, the `position <= 0` branch)

Replace:
```js
} else if (position <= 0) {
  stmts.updateCardPos.run({ column, position: siblings[0].position / 2, id });
```
With:
```js
} else if (position <= 0) {
  const newPos = siblings[0].position / 2;
  if (newPos < 0.001) {
    renormalizeColumn(column, [id, ...siblings.map(s => s.id)]);
  } else {
    stmts.updateCardPos.run({ column, position: newPos, id });
  }
```

> **Threshold rationale:** `newPos < 0.001` means the gap between the new card and the original first card (`newPos`) would be less than 0.001, matching the middle-case threshold.

---

## Subtask 2 — Extract `renormalizeColumn` as Exported Function

### Tests to write first (new `describe('renormalizeColumn')` block in `db.test.mjs`)

**Import**: update the import at line 2–7 of `db.test.mjs` to add `renormalizeColumn`:
```js
import {
  initDb, closeDb, getDb,
  getCards, createCard, updateCard, deleteCard, moveCard, createComment,
  renormalizeColumn,
  NotFoundError, DatabaseError, ForeignKeyError,
} from '../db/queries.js';
```

**Location**: add the entire `describe('renormalizeColumn', ...)` block **after** the closing of `describe('moveCard', ...)` and **before** `describe('createComment', ...)`.

The block must include its own `beforeEach`/`afterEach` for database lifecycle:

```js
describe('renormalizeColumn', () => {
  beforeEach(() => initDb(':memory:'));
  afterEach(() => closeDb());
```

Full test cases inside that describe block:

```js
it('assigns integer positions 1,2,3... to all cards in column', () => {
  const db = getDb();
  const ins = db.prepare(
    'INSERT INTO cards (id, title, "column", position, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  ins.run('a', 'A', 'tc', 1.25, 1000);
  ins.run('b', 'B', 'tc', 1.5,  2000);
  ins.run('c', 'C', 'tc', 1.75, 3000);

  renormalizeColumn('tc');

  const cards = getCards().filter(c => c.column === 'tc').sort((a,b) => a.position - b.position);
  assert.equal(cards[0].position, 1.0);
  assert.equal(cards[1].position, 2.0);
  assert.equal(cards[2].position, 3.0);
});

it('preserves original card order when renormalizing', () => {
  const db = getDb();
  const ins = db.prepare(
    'INSERT INTO cards (id, title, "column", position, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  ins.run('x', 'X', 'tc2', 0.0004, 1000);
  ins.run('y', 'Y', 'tc2', 0.0008, 2000);
  ins.run('z', 'Z', 'tc2', 0.0012, 3000);

  renormalizeColumn('tc2');

  const cards = getCards().filter(c => c.column === 'tc2').sort((a,b) => a.position - b.position);
  assert.equal(cards[0].id, 'x');
  assert.equal(cards[1].id, 'y');
  assert.equal(cards[2].id, 'z');
});

it('accepts explicit orderedIds array to override current DB order', () => {
  const db = getDb();
  const ins = db.prepare(
    'INSERT INTO cards (id, title, "column", position, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  ins.run('p', 'P', 'tc3', 1.0, 1000);
  ins.run('q', 'Q', 'tc3', 2.0, 2000);
  ins.run('r', 'R', 'tc3', 3.0, 3000);

  renormalizeColumn('tc3', ['r', 'p', 'q']); // reverse first two

  const cards = getCards().filter(c => c.column === 'tc3').sort((a,b) => a.position - b.position);
  assert.equal(cards[0].id, 'r');
  assert.equal(cards[1].id, 'p');
  assert.equal(cards[2].id, 'q');
});

it('returns the count of cards renormalized', () => {
  createCard({ title: 'A', column: 'tc4' });
  createCard({ title: 'B', column: 'tc4' });
  const count = renormalizeColumn('tc4');
  assert.equal(count, 2);
});

it('handles an empty column without error', () => {
  assert.doesNotThrow(() => renormalizeColumn('nonexistent_col'));
  assert.equal(renormalizeColumn('nonexistent_col'), 0);
});

it('handles a single-card column', () => {
  const c = createCard({ title: 'Solo', column: 'solo' });
  renormalizeColumn('solo');
  const cards = getCards().filter(c => c.column === 'solo');
  assert.equal(cards[0].position, 1.0);
});
}); // end describe('renormalizeColumn')
```

> All six tests above live inside `describe('renormalizeColumn', () => { beforeEach(() => initDb(':memory:')); afterEach(() => closeDb()); ... })`. The Subtask 3 logging and performance tests are also added **inside this same describe block** (see below).

### Implementation (new exported function in `queries.js`)

Add after `deleteCard` (before `moveCard`):

```js
// --- renormalizeColumn ---
export function renormalizeColumn(column, orderedIds = null) {
  const doRenorm = db.transaction(() => {
    const startTime = Date.now();
    const ids = orderedIds ??
      db.prepare('SELECT id FROM cards WHERE "column" = ? ORDER BY position')
        .all(column)
        .map(c => c.id);
    if (ids.length === 0) return 0;
    const stmt = db.prepare('UPDATE cards SET "column" = ?, position = ? WHERE id = ?');
    ids.forEach((cardId, i) => stmt.run(column, i + 1.0, cardId));
    const duration = Date.now() - startTime;
    console.log(`[renormalize] column="${column}" cards=${ids.length} duration=${duration}ms`);
    return ids.length;
  });
  return doRenorm();
}
```

Then refactor `moveCard`'s middle-case inline renormalization to use this function:

Replace the `else` block (lines 133–141):
```js
} else {
  // Renormalize: splice moved card into siblings at the target index ...
  const renorm = db.prepare('UPDATE cards SET "column" = ?, position = ? WHERE id = ?');
  const newOrder = [
    ...siblings.slice(0, position),
    { id },
    ...siblings.slice(position),
  ];
  newOrder.forEach((s, i) => renorm.run(column, i + 1.0, s.id));
}
```
With:
```js
} else {
  const newOrder = [
    ...siblings.slice(0, position).map(s => s.id),
    id,
    ...siblings.slice(position).map(s => s.id),
  ];
  renormalizeColumn(column, newOrder);
}
```

> **Note on nested transactions:** `better-sqlite3` automatically uses SQLite savepoints when `.transaction()` is nested inside another `.transaction()`, so calling `renormalizeColumn` from inside `moveCard`'s `db.transaction()` is safe.

---

## Subtask 3 — Logging and Performance Tests

### Tests to write first

**Logging test** — add inside the `describe('renormalizeColumn')` block (before its closing `}`), alongside the Subtask 2 tests:
```js
it('logs renormalization event with column name, card count, and duration', () => {
  const logs = [];
  const origLog = console.log;
  console.log = (...args) => { logs.push(args.join(' ')); origLog(...args); };
  try {
    createCard({ title: 'X', column: 'log_col' });
    createCard({ title: 'Y', column: 'log_col' });
    renormalizeColumn('log_col');
  } finally {
    console.log = origLog;
  }
  const line = logs.find(m => m.includes('[renormalize]'));
  assert.ok(line, 'Expected a [renormalize] log line');
  assert.ok(line.includes('log_col'), 'Expected column name in log');
  assert.ok(line.includes('cards=2'), 'Expected card count in log');
  assert.match(line, /duration=\d+ms/);
});
```

**Performance test** — also inside `describe('renormalizeColumn')`:
```js
it('renormalizes 1000 cards in under 1000ms', () => {
  const db = getDb();
  const ins = db.prepare(
    'INSERT INTO cards (id, title, "column", position, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  for (let i = 0; i < 1000; i++) {
    ins.run(`perf-${i}`, `Card ${i}`, 'perf_col', i * 0.0001, i);
  }
  const start = Date.now();
  const count = renormalizeColumn('perf_col');
  const elapsed = Date.now() - start;
  assert.equal(count, 1000);
  assert.ok(elapsed < 1000, `Renormalization of 1000 cards took ${elapsed}ms, expected < 1000ms`);
});
```

**Stability/stress test** (add to `describe('moveCard')` block):
```js
it('maintains stable ordered positions after 50 rapid reorder operations', () => {
  for (let i = 0; i < 10; i++) {
    createCard({ title: `Stress ${i}`, column: 'stress_col' });
  }
  for (let i = 0; i < 50; i++) {
    const ordered = getCards()
      .filter(c => c.column === 'stress_col')
      .sort((a, b) => a.position - b.position);
    moveCard(ordered[0].id, 'stress_col', 1); // always move first to second slot
  }
  const final = getCards()
    .filter(c => c.column === 'stress_col')
    .sort((a, b) => a.position - b.position);
  assert.equal(final.length, 10);
  for (let i = 1; i < final.length; i++) {
    assert.ok(
      final[i].position > final[i - 1].position,
      `positions out of order at index ${i}`
    );
  }
});
```

### Implementation
The logging is already included in the `renormalizeColumn` implementation above (`console.log`). No additional code changes needed for Subtask 3 beyond writing the tests.

---

## Execution Order (TDD Red→Green→Refactor)

1. **Add `renormalizeColumn` import** to test file's import statement.
2. **Write Subtask 2 tests** → run → confirm they fail (RED).
3. **Implement `renormalizeColumn`** in `queries.js` → run tests → GREEN.
4. **Refactor `moveCard` middle case** to call `renormalizeColumn` → run ALL tests → still GREEN.
5. **Write Subtask 1 tests** → run → confirm first-position tests fail (RED).
6. **Add first-position gap check** in `moveCard` (calling `renormalizeColumn`) → run → GREEN.
7. **Write Subtask 3 tests** (logging, performance, stress) → run → confirm they fail (RED).
8. *(Logging already wired in step 3)* → run → GREEN.
9. **Verify stress/performance tests pass**.

---

## Verification

```bash
# Run DB tests only (fast)
cd /Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-23/kanban/server
node --test test/db.test.mjs

# Run full server test suite
node --test test/server.test.mjs test/db.test.mjs test/comments.test.mjs test/ws.test.mjs test/cards.test.mjs
```

All existing tests must continue to pass. New tests cover:
- First-position gap detection (renorm triggered + not triggered)
- `renormalizeColumn` standalone: correct positions, order preservation, explicit ordering, return value, empty column, single card
- Logging output format
- Performance: 1000 cards < 1000ms
- Stability: 50 rapid reorders preserve correct order
