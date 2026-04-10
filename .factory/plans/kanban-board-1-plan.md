# Task 1: Initialize Monorepo Structure and Workspace Configuration

## Context

This is the foundational task for a Kanban board application. The workspace at
`/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-1` is completely empty
(no application code, no package.json files). We need to scaffold the full monorepo
structure under a `kanban/` subdirectory, following the PRD at
`.factory/prds/kanban-board.md`.

**Tech stack** (from PRD):
- Node.js 20 LTS runtime
- Server: Express 4, ws, better-sqlite3, uuid (populated in later tasks)
- Client: React 18 + Vite 5, dnd-kit, BlockNote (populated in later tasks)
- Server tests: Jest + supertest
- Client tests: Vitest (natural Vite companion)
- E2E: Playwright

**TDD Note**: Because this is a structural/configuration task, tests validate the
filesystem and JSON structure rather than application logic. We use Node.js 20's
built-in `node:test` module — no test framework install needed for the validation phase.

---

## Final Directory Target

```
kanban/
├── package.json          ← root workspace (private, workspaces: [client, server])
├── test/
│   └── setup.test.mjs    ← structural validation tests (written FIRST)
├── client/
│   ├── package.json      ← kanban-client workspace
│   └── src/
│       └── .gitkeep
└── server/
    ├── package.json      ← kanban-server workspace
    ├── db/
    │   └── .gitkeep
    ├── api/
    │   └── .gitkeep
    └── ws/
        └── .gitkeep
```

---

## Phase 0 — Bootstrap: Write All Tests First (Red Phase)

Before creating any implementation files, create the test file. Running it at this
point must fail for every test case.

### File: `kanban/test/setup.test.mjs`

Uses only Node.js 20 built-ins (`node:test`, `node:assert`, `node:fs`, `node:path`).

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');  // kanban/ root

function readPkg(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf-8'));
}

// ── Subtask 1: Root package.json ─────────────────────────────────────────────
describe('Root package.json', () => {
  it('file exists', () => assert.ok(existsSync(resolve(ROOT, 'package.json'))));
  it('has private: true',       () => assert.equal(readPkg('package.json').private, true));
  it('has name "kanban-app"',   () => assert.equal(readPkg('package.json').name, 'kanban-app'));
  it('has version "1.0.0"',     () => assert.equal(readPkg('package.json').version, '1.0.0'));
  it('workspaces contains "client"', () => assert.ok(readPkg('package.json').workspaces?.includes('client')));
  it('workspaces contains "server"', () => assert.ok(readPkg('package.json').workspaces?.includes('server')));
});

// ── Subtask 2: npm scripts & concurrently ────────────────────────────────────
describe('Root npm scripts', () => {
  it('has scripts.dev', () => assert.ok(readPkg('package.json').scripts?.dev));
  it('scripts.dev uses concurrently', () => assert.match(readPkg('package.json').scripts.dev, /concurrently/));
  it('scripts.dev references client dev', () => assert.match(readPkg('package.json').scripts.dev, /client/));
  it('scripts.dev references server dev', () => assert.match(readPkg('package.json').scripts.dev, /server/));
  it('has scripts.build', () => assert.ok(readPkg('package.json').scripts?.build));
  it('has scripts.start', () => assert.ok(readPkg('package.json').scripts?.start));
  it('devDependencies includes concurrently', () =>
    assert.ok(readPkg('package.json').devDependencies?.concurrently));
});

// ── Subtask 3: Directory structure ───────────────────────────────────────────
describe('Directory structure', () => {
  const dirs = [
    'client',
    'client/src',
    'server',
    'server/db',
    'server/api',
    'server/ws',
  ];
  for (const dir of dirs) {
    it(`directory exists: ${dir}`, () =>
      assert.ok(existsSync(resolve(ROOT, dir)), `Missing: kanban/${dir}/`));
  }
});

// ── Subtask 4: Workspace package.json files ──────────────────────────────────
describe('Client package.json', () => {
  it('file exists', () => assert.ok(existsSync(resolve(ROOT, 'client/package.json'))));
  it('name is "kanban-client"', () => assert.equal(readPkg('client/package.json').name, 'kanban-client'));
  it('has scripts.dev',     () => assert.ok(readPkg('client/package.json').scripts?.dev));
  it('has scripts.build',   () => assert.ok(readPkg('client/package.json').scripts?.build));
  it('has scripts.preview', () => assert.ok(readPkg('client/package.json').scripts?.preview));
});

describe('Server package.json', () => {
  it('file exists', () => assert.ok(existsSync(resolve(ROOT, 'server/package.json'))));
  it('name is "kanban-server"', () => assert.equal(readPkg('server/package.json').name, 'kanban-server'));
  it('has scripts.dev',   () => assert.ok(readPkg('server/package.json').scripts?.dev));
  it('has scripts.start', () => assert.ok(readPkg('server/package.json').scripts?.start));
});
```

**How to run the tests** (works without installing anything because Node 20 ships `node:test`):
```bash
cd kanban-board-1
node --test kanban/test/setup.test.mjs
```

Expected output at this point: **all tests fail** (files/dirs don't exist).

---

## Subtask 1 — Root package.json (Green Phase)

### File to create: `kanban/package.json`

```json
{
  "name": "kanban-app",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["client", "server"],
  "scripts": {
    "dev": "concurrently -n server,client -c blue,green \"npm -w server run dev\" \"npm -w client run dev\"",
    "build": "npm -w client run build",
    "start": "npm -w server run start",
    "test:setup": "node --test test/setup.test.mjs"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

**Key decisions:**
- `private: true` prevents accidental publish of the root package
- `workspaces: ["client", "server"]` (relative to kanban/) enables `npm -w` targeting
- `concurrently` version ^8.2.2 (stable, widely used, supports `-n`/`-c` flags)
- Scripts use `npm -w <workspace> run <script>` pattern (standard npm workspaces)
- `test:setup` script makes the structural test runnable via npm

**After writing this file**, run tests again:
- ✅ Subtask 1 tests pass
- ✅ Subtask 2 tests pass (all checks are JSON reads; they verify field presence, not runtime install)
- ❌ Subtask 3 tests still fail (no directories)
- ❌ Subtask 4 tests still fail (no workspace package.json files)

---

## Subtask 2 — Install concurrently (deferred to end)

The JSON fields (`scripts.dev`, `devDependencies.concurrently`) are written as part of
Subtask 1 (`kanban/package.json`), so all Subtask 2 tests are green as soon as that
file is created.

**`npm install` must NOT be run until Subtasks 3 and 4 are complete.** npm workspaces
resolves all workspace packages during install — if `kanban/client/package.json` or
`kanban/server/package.json` don't exist yet, npm fails with:
```
npm error Missing local dependency: client
```

The actual install command is run as the very last step after all files are in place.
See **Final Verification** below.

---

## Subtask 3 — Directory Structure (Green Phase)

Create all required directories. Use `.gitkeep` files to make empty directories
trackable by git.

### Files to create:
- `kanban/client/src/.gitkeep` (empty file)
- `kanban/server/db/.gitkeep` (empty file)
- `kanban/server/api/.gitkeep` (empty file)
- `kanban/server/ws/.gitkeep` (empty file)

Creating these files implicitly creates their parent directories.

**After creating .gitkeep files**, run tests:
- ✅ All Subtask 3 directory tests pass

---

## Subtask 4 — Workspace package.json Files (Green Phase)

### File: `kanban/client/package.json`

```json
{
  "name": "kanban-client",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

**Key decisions:**
- `type: "module"` — Vite 5 works best with ESM
- Scripts match standard Vite project conventions
- Dependencies left empty (populated in later tasks when React/Vite are installed)

### File: `kanban/server/package.json`

```json
{
  "name": "kanban-server",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "dev": "nodemon index.js",
    "start": "node index.js"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

**Key decisions:**
- No `type: "module"` — Express 4 / CommonJS convention
- `dev` uses `nodemon` for hot reload during development (installed in later tasks)
- `start` uses plain `node` for production
- `main: "index.js"` matches the PRD entry point
- Dependencies left empty (populated in later tasks when Express/ws/etc. are installed)

**After creating both files**, run tests:
- ✅ All Subtask 4 tests pass

---

## Final Verification

All 8 files are now in place. Run `npm install` from `kanban/` to install `concurrently`
and link workspace packages:

```bash
cd /Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-1/kanban
npm install
```

Expected: installs `concurrently` into `kanban/node_modules/`, creates `package-lock.json`,
and links the `kanban-client` and `kanban-server` workspace packages. No errors.

Then run the full structural test suite:

```bash
cd /Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-1
node --test kanban/test/setup.test.mjs
```

Expected: **all 28 tests pass** (6 root package + 7 scripts + 6 directories + 5 client package + 4 server package).

Verify workspace packages are recognized by npm:
```bash
cd /Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-1/kanban
npm query .workspace
```

Expected: lists `kanban-client` and `kanban-server` as workspace members.

> **Note**: `npm run dev` and `npm run build` are NOT verified in this task because
> their runtime dependencies (Vite, nodemon, Express) are installed in later tasks.
> Attempting to run them now will fail on missing binaries, which is expected.

---

## Summary of Files Created (in order)

| Order | File | Purpose |
|-------|------|---------|
| 1 | `kanban/test/setup.test.mjs` | Test file written FIRST (red phase) |
| 2 | `kanban/package.json` | Root workspace config + scripts (green: subtasks 1+2) |
| 3 | `kanban/client/src/.gitkeep` | Creates client/src/ directory |
| 4 | `kanban/server/db/.gitkeep` | Creates server/db/ directory |
| 5 | `kanban/server/api/.gitkeep` | Creates server/api/ directory |
| 6 | `kanban/server/ws/.gitkeep` | Creates server/ws/ directory |
| 7 | `kanban/client/package.json` | Client workspace config (green: subtask 4) |
| 8 | `kanban/server/package.json` | Server workspace config (green: subtask 4) |
| 9 | `cd kanban && npm install` | Installs concurrently, links workspaces (run last) |

No existing files need to be modified (the repository starts empty).
