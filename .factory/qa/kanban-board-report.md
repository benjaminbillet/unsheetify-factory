# QA Report — Task 23: Implement Position Renormalization System

**Date:** 2026-04-10
**Branch:** `kanban-board/kanban-board-23` (commit `ca179b6`)
**Reviewer role:** QA Engineer (read-only, no fixes applied)

---

## 1. Scope

Task 23 implements automatic position renormalization for the Kanban board server. When fractional gaps between adjacent card positions become too small (below 0.001), positions in the affected column are reset to integers (1, 2, 3, …) while preserving order. The changes are isolated to the server layer.

Primary file under review: `kanban/server/db/queries.js`

---

## 2. Commands Found and Executed

All commands were run from `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-23/kanban`.

No `Makefile` was present. Commands discovered from:
- `kanban/client/package.json` (`scripts.lint`, `scripts.test`, `scripts.build`)
- `kanban/server/package.json` (`scripts.test`)
- Root `package.json` (`scripts.test:setup`, `scripts.test:server`)

| # | Command | Source | Purpose |
|---|---------|--------|---------|
| 1 | `npm run test:setup` | Root `package.json → scripts.test:setup` | Node built-in tests for project structure/config |
| 2 | `npm run test:server` | Root `package.json → scripts.test:server` | Node built-in tests for server API/DB/WebSocket |
| 3 | `npm -w client run lint` | `client/package.json → scripts.lint` | ESLint on `src/` |
| 4 | `npm -w client run test` | `client/package.json → scripts.test` | Vitest client unit tests |
| 5 | `npm run build` | Root `package.json → scripts.build` | Vite production build |

---

## 3. Command Results

### 3.1 Setup/Integration Tests — `npm run test:setup`

**Result: PASS**

```
# tests 76
# suites 13
# pass 76
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 55.985
```

All 76 structural tests pass (package.json shape, Docker config, directory structure, vite proxy settings, etc.).

---

### 3.2 Server Tests — `npm run test:server`

**Result: PASS**

```
# tests 159
# suites 29
# pass 159
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2855.984
```

All 159 server tests pass across all 29 suites. The `renormalizeColumn` suite (7 tests) and the `moveCard` suite (12 tests) both pass in full.

Renormalization log lines were emitted correctly during the test run (captured in TAP output as comment lines):

```
# [renormalize] column="renorm_test" cards=3 duration=0ms
# [renormalize] column="col_fp" cards=3 duration=0ms
# [renormalize] column="stress_col" cards=10 duration=0ms
# [renormalize] column="tc" cards=3 duration=0ms
# [renormalize] column="tc2" cards=3 duration=0ms
# [renormalize] column="tc3" cards=3 duration=0ms
# [renormalize] column="tc4" cards=2 duration=0ms
# [renormalize] column="solo" cards=1 duration=0ms
# [renormalize] column="log_col" cards=2 duration=0ms
# [renormalize] column="perf_col" cards=1000 duration=2ms
```

---

### 3.3 Client Lint — `npm -w client run lint`

**Result: FAIL (environment — not a task-23 defect)**

```
sh: eslint: command not found
Exit code 127
```

The `client/` workspace `node_modules` are not installed (the `kanban-client` workspace is listed as UNMET DEPENDENCY by `npm ls`). The client code was not modified by task 23. This is a pre-existing environment issue.

---

### 3.4 Client Tests — `npm -w client run test`

**Result: FAIL (environment — not a task-23 defect)**

```
sh: vitest: command not found
Exit code 127
```

Same root cause as lint: client `node_modules` are absent. Client code was not modified by task 23.

---

### 3.5 Client Build — `npm run build`

**Result: FAIL (environment — not a task-23 defect)**

```
sh: vite: command not found
Exit code 127
```

Same root cause. Client build was not modified by task 23.

---

## 4. Implementation Review

### 4.1 Gap Detection at 0.001 Threshold

**Requirement:** Detect when position gaps between adjacent cards become smaller than 0.001.

**Status: Correct, with one nuance worth noting.**

The `moveCard` function in `kanban/server/db/queries.js` implements two gap-detection paths:

**Path 1 — Moving to first position (position <= 0):**
```js
const newPos = siblings[0].position / 2;
if (newPos < 0.001) {
  renormalizeColumn(column, [id, ...siblings.map(s => s.id)]);
}
```

**Path 2 — Moving to a middle position:**
```js
const gap = after - before;
if (gap >= 0.001) {
  stmts.updateCardPos.run({ column, position: (before + after) / 2, id });
} else {
  renormalizeColumn(column, newOrder);
}
```

Both paths correctly trigger renormalization when the gap is strictly less than 0.001. The threshold is consistent: path 1 uses `newPos < 0.001`; path 2 uses `!(gap >= 0.001)` which is equivalent to `gap < 0.001`. At the exact boundary value of 0.001, neither path triggers renormalization, which is correct per the requirement ("smaller than 0.001").

**Nuance — "gap" vs. "resulting position":** In path 1, the code checks the resulting *position value* (`newPos < 0.001`), not the gap between two existing siblings. This is technically a different quantity. The gap between the new card and the first sibling would be `siblings[0].position - newPos = siblings[0].position / 2`. The check `newPos < 0.001` is equivalent to checking `siblings[0].position < 0.002`, which correctly identifies cases where the available space at the front of the column has become too compressed. This is a reasonable implementation choice, not a defect.

---

### 4.2 Renormalization Logic (Reset to Integers)

**Requirement:** Renormalization must reset all positions to integers (1, 2, 3, ...) while maintaining order.

**Status: Correct.**

`renormalizeColumn` in `queries.js`:

```js
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

- Positions are set to `i + 1.0` for each card in order: 1.0, 2.0, 3.0, …
- If `orderedIds` is provided (as it is when called from `moveCard`), the caller-supplied order is used directly, allowing the new card to be spliced into the correct position.
- If called standalone, the current DB order (by position) is read and preserved.
- The function returns the count of renormalized cards.
- Empty columns return 0 without error.

---

### 4.3 Database Transaction Atomicity

**Requirement:** Add a database transaction to ensure atomicity.

**Status: Correct, with an observation about nested transactions.**

Both `renormalizeColumn` and `moveCard` wrap their logic in `db.transaction(...)` from `better-sqlite3`:

- `renormalizeColumn` wraps all UPDATE statements in a single transaction (`doRenorm`).
- `moveCard` wraps its entire decision tree — including the call to `renormalizeColumn` — in an outer transaction (`doMove`).

When `moveCard` calls `renormalizeColumn`, the result is a nested transaction. `better-sqlite3` handles nested `.transaction()` calls using SQLite savepoints, which is safe and correct behavior. This was verified empirically — the nested call does not throw and commits correctly.

A subtle consequence: when `renormalizeColumn` is called from inside `moveCard`'s transaction, the `console.log` inside `renormalizeColumn` fires *before* the outer `doMove` transaction has been committed to disk (savepoints are used, not full commits). In practice this is harmless for logging, but log output may precede the actual durable commit by the time the outer transaction finalizes.

After `renormalizeColumn` returns, `moveCard` reads back the card with `stmts.getCardById.get(id)`. Since all operations occur within the same connection and SQLite sees writes from the same connection immediately, this read is correct and returns the updated position.

---

### 4.4 Logging of Renormalization Events

**Requirement:** Log renormalization events for monitoring.

**Status: Correct.**

The log statement inside `renormalizeColumn` is:

```js
console.log(`[renormalize] column="${column}" cards=${ids.length} duration=${duration}ms`);
```

This logs:
- A `[renormalize]` prefix for easy grep-ability.
- The column name (quoted).
- The number of cards renormalized (`cards=N`).
- The duration in milliseconds (`duration=Xms`).

The dedicated log test confirms the format:

```js
it('logs renormalization event with column name, card count, and duration', () => {
  // ...
  assert.ok(line.includes('[renormalize]'));
  assert.ok(line.includes('log_col'));
  assert.ok(line.includes('cards=2'));
  assert.match(line, /duration=\d+ms/);
});
```

This test passes.

**One observation:** The `duration` timer is started at the top of the transaction, *after* the savepoint is established, and stopped just before the `console.log`. This means the duration does not include the time to commit the savepoint/transaction, only the internal work. This is acceptable for a monitoring metric.

---

### 4.5 Additional Code Quality Observations

1. **`moveCard` does not log when it calls `renormalizeColumn`.** The log only appears inside `renormalizeColumn` itself. Since the log includes the column name and count, operators can identify renormalization events from standalone calls and from `moveCard`-triggered calls equally — no additional context is lost.

2. **No logging on the normal (non-renormalization) path.** `moveCard` does not emit any log line for ordinary fractional position updates. This is not a requirement violation but means there is no audit trail for regular card moves.

3. **`renormalizeColumn` prepares a statement inside the transaction on every call.** The line `const stmt = db.prepare('UPDATE cards SET "column" = ?, position = ? WHERE id = ?')` inside `doRenorm` re-prepares the statement each time `renormalizeColumn` is called. For the renormalization case, this is not performance-critical (renormalization is infrequent), but it is inconsistent with the pattern used in `_prepareStatements()` where other statements are prepared once and cached in `stmts`. The performance test (1000 cards in under 1000ms) passes with a measured 2ms, so this is not a practical issue.

4. **`renormalizeColumn` also re-prepares the SELECT statement for ids when `orderedIds` is null.** `db.prepare('SELECT id FROM cards WHERE "column" = ? ORDER BY position')` is called fresh each time. Again not cached in `stmts`. Same observation as above — not a defect, just inconsistent style.

5. **`getSiblings` statement excludes the moved card itself** (`AND id != ?`). This means the sibling list used to determine `before`/`after` positions does not include the card being moved, which is correct — you want the positions of the *other* cards to compute an insertion gap.

6. **Edge case — moving a card within the same column to position 0.** When the moved card is already in the column, it is excluded from `siblings`. So `siblings` contains only the other N-1 cards. Moving to `position <= 0` bisects the first sibling's position. This is correct behavior.

---

## 5. Overall Assessment

| Check | Result | Notes |
|-------|--------|-------|
| `npm run test:setup` (76 tests) | PASS | All structural checks pass |
| `npm run test:server` (159 tests) | PASS | All 29 suites pass, including renormalizeColumn and moveCard |
| `npm -w client run lint` | FAIL | Missing client node_modules — pre-existing environment issue, not a task-23 defect |
| `npm -w client run test` | FAIL | Missing client node_modules — same cause, not a task-23 defect |
| `npm run build` | FAIL | Missing client node_modules — same cause, not a task-23 defect |
| Gap detection at < 0.001 threshold | Correct | Both path 1 and path 2 use strict `< 0.001`; consistent behavior at the boundary |
| Renormalization resets to integers | Correct | `i + 1.0` for each card; 1.0, 2.0, 3.0, … |
| Order maintained after renormalization | Correct | `orderedIds` splice correctly places the moved card |
| Database transaction atomicity | Correct | Both functions use `db.transaction()`; nesting works via SQLite savepoints |
| Renormalization events logged | Correct | `[renormalize] column="…" cards=N duration=Xms` format, verified by test |
| Performance — 1000 cards renormalized | PASS | Measured 2ms, well under the 1000ms threshold |
| Stress test — 50 rapid reorders | PASS | Positions remain strictly increasing after renormalization kicks in |

**The server-side implementation fully satisfies all Task 23 requirements. The three client-side command failures (lint, test, build) are caused by absent client `node_modules` — a pre-existing environment setup issue not introduced by or related to this task. No defects were found in the renormalization implementation.**

**QA Result: PASS**
