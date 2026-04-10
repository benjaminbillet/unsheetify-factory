# Task 3: Setup Express Server with Health Endpoint

## Context
The kanban monorepo (`kanban/`) has a scaffolded `server/` workspace with an empty `package.json` and no source files. This task creates the foundational Express server: installs dependencies, configures CORS and middleware, adds the `/health` endpoint, implements error handling, configures nodemon for dev, and serves static files in production. Follows strict TDD (Red → Green → Refactor).

---

## Critical Files

| File | Action |
|------|--------|
| `kanban/server/package.json` | Modify — add deps, `"type": "module"`, test script, nodemonConfig |
| `kanban/server/index.js` | Create — Express app (new) |
| `kanban/server/test/server.test.mjs` | Create — all server tests (new) |
| `kanban/package.json` | Modify — add `"test:server"` script |

Working directory for all relative paths: `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-3/kanban/`

---

## Phase 0 — Write Tests First (Red)

Create `server/test/server.test.mjs` with ALL tests before writing any implementation. Running it should produce failures (module not found, endpoints 404, etc.).

### Test helper (top of file)
```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../index.js';   // ← required by every test suite that starts a server

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(__dirname, '..');   // kanban/server/
const ROOT        = resolve(SERVER_ROOT, '..');  // kanban/

async function startTestServer(app) {
  return new Promise((resolvePromise) => {
    const server = app.listen(0, () => {
      resolvePromise({ server, baseUrl: `http://localhost:${server.address().port}` });
    });
  });
}
function stopServer(server) {
  return new Promise((resolvePromise) => server.close(resolvePromise));
}
```

### Test suites

#### Subtask 1 — Dependency availability
```
describe('Dependencies availability')
  it('express can be imported')               → typeof express === 'function'
  it('cors can be imported')                  → typeof cors === 'function'
  it('better-sqlite3 can be imported')        → typeof Database === 'function'
  it('ws can be imported')                    → WebSocket or WebSocketServer exists
  it('uuid v4 produces valid UUID')           → /^[0-9a-f-]{36}$/.test(uuidv4())
  it('package.json lists express dependency') → pkg.dependencies.express exists
  it('package.json lists cors dependency')    → pkg.dependencies.cors exists
  it('package.json lists better-sqlite3')     → pkg.dependencies['better-sqlite3'] exists
  it('package.json lists ws dependency')      → pkg.dependencies.ws exists
  it('package.json lists uuid dependency')    → pkg.dependencies.uuid exists
  it('nodemon is a devDependency')            → pkg.devDependencies.nodemon exists
```

#### Subtask 2 — CORS and JSON middleware
```
describe('CORS configuration')           [before: createApp() → start server, after: stop]
  it('Access-Control-Allow-Origin present on /health with Origin header')
    → send Origin: http://localhost:5173 header; assert response has access-control-allow-origin header
  it('OPTIONS preflight returns 2xx')
    → fetch /health with method OPTIONS, Origin, Access-Control-Request-Method: GET; assert status < 300

describe('JSON body parsing')            [before: createApp() → start server, after: stop]
  // /dev/echo (POST → res.json(req.body)) and /dev/error are built into createApp() for !production
  it('parses JSON body and echoes it back')
    → POST /dev/echo with Content-Type:application/json body {test:'value'}; assert response deepEqual {test:'value'}
  it('returns 4xx on malformed JSON body')
    → POST /dev/echo with Content-Type:application/json body string 'not-valid-json{';
       assert res.status === 400 (express.json() sets err.status=400, caught by error handler)
```

#### Subtask 3 — Health endpoint and error handling
```
describe('GET /health')                  [before: createApp() → start server, after: stop]
  it('returns HTTP 200')
  it('returns { ok: true }')
    → res.json() deepEqual { ok: true }
  it('returns Content-Type: application/json')

describe('Error handling middleware')    [before: createApp() → start server, after: stop]
  // /dev/error is built into createApp() when NODE_ENV !== 'production' — do NOT add routes in test
  it('returns 500 for unhandled errors')
    → GET /dev/error; assert res.status === 500
  it('response body has "error" string field')
    → GET /dev/error; assert typeof body.error === 'string'
  it('uses err.status when provided (e.g. 404)')
    → GET /dev/error?status=404; assert res.status === 404

describe('404 for unknown routes')       [before: createApp() → start server, after: stop]
  it('unknown GET returns 404')
    → GET /this-route-does-not-exist; assert res.status === 404
  it('404 response body has "error" field')
    → same request; assert body.error exists
```

#### Subtask 4 — Static files and nodemon config
```
describe('Static file serving in production')
  // Describe-scope variables (declared with `let` so before AND after can both access them):
  //   let server, baseUrl, distExisted;
  //   const distPath = join(ROOT, 'client', 'dist');   // → kanban/client/dist (constant, safe at describe scope)
  // before:
  //   1. distExisted = existsSync(distPath)             // assignment, NOT declaration (already declared above)
  //   2. mkdirSync(distPath, { recursive: true })
  //   3. writeFileSync(join(distPath, 'index.html'), '<html><body>Test App</body></html>')
  //   4. const savedEnv = process.env.NODE_ENV
  //   5. process.env.NODE_ENV = 'production'
  //   6. const app = createApp()   ← top-level import is cached; createApp() reads NODE_ENV at call time → isProduction=true
  //   7. process.env.NODE_ENV = savedEnv
  //   8. ({ server, baseUrl } = await startTestServer(app))  // assignment to describe-scope vars
  // after:
  //   await stopServer(server)
  //   if (!distExisted) rmSync(distPath, { recursive: true, force: true })
  it('serves index.html from client/dist for GET /')
    → GET /; assert res.status === 200 and body contains 'Test App'
  it('serves index.html for unknown SPA paths (fallback)')
    → GET /some/spa/route; assert res.status === 200 and body contains 'Test App'

describe('Nodemon configuration')        [no server needed — file checks only]
  it('server package.json scripts.dev uses nodemon')
    → readFileSync server/package.json; assert /nodemon/.test(pkg.scripts.dev)
  it('server package.json has nodemonConfig with watch and ext fields')
    → assert pkg.nodemonConfig.watch is array; assert pkg.nodemonConfig.ext exists
```

---

## Phase 1 — Subtask 1: Dependencies + package.json (Green)

### 1a. Update `server/package.json`
```json
{
  "name": "kanban-server",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "dev": "nodemon index.js",
    "start": "node index.js",
    "test": "node --test test/server.test.mjs"
  },
  "nodemonConfig": {
    "watch": ["./"],
    "ext": "js,json",
    "ignore": ["test/**", "node_modules/**"]
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "better-sqlite3": "^9.4.3",
    "ws": "^8.16.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
```

### 1b. Update root `kanban/package.json`
Add a `"test:server"` script alongside the existing scripts:
```json
"test:server": "npm -w server run test"
```

### 1c. Install dependencies
```bash
cd kanban && npm install
```
(npm workspaces installs server deps into the workspace and hoists shared packages)

---

## Phase 2 — Subtask 2 & 3: `server/index.js` (Green)

```js
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createApp() {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';

  // ── Middleware ────────────────────────────────────────────────────────────
  // NOTE: origin:'*' + credentials:true is invalid per CORS spec (browsers reject it).
  // Use origin:true (reflect request Origin) in dev so credentials can coexist if needed.
  app.use(cors({
    origin: isProduction ? false : true,   // 'true' reflects the request's Origin header
    credentials: true,
  }));
  app.use(express.json());

  // ── Routes ────────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Dev/test-only routes (not in production)
  if (!isProduction) {
    app.post('/dev/echo', (req, res) => res.json(req.body));
    app.get('/dev/error', (req, res, next) => {
      const err = new Error('Test error');
      err.status = req.query.status ? parseInt(req.query.status, 10) : 500;
      next(err);
    });
  }

  // ── Static files (production) ─────────────────────────────────────────────
  if (isProduction) {
    const distPath = join(__dirname, '..', 'client', 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) =>
      res.sendFile(join(distPath, 'index.html'))
    );
  }

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.use((_req, res) => res.status(404).json({ error: 'Not Found' }));

  // ── Error handler ─────────────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ error: err.message || 'Internal Server Error' });
  });

  return app;
}

// Start when run as the entry point
// resolve() (already imported above) normalises relative paths before comparing
if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp();
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export { createApp };
```

---

## Phase 3 — Subtask 4: Nodemon config + static file serving (Green)

- `nodemonConfig` is already embedded in `server/package.json` (Phase 1a).
- Static file serving is already in `createApp()` under `isProduction` guard (Phase 2).
- Root `package.json` `test:server` script already added in Phase 1b.
- No additional files needed for subtask 4.

---

## Execution Order (TDD cycle per subtask)

1. **Write `server/test/server.test.mjs`** (all tests) → confirm RED (`node --test` fails: module not found)
2. **Update `server/package.json`** with deps + type:module
3. **Run `npm install`** from `kanban/`
4. **Re-run tests** → RED (index.js missing)
5. **Create `server/index.js`** with `createApp()`
6. **Run `npm -w server run test`** → GREEN (all pass)
7. **Refactor if needed**, re-run tests → still GREEN

---

## Verification

```bash
# Run all server tests
cd kanban && npm -w server run test

# Manual health check (start server in one terminal)
cd kanban && npm -w server run dev
# In another terminal:
curl http://localhost:3001/health
# Expected: {"ok":true}  HTTP 200

# CORS headers check
curl -H "Origin: http://localhost:5173" -I http://localhost:3001/health
# Expected: Access-Control-Allow-Origin: http://localhost:5173 header present
# (origin:true reflects the request's Origin rather than returning wildcard *)

# Error handling check
curl http://localhost:3001/dev/error
# Expected: {"error":"Test error"}  HTTP 500

# 404 check
curl -I http://localhost:3001/nonexistent
# Expected: HTTP 404

# Nodemon restart (dev mode)
# Edit a line in server/index.js → server should auto-restart
```
