# Task 4: Create Database Schema and Migration System

## Context

The kanban board backend needs a persistent SQLite data layer. Task 3 planned to install `better-sqlite3` as a dependency but has not been merged to this branch yet. Task 4 must therefore install that dependency itself, create the SQL schema, build a migration runner with version tracking, add performance indexes, and wire the runner into server startup.

**Current state of branch `kanban-board-4`:**
- `server/package.json` exists but has no dependencies and no `"type": "module"`
- `server/db/` exists but is empty (only `.gitkeep`)
- `server/db/migrations/` does NOT exist yet — must be created
- `server/index.js` does NOT exist
- `better-sqlite3` is NOT installed
- No test directory in server yet

**Working directory:** `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-4/kanban/`

---

## Prerequisites

Before the TDD subtasks, perform these setup steps:

1. **Update `server/package.json`** to add `"type": "module"` (required for `.js` files to use ES module `import`/`export` syntax), the `better-sqlite3` dependency, and test/dev scripts. The final `server/package.json` should look like:

   ```json
   {
     "name": "kanban-server",
     "version": "1.0.0",
     "type": "module",
     "main": "index.js",
     "scripts": {
       "test": "node --test test/schema.test.mjs",
       "dev": "node --watch index.js",
       "start": "node index.js"
     },
     "dependencies": {
       "better-sqlite3": "^9.4.3"
     }
   }
   ```

2. **Install dependencies** from the `kanban/` workspace root:
   ```bash
   cd /Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-4/kanban && npm install
   ```

3. **Add `test:db` script** to root `kanban/package.json` scripts:
   ```json
   "test:db": "npm -w server run test"
   ```

4. **Create the `server/db/migrations/` directory** (it does not exist yet):
   ```bash
   mkdir -p /Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-4/kanban/server/db/migrations
   ```

5. **Create `server/test/` directory** (it does not exist yet — it will be created when the test file is written).

---

## Subtask 1 — SQL Schema Files (TDD)

### Red: Write failing tests first

Create `server/test/schema.test.mjs` with **only** the Subtask 1 tests below. Do NOT include the `initDb` import yet — `schema.js` does not exist and a top-level import of a missing module prevents the entire file from loading.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');
const INIT_SQL_PATH = path.join(MIGRATIONS_DIR, '001_init.sql');

test('001_init.sql migration file exists', () => {
  assert.ok(existsSync(INIT_SQL_PATH), '001_init.sql should exist');
});

test('001_init.sql can be executed to create tables', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const sql = readFileSync(INIT_SQL_PATH, 'utf8');
  assert.doesNotThrow(() => db.exec(sql));
  db.close();
});

test('cards table has correct columns', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(INIT_SQL_PATH, 'utf8'));
  const cols = db.pragma('table_info(cards)').map(c => c.name);
  assert.ok(cols.includes('id'));
  assert.ok(cols.includes('title'));
  assert.ok(cols.includes('assignee'));
  assert.ok(cols.includes('column'));
  assert.ok(cols.includes('position'));
  assert.ok(cols.includes('description'));
  assert.ok(cols.includes('created_at'));
  db.close();
});

test('cards column field defaults to "ready"', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(INIT_SQL_PATH, 'utf8'));
  db.prepare('INSERT INTO cards (id, title, position, created_at) VALUES (?,?,?,?)').run('c1', 'Test', 1.0, Date.now());
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get('c1');
  assert.equal(card.column, 'ready');
  db.close();
});

test('comments table has correct columns', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(INIT_SQL_PATH, 'utf8'));
  const cols = db.pragma('table_info(comments)').map(c => c.name);
  assert.ok(cols.includes('id'));
  assert.ok(cols.includes('card_id'));
  assert.ok(cols.includes('author'));
  assert.ok(cols.includes('content'));
  assert.ok(cols.includes('created_at'));
  db.close();
});

test('comments.card_id foreign key cascade deletes work', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(INIT_SQL_PATH, 'utf8'));
  db.prepare('INSERT INTO cards (id, title, position, created_at) VALUES (?,?,?,?)').run('c1', 'Card', 1.0, Date.now());
  db.prepare('INSERT INTO comments (id, card_id, author, content, created_at) VALUES (?,?,?,?,?)').run('cm1', 'c1', 'Alice', 'Hello', Date.now());
  db.prepare('DELETE FROM cards WHERE id = ?').run('c1');
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get('cm1');
  assert.equal(comment, undefined, 'comment should be deleted when its card is deleted');
  db.close();
});
```

Run `npm -w server run test` → all 6 tests **fail** (001_init.sql doesn't exist). ✅ Red confirmed.

### Green: Create implementation

**File:** `server/db/migrations/001_init.sql`

```sql
CREATE TABLE IF NOT EXISTS cards (
  id          TEXT    PRIMARY KEY,
  title       TEXT    NOT NULL,
  assignee    TEXT,
  "column"    TEXT    DEFAULT 'ready',
  position    REAL    NOT NULL,
  description TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT    PRIMARY KEY,
  card_id    TEXT    REFERENCES cards(id) ON DELETE CASCADE,
  author     TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
```

> **Note:** `column` is a reserved word in SQLite — it must be quoted as `"column"` in DDL. In application queries, always reference this column as `"column"` as well.

Run `npm -w server run test` → all 6 Subtask 1 tests **pass**. ✅ Green confirmed.

---

## Subtask 2 — Migration Runner (TDD)

### Red: Add migration runner tests

**Append** the following to `server/test/schema.test.mjs` (add new imports at the top of the file merged with existing imports, add helper function and tests at the bottom):

**New imports to add at the top** (merge into the existing import block):
```js
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import { initDb } from '../db/schema.js';
```

**New helper and tests to append at the bottom of the file:**
```js
// Helper: create an isolated temp db path for each test
function tempDbPath() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'kanban-test-'));
  return path.join(dir, 'test.db');
}

test('initDb returns a database instance', () => {
  const db = initDb(tempDbPath());
  assert.ok(db, 'should return db');
  db.close();
});

test('initDb creates schema_version table', () => {
  const db = initDb(tempDbPath());
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'").get();
  assert.ok(row, 'schema_version table should exist');
  db.close();
});

test('initDb creates cards table', () => {
  const db = initDb(tempDbPath());
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cards'").get();
  assert.ok(row, 'cards table should exist');
  db.close();
});

test('initDb creates comments table', () => {
  const db = initDb(tempDbPath());
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='comments'").get();
  assert.ok(row, 'comments table should exist');
  db.close();
});

test('initDb records applied migration in schema_version', () => {
  const db = initDb(tempDbPath());
  const row = db.prepare('SELECT version FROM schema_version WHERE version = ?').get('001_init');
  assert.ok(row, '001_init should be recorded in schema_version');
  db.close();
});

test('initDb does not re-apply migrations on second call', () => {
  const dbPath = tempDbPath();

  // First run: apply migrations
  const db1 = initDb(dbPath);
  db1.close();

  // Insert sentinel data to verify it survives second run
  const db2 = new Database(dbPath);
  db2.prepare('INSERT INTO cards (id, title, position, created_at) VALUES (?,?,?,?)').run('sentinel', 'S', 1.0, 1);
  db2.close();

  // Second run: should NOT wipe tables or re-apply migrations
  const db3 = initDb(dbPath);
  const card = db3.prepare('SELECT * FROM cards WHERE id = ?').get('sentinel');
  assert.ok(card, 'existing data should survive second migration run');

  // schema_version should still have exactly 1 row (not duplicated)
  const versions = db3.prepare('SELECT * FROM schema_version').all();
  assert.equal(versions.length, 1, 'migration should be recorded exactly once');
  db3.close();
});
```

Run `npm -w server run test` → **all 12 tests fail**. Adding the top-level `import { initDb }` before `schema.js` exists causes the entire test file to fail at load time — Node cannot reach any test, including the 6 Subtask 1 tests that were passing before. This is the expected red state. ✅ Red confirmed.

### Green: Create migration runner

**File:** `server/db/schema.js`

```js
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export function initDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Ensure schema_version tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    TEXT    PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  // Find all migration files in sorted order
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  // Get already-applied versions
  const applied = new Set(
    db.prepare('SELECT version FROM schema_version').all().map(r => r.version)
  );

  // Apply each pending migration inside an atomic transaction
  const applyMigration = db.transaction((version, sql) => {
    db.exec(sql);
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(version, Date.now());
  });

  for (const file of files) {
    const version = file.replace('.sql', '');
    if (!applied.has(version)) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      applyMigration(version, sql);
    }
  }

  return db;
}
```

Run `npm -w server run test` → all 12 tests (6 + 6) **pass**. ✅ Green confirmed.

---

## Subtask 3 — Indexes and Integration Testing (TDD)

### Red: Add index tests

**Append** the following tests to the bottom of `server/test/schema.test.mjs`:

```js
test('idx_comments_card_id index exists after migration', () => {
  const db = initDb(tempDbPath());
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_comments_card_id'").get();
  assert.ok(idx, 'idx_comments_card_id should exist');
  db.close();
});

test('idx_cards_column index exists after migration', () => {
  const db = initDb(tempDbPath());
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_cards_column'").get();
  assert.ok(idx, 'idx_cards_column should exist');
  db.close();
});

test('initDb creates the physical .db file on disk', () => {
  const dbPath = tempDbPath();
  assert.ok(!existsSync(dbPath), 'db file should not exist before initDb');
  const db = initDb(dbPath);
  db.close();
  assert.ok(existsSync(dbPath), 'db file should exist after initDb');
});
```

Run `npm -w server run test` → the 2 index tests **fail** (no CREATE INDEX in SQL yet); the physical file test passes (initDb already creates a file). ✅ Red confirmed.

### Green: Add indexes to migration SQL

**Append** the following two statements to `server/db/migrations/001_init.sql`:

```sql
CREATE INDEX IF NOT EXISTS idx_comments_card_id ON comments(card_id);
CREATE INDEX IF NOT EXISTS idx_cards_column     ON cards("column");
```

Run `npm -w server run test` → all 15 tests **pass**. ✅ Green confirmed.

### Server Startup Integration

Create `server/index.js`. Since `express` and `cors` are NOT yet installed (those belong to Task 3), this file uses only Node built-ins and calls `initDb()` at module load time. Task 3 will add Express on top of this file.

**File:** `server/index.js`

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb } from './db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'kanban.db');

// Run migrations on startup — exported so API route modules can use the db instance
export const db = initDb(DB_PATH);

// Task 3 will add the Express HTTP server setup here
```

This ensures migrations run automatically whenever `server/index.js` is imported or executed directly (`node index.js` or `node --watch index.js`).

---

## Files to Create / Modify

| Action | Path | Notes |
|--------|------|-------|
| **Modify** | `server/package.json` | Add `"type": "module"`, `better-sqlite3` dep, test/dev/start scripts |
| **Modify** | `kanban/package.json` | Add `"test:db": "npm -w server run test"` to scripts |
| **Create dir** | `server/db/migrations/` | Does not exist yet — must be created before writing SQL file |
| **Create** | `server/db/migrations/001_init.sql` | Schema DDL + indexes (built incrementally) |
| **Create** | `server/db/schema.js` | Migration runner, exports `initDb(dbPath)` |
| **Create** | `server/test/schema.test.mjs` | Test file (built incrementally across subtasks) |
| **Create** | `server/index.js` | Calls `initDb()` at startup, exports `db` |

---

## Critical Implementation Notes

- **`"type": "module"` is required** in `server/package.json` so that `.js` files (including `schema.js`) can use ES module `import`/`export` syntax
- **SQLite keyword escaping:** `column` is a reserved word — always quote it as `"column"` in all SQL DDL and DML
- **Foreign keys must be enabled per-connection:** `db.pragma('foreign_keys = ON')` is not persisted in SQLite; it must be called every time a connection is opened
- **WAL mode** is persisted in the database file after first set, but setting it again on open is harmless
- **Test isolation:** All tests use `new Database(':memory:')` or temp file paths via `tempDbPath()` — never touch `kanban.db`
- **Migration version key:** Strip `.sql` suffix from filename → `001_init.sql` → stored version is `001_init`
- **Transactional migrations:** Each migration is applied inside `db.transaction()` — if the SQL or the INSERT into `schema_version` fails, the transaction rolls back atomically
- **`IF NOT EXISTS` guards:** All `CREATE TABLE` and `CREATE INDEX` statements use `IF NOT EXISTS` for idempotency
- **Do NOT install express or cors in this task** — those are Task 3's responsibility

---

## Verification

```bash
# From the kanban/ root directory:

# 1. Install dependencies
npm install

# 2. Run all 15 database tests
npm run test:db

# 3. Verify migration creates a real database file with correct schema
cd /Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-4/kanban/server
node --input-type=module <<'EOF'
import { initDb } from './db/schema.js';
const db = initDb('./kanban-verify.db');
console.log('Tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
console.log('Indexes:', db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => r.name));
console.log('Versions:', db.prepare('SELECT * FROM schema_version').all());
db.close();
EOF

# 4. Verify idempotency — run initDb twice, confirm only 1 version recorded
node --input-type=module <<'EOF'
import { initDb } from './db/schema.js';
const db1 = initDb('./kanban-verify.db');
db1.close();
const db2 = initDb('./kanban-verify.db');
const rows = db2.prepare('SELECT * FROM schema_version').all();
console.log('Migrations recorded (should be 1):', rows.length);
db2.close();
EOF
```

Expected outcomes:
- All 15 `node --test` tests pass green
- Tables listed: `schema_version`, `cards`, `comments`
- Indexes listed: `idx_comments_card_id`, `idx_cards_column`
- `schema_version` has exactly 1 row: `{ version: '001_init', applied_at: <timestamp> }`
- Second run of `initDb` still shows exactly 1 row in `schema_version`
