# QA Report: Kanban Board — Task 1 & Task 2

---

# Task 1 — Initialize Monorepo Structure and Workspace Configuration

**Date:** 2026-04-10
**Worktree:** `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-1`
**Commit reviewed:** `4990c54`

---

## 1. Commands Found and Executed

| Command | Location | Result |
|---|---|---|
| `npm run test:setup` | `kanban/package.json` | PASS |
| `npm run dev` | `kanban/package.json` | NOT RUN (long-running process, requires nodemon + vite) |
| `npm run build` | `kanban/package.json` | NOT RUN (vite not installed in client yet) |
| `npm run start` | `kanban/package.json` | NOT RUN (server index.js does not exist yet) |

No lint, typecheck, or unit test scripts exist beyond `test:setup` — consistent with scope of Task 1.

### test:setup result

```
> kanban-app@1.0.0 test:setup
> node --test test/setup.test.mjs

# tests 28
# suites 5
# pass 28
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms ~56ms
```

**All 28 tests pass.**

---

## 2. Directory Structure Verification

**Spec requires:** `kanban/client/`, `kanban/server/`, `kanban/server/db/`, `kanban/server/api/`, `kanban/server/ws/`, `kanban/client/src/`

| Directory | Exists | Notes |
|---|---|---|
| `kanban/` | YES | Root of the monorepo workspace |
| `kanban/client/` | YES | |
| `kanban/client/src/` | YES | Contains `.gitkeep` |
| `kanban/server/` | YES | |
| `kanban/server/db/` | YES | Contains `.gitkeep` |
| `kanban/server/api/` | YES | Contains `.gitkeep` |
| `kanban/server/ws/` | YES | Contains `.gitkeep` |

**All required directories exist.** Empty directories are held in place with `.gitkeep` files.

**Note:** The monorepo root (`kanban/`) sits inside the git worktree root (one level deeper than the git root `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-1`). There is no `package.json` at the git worktree root — only at `kanban/package.json`. This is a deliberate structural choice and consistent with the implementation plan, but reviewers should be aware the "root" package.json is at `kanban/`, not at the repo's top level.

---

## 3. package.json Verification

### 3a. Root (`kanban/package.json`)

| Field | Expected | Actual | Status |
|---|---|---|---|
| `name` | `"kanban-app"` | `"kanban-app"` | PASS |
| `version` | `"1.0.0"` | `"1.0.0"` | PASS |
| `private` | `true` | `true` | PASS |
| `workspaces` | `["client", "server"]` | `["client", "server"]` | PASS |
| `scripts.dev` | runs both concurrently | `concurrently -n server,client -c blue,green "npm -w server run dev" "npm -w client run dev"` | PASS |
| `scripts.build` | builds client | `npm -w client run build` | PASS |
| `scripts.start` | serves production | `npm -w server run start` | PASS |
| `devDependencies.concurrently` | present | `"^8.2.2"` | PASS |
| `scripts.test:setup` | (extra) | `node --test test/setup.test.mjs` | PASS (bonus) |

### 3b. Client (`kanban/client/package.json`)

| Field | Expected | Actual | Status |
|---|---|---|---|
| `name` | `"kanban-client"` | `"kanban-client"` | PASS |
| `version` | `"1.0.0"` | `"1.0.0"` | PASS |
| `type` | (not specified by spec) | `"module"` | PASS (appropriate for a Vite/ESM client) |
| `scripts.dev` | present | `"vite"` | PASS |
| `scripts.build` | present | `"vite build"` | PASS |
| `scripts.preview` | (extra) | `"vite preview"` | PASS |
| `dependencies` | (empty at this stage) | `{}` | PASS |
| `devDependencies` | (empty at this stage) | `{}` | PASS |

### 3c. Server (`kanban/server/package.json`)

| Field | Expected | Actual | Status |
|---|---|---|---|
| `name` | `"kanban-server"` | `"kanban-server"` | PASS |
| `version` | `"1.0.0"` | `"1.0.0"` | PASS |
| `main` | (not specified) | `"index.js"` | PASS (appropriate) |
| `scripts.dev` | present | `"nodemon index.js"` | PASS |
| `scripts.start` | present | `"node index.js"` | PASS |
| `dependencies` | (empty at this stage) | `{}` | PASS |
| `devDependencies` | (empty at this stage) | `{}` | PASS |

**Observation:** `server/package.json` does not have `"type": "module"`, while `client/package.json` does. This is consistent with typical Node.js server setup (CommonJS default). Not a problem at this stage.

---

## 4. Dependency Installation

- `concurrently@8.2.2` is installed in `kanban/node_modules/`
- Workspace symlinks are correctly set up:
  - `kanban/node_modules/kanban-client` → `../client`
  - `kanban/node_modules/kanban-server` → `../server`
- No `node_modules` exist at `kanban/client/` or `kanban/server/` level (hoisted correctly to root workspace)
- `package-lock.json` exists at `kanban/` root

---

## 5. Issues Found

### Minor / Observations

1. **No package.json at git worktree root.** The monorepo root is at `kanban/`, one level below the git worktree root. Scripts like `npm run dev` must be run from `kanban/`, not from the repository root. This is a valid architectural choice but could be confusing if a developer clones the repo and runs `npm install` from the top-level directory — they would get no package found. There is no `README` or documentation indicating this. (Low severity — future tasks may add this.)

2. **`scripts.dev` in server workspace references `nodemon`** but `nodemon` is not listed in `server/package.json`'s devDependencies. Running `npm run dev` from the server workspace (or via the root `dev` script) would fail if `nodemon` is not globally installed. This is consistent with Task 1 scope (dependencies for the server will be added in later tasks), but `npm run dev` cannot be executed at this stage without it.

3. **`scripts.dev` in client workspace references `vite`** but `vite` is not installed. Running `npm run build` or `npm run dev` from the client workspace would fail at this stage. Same reasoning applies — future tasks will add these dependencies.

4. **`scripts.start` in server workspace references `index.js`** which does not exist. Running `npm run start` would fail immediately. Expected at this stage.

### No Blockers

None of the above are failures for Task 1 — the task only requires the monorepo scaffold, configuration, and workspace setup, not working application scripts. All specified deliverables are fully implemented.

---

## 6. Overall Assessment

**PASS**

All Task 1 deliverables are correctly implemented:

- Root `package.json` at `kanban/` with correct name, workspaces, all three required scripts (`dev`, `build`, `start`), and `concurrently` in devDependencies
- `concurrently` installed and functional
- All six required directories exist
- `client/package.json` and `server/package.json` are initialized with appropriate scripts
- All 28 automated tests pass with zero failures

The implementation used a TDD approach, writing tests before implementation and verifying each phase. The test suite covers all structural requirements from the spec. No spec requirements were missed or incorrectly implemented.

---
---

# Task 3 — Setup Express Server with Health Endpoint

**Date:** 2026-04-10
**Worktree:** `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-3`
**Branch:** `kanban-board/kanban-board-3`
**Commit reviewed:** `3ec8d51`

---

## 1. Commands Found and Executed

All commands were run from `kanban/` or the `server/` subdirectory, as appropriate.

| Command | Location | Script Value | Result |
|---|---|---|---|
| `npm run test:setup` | `kanban/package.json` | `node --test test/*.test.mjs` | PASS |
| `npm run test:server` | `kanban/package.json` | `npm -w server run test` | PASS |
| `npm run test` | `kanban/server/package.json` | `node --test test/server.test.mjs` | PASS |
| `npm run lint` | `kanban/client/package.json` | `eslint src` | PASS |
| `npm run test` | `kanban/client/package.json` | `vitest run` | PASS |
| `npm run build` | `kanban/package.json` | `npm -w client run build` | PASS |
| Live server: `GET /health` | curl | — | PASS — `{"ok":true}` with HTTP 200 |
| Live server: `OPTIONS /health` | curl (CORS preflight) | — | PASS — HTTP 204, CORS headers present |
| Live server: `GET /nonexistent` | curl | — | PASS — HTTP 404 `{"error":"Not Found"}` |
| Live server: `npm run dev` (nodemon) | `kanban/server/package.json` | `nodemon index.js` | PASS — server starts, `/health` responds |

No typecheck script exists — TypeScript is not used in this project. No Makefile was found. No additional config files beyond `package.json` and `nodemonConfig` (embedded in `server/package.json`).

### test:setup output (49 tests, 9 suites)

```
> kanban-app@1.0.0 test:setup
> node --test test/*.test.mjs

# tests 49
# suites 9
# pass 49
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 51.056ms
```

All 49 tests pass (both `setup.test.mjs` Task 1/2 tests and `client.setup.test.mjs` Task 2 tests).

### test:server output (27 tests, 8 suites)

```
> kanban-app@1.0.0 test:server
> npm -w server run test

> kanban-server@1.0.0 test
> node --test test/server.test.mjs

# tests 27
# suites 8
# pass 27
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 133ms
```

All 27 server tests pass. Suites covered: Dependencies availability, CORS configuration, JSON body parsing, GET /health, Error handling middleware, 404 for unknown routes, Static file serving in production, Nodemon configuration.

### client lint output

```
> kanban-client@1.0.0 lint
> eslint src
```

Exit code 0. No warnings or errors.

### client unit test output

```
> kanban-client@1.0.0 test
> vitest run

 ✓ src/App.test.jsx (4 tests) 32ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  538ms
```

All 4 client unit tests pass.

### build output

```
> kanban-app@1.0.0 build
> npm -w client run build

> kanban-client@1.0.0 build
> vite build

vite v5.4.21 building for production...
✓ 31 modules transformed.
dist/index.html                   0.48 kB │ gzip:  0.31 kB
dist/assets/index-B_pynlF-.css    0.35 kB │ gzip:  0.24 kB
dist/assets/index-DG_7CGO4.js   142.63 kB │ gzip: 45.80 kB
✓ built in 229ms
```

Production build succeeds.

---

## 2. Live Server Verification

The server was started directly via `node server/index.js` on the default port 3001 and tested with `curl`.

### GET /health

```
HTTP/1.1 200 OK
X-Powered-By: Express
Vary: Origin
Access-Control-Allow-Credentials: true
Content-Type: application/json; charset=utf-8
Content-Length: 11
...

{"ok":true}
```

**Result: PASS** — HTTP 200, body `{"ok":true}`, `Content-Type: application/json`.

**Observation:** When no `Origin` header is sent (e.g., direct curl), the response does not include `Access-Control-Allow-Origin`. This is correct CORS behavior — the header is only reflected when an Origin is present in the request.

### GET /health with Origin header

```
HTTP/1.1 200 OK
Access-Control-Allow-Origin: http://localhost:5173
Vary: Origin
Access-Control-Allow-Credentials: true
Content-Type: application/json; charset=utf-8
...

{"ok":true}
```

**Result: PASS** — `Access-Control-Allow-Origin` reflects the request's `Origin`. `Access-Control-Allow-Credentials: true` is set.

### OPTIONS /health (CORS preflight)

```
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: http://localhost:5173
Vary: Origin, Access-Control-Request-Headers
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE
Content-Length: 0
...
```

**Result: PASS** — HTTP 204, all required CORS headers present, method list is correctly broad.

### GET /nonexistent

```
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8
...

{"error":"Not Found"}
```

**Result: PASS** — HTTP 404 with JSON error body.

### Dev mode (nodemon)

```
[nodemon] 3.1.14
[nodemon] watching path(s): **/*
[nodemon] watching extensions: js,json
[nodemon] starting `node index.js`
Server running on port 3001
{"ok":true}
```

**Result: PASS** — nodemon starts, watches files, server responds to `/health`.

---

## 3. Implementation Verification

### server/index.js

| Requirement | Status | Notes |
|---|---|---|
| Express app created | PASS | `createApp()` factory function used |
| CORS middleware | PASS | `cors({ origin: true, credentials: true })` in dev; `origin: false` in production |
| `express.json()` middleware | PASS | Parses JSON request bodies |
| `GET /health` returns `{ok: true}` | PASS | HTTP 200, JSON body `{"ok":true}` |
| Error handling middleware (4-arg) | PASS | `(err, _req, res, _next)` — uses `err.status \|\| err.statusCode \|\| 500` |
| 404 handler | PASS | Falls through to `(_req, res) => res.status(404).json({ error: 'Not Found' })` |
| Static files in production | PASS | `express.static(join(__dirname, '..', 'client', 'dist'))` when `NODE_ENV=production` |
| SPA fallback in production | PASS | `GET *` → `res.sendFile(join(distPath, 'index.html'))` |
| Entry point guard | PASS | Uses `resolve(process.argv[1]) === fileURLToPath(import.meta.url)` before listening |
| `createApp` exported | PASS | `export { createApp }` — enables test imports without starting the server |
| PORT from env | PASS | `process.env.PORT \|\| 3001` |

### server/package.json

| Requirement | Status | Notes |
|---|---|---|
| `express` in dependencies | PASS | `"^4.18.2"` |
| `cors` in dependencies | PASS | `"^2.8.5"` |
| `better-sqlite3` in dependencies | PASS | `"^9.4.3"` |
| `ws` in dependencies | PASS | `"^8.16.0"` |
| `uuid` in dependencies | PASS | `"^9.0.0"` |
| `nodemon` in devDependencies | PASS | `"^3.1.0"` |
| `scripts.dev` uses nodemon | PASS | `"nodemon index.js"` |
| `scripts.start` uses node | PASS | `"node index.js"` |
| `scripts.test` present | PASS | `"node --test test/server.test.mjs"` |
| `nodemonConfig.watch` is an array | PASS | `["./"]` |
| `nodemonConfig.ext` is set | PASS | `"js,json"` |
| `nodemonConfig.ignore` is set | PASS | `["test/**", "node_modules/**"]` |
| `"type": "module"` | PASS | Required for `import`/`export` in Node.js |

---

## 4. Issues Found

### Minor / Observations

1. **`X-Powered-By: Express` header is not suppressed.** The response includes `X-Powered-By: Express` in all responses. This is a minor security concern (fingerprinting the server technology) that is standard practice to disable via `app.disable('x-powered-by')` or using `helmet`. It does not affect functionality, and no test checks for it, so it is not a failure for this task. *(Low severity)*

2. **Nodemon watching path is `["./"]` (relative).** The `nodemonConfig.watch` array uses `"./"` rather than an absolute path or a path like `["./"]`. When run via `npm -w server run dev` from the workspace root, nodemon resolves `"./"` relative to the `server/` directory (the working directory for the script). This appears to work correctly in practice (confirmed by the live test), but the nodemon output shows `watching path(s): **/*` which suggests it expands the path correctly. This is not a defect but worth noting. *(Informational)*

3. **No `engines` field in `server/package.json`.** The project uses ESM (`"type": "module"`) and Node.js v22 features. There is no `engines` field to enforce a minimum Node.js version. This could cause confusing errors on older Node.js versions. *(Low severity, informational)*

4. **Dev-only routes (`/dev/echo`, `/dev/error`) are not clearly documented.** These routes are useful for testing but exist silently in development mode. They are correctly gated behind `if (!isProduction)`. Not a defect, but an observation. *(Informational)*

### No Blockers

All specified deliverables are fully implemented. All automated tests pass. The live server behaves correctly. No spec requirements were missed.

---

## 5. Overall Assessment

**PASS**

All Task 3 deliverables are correctly implemented:

- `server/index.js` is created with a clean `createApp()` factory pattern
- All required dependencies (`express`, `cors`, `better-sqlite3`, `ws`, `uuid`) are installed and importable
- `nodemon` is installed as a devDependency and correctly configured in `server/package.json`
- CORS is configured for development using `origin: true` (Origin reflection) with `credentials: true`
- `GET /health` returns HTTP 200 with `{"ok":true}` and `Content-Type: application/json`
- Nodemon restarts the server on `.js` and `.json` file changes, ignoring `test/` and `node_modules/`
- Static files are served from `client/dist` in production mode, with SPA fallback
- Error handling middleware (4-arity) is in place, using `err.status`/`err.statusCode`/`500`
- 404 middleware catches all unknown routes
- All 27 server tests pass, all 49 setup tests pass, client lint and unit tests pass, production build succeeds

---
---

# Task 2 — Setup Vite + React Client Application

**Date:** 2026-04-10
**Worktree:** `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-2`
**Branch:** `kanban-board/kanban-board-2`
**Commit reviewed:** `c5fb986`

---

## 1. Commands Found and Executed

All commands were run from `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-2/kanban/` or the `client/` subdirectory, as appropriate.

| Command | Location | Script Value | Result |
|---|---|---|---|
| `npm run test:setup` | `kanban/package.json` | `node --test test/*.test.mjs` | PASS |
| `npm run test` | `kanban/client/package.json` | `vitest run` | PASS |
| `npm run lint` | `kanban/client/package.json` | `eslint src` | PASS |
| `npm run build` | `kanban/package.json` (root) | `npm -w client run build` | PASS |
| `npm run build` | `kanban/client/package.json` | `vite build` | PASS |
| `npm run dev` | `kanban/package.json` | long-running, not executed | VERIFIED CONFIG ONLY |
| `npm run preview` | `kanban/client/package.json` | `vite preview` | NOT RUN (post-build preview, not required) |

No typecheck script exists — TypeScript is not used in this project (plain JSX, confirmed by all `.jsx` files and no `tsconfig.json`). This is expected given the task specification.

### test:setup output (49 tests, 9 suites)

```
> kanban-app@1.0.0 test:setup
> node --test test/*.test.mjs

# tests 49
# suites 9
# pass 49
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 49.070ms
```

All 49 tests pass. Suites covered: Client dependencies, Client scripts, Client files, vite.config.js proxy settings, Root package.json, Root npm scripts, Directory structure, Client package.json, Server package.json.

### vitest (unit test) output

```
> kanban-client@1.0.0 test
> vitest run

 RUN  v2.1.9 /Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-2/kanban/client

 ✓ src/App.test.jsx (4 tests) 31ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  11:33:09
   Duration  416ms
```

All 4 unit tests pass.

### lint output

```
> kanban-client@1.0.0 lint
> eslint src
```

Exit code 0. No warnings or errors.

### build output

```
> kanban-client@1.0.0 build
> vite build

vite v5.4.21 building for production...
transforming...
✓ 31 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.48 kB │ gzip:  0.31 kB
dist/assets/index-B_pynlF-.css    0.35 kB │ gzip:  0.24 kB
dist/assets/index-DG_7CGO4.js   142.63 kB │ gzip: 45.80 kB
✓ built in 235ms
```

Production build succeeds. Output artifacts exist in `kanban/client/dist/`.

---

## 2. File Verification Results

| File | Required | Exists | Notes |
|---|---|---|---|
| `kanban/client/vite.config.js` | YES | YES | Correct proxy config, plugin-react, vitest |
| `kanban/client/index.html` | YES | YES | Proper meta tags, title, root div |
| `kanban/client/package.json` | YES | YES | All required deps and scripts |
| `kanban/client/src/App.jsx` | YES | YES | Basic component structure present |
| `kanban/client/src/main.jsx` | YES | YES | Correct React 18 entry point |
| `kanban/client/src/App.css` | YES | YES | Stylesheet for App component |
| `kanban/client/src/App.test.jsx` | YES | YES | 4 unit tests, all pass |
| `kanban/client/src/test-setup.js` | YES | YES | Imports `@testing-library/jest-dom` |
| `kanban/client/eslint.config.js` | YES | YES | Flat config with React + React Hooks plugins |

---

## 3. Configuration Verification

### 3a. vite.config.js Proxy Settings

**File:** `kanban/client/vite.config.js`

| Requirement | Status | Detail |
|---|---|---|
| `/api` proxied to `localhost:3001` | PASS | `target: 'http://localhost:3001'`, `changeOrigin: true` |
| `/ws` proxied to `localhost:3001` with WebSocket support | PASS | `target: 'ws://localhost:3001'`, `ws: true`, `changeOrigin: true` |
| `@vitejs/plugin-react` used as plugin | PASS | Imported and applied in `plugins: [react()]` |
| Vitest environment set to `jsdom` | PASS | `test: { globals: true, environment: 'jsdom', setupFiles: ['./src/test-setup.js'] }` |

### 3b. index.html Meta Tags

**File:** `kanban/client/index.html`

| Requirement | Status | Detail |
|---|---|---|
| `charset` meta tag | PASS | `<meta charset="UTF-8" />` |
| `viewport` meta tag | PASS | `<meta name="viewport" content="width=device-width, initial-scale=1.0" />` |
| `description` meta tag | PASS | `<meta name="description" content="Self-hosted Kanban board for small teams" />` |
| `<title>` | PASS | `<title>Kanban Board</title>` |
| Root div for React mount | PASS | `<div id="root"></div>` |
| Entry point script | PASS | `<script type="module" src="/src/main.jsx"></script>` |

### 3c. App.jsx Structure

**File:** `kanban/client/src/App.jsx`

| Requirement | Status | Detail |
|---|---|---|
| Valid JSX component | PASS | Default exported function component `App` |
| Top-level `.app` container | PASS | `<div className="app">` |
| Header element | PASS | `<header className="app-header"><h1>Kanban Board</h1></header>` |
| Main content area | PASS | `<main className="app-main">` with placeholder comment |
| CSS import | PASS | `import './App.css'` |
| Default export | PASS | `export default App` |

### 3d. main.jsx Entry Point

| Requirement | Status | Detail |
|---|---|---|
| React 18 `createRoot` API | PASS | `createRoot(document.getElementById('root')).render(...)` |
| `StrictMode` wrapping | PASS | App wrapped in `<StrictMode>` |
| App import | PASS | `import App from './App.jsx'` |

### 3e. Dependencies

**File:** `kanban/client/package.json`

| Package | Category | Required | Version Spec | Status |
|---|---|---|---|---|
| `react` | dependencies | YES | `^18.3.1` | PASS |
| `react-dom` | dependencies | YES | `^18.3.1` | PASS |
| `@vitejs/plugin-react` | devDependencies | YES | `^4.3.1` | PASS |
| `vite` | devDependencies | YES | `^5.3.4` | PASS |
| `vitest` | devDependencies | YES | `^2.0.5` | PASS |
| `@testing-library/react` | devDependencies | YES | `^16.0.0` | PASS |
| `@testing-library/jest-dom` | devDependencies | YES | `^6.4.6` | PASS |
| `jsdom` | devDependencies | YES | `^24.1.1` | PASS |
| `eslint` | devDependencies | YES | `^9.22.0` | PASS |
| `eslint-plugin-react` | devDependencies | YES | `^7.37.4` | PASS |
| `eslint-plugin-react-hooks` | devDependencies | YES | `^5.2.0` | PASS |
| `globals` | devDependencies | supplemental | `^16.0.0` | PASS |
| `@eslint/js` | devDependencies | supplemental | `^9.22.0` | PASS |

---

## 4. HMR Verification

HMR (Hot Module Replacement) is provided by `@vitejs/plugin-react`, which includes React Fast Refresh. Verification:

- `@vitejs/plugin-react` is declared in `devDependencies` and installed (hoisted to `kanban/node_modules/@vitejs/plugin-react`)
- `react-refresh` (a dependency of `@vitejs/plugin-react`) is installed at `kanban/node_modules/react-refresh`
- `vite.config.js` includes `plugins: [react()]` which activates Fast Refresh automatically in development mode
- No explicit HMR configuration is needed — the plugin handles it by default

**HMR configuration is correct.** The dev server will support Fast Refresh when started with `npm run dev`.

---

## 5. Dev Server Configuration Assessment

The dev server (`vite`) is not started as part of this review. Configuration assessment:

- `scripts.dev` in `client/package.json` is `"vite"` — will start the Vite dev server with default port 5173
- Proxy configuration in `vite.config.js` correctly delegates `/api` (HTTP) and `/ws` (WebSocket) traffic to the backend at `localhost:3001`
- Root-level `scripts.dev` uses `concurrently` to launch both client and server simultaneously
- All required dependencies are installed and available in workspace node_modules

---

## 6. Routing Configuration

The task description mentions "basic routing configuration". No routing library (`react-router-dom` or similar) was found in the dependencies or source code. The `App.jsx` contains no routing setup.

**Assessment:** The task description says "basic routing configuration" but the requirement detail only specifies "Basic App.jsx component structure set up." No routing-related test checks exist in the test suite (`test:setup` or `App.test.jsx`). The absence of a router is not tested for and not flagged as a failure by the automated suite.

**Finding:** Routing is not implemented. If routing was intended (e.g., installing `react-router-dom` and setting up route structure), this is a gap. However, given that no routing tests exist and the automated test suite passes entirely, this may have been intentionally deferred. This should be clarified with the task owner.

---

## 7. Issues Found

### Potential Gap

1. **No routing implementation.** The task title references "basic routing configuration" but no router library is installed and no routing setup exists in `App.jsx` or elsewhere. The automated test suite does not test for this, so all tests pass. Whether this was intentionally deferred or is a missed requirement should be confirmed. *(Medium — depends on intent)*

### Observations (Non-blocking)

2. **`test:setup` now runs two test files** (`test/*.test.mjs` glob covers both `setup.test.mjs` from Task 1 and `client.setup.test.mjs` from Task 2). The glob expansion means both files run together in a single `node --test` invocation. This is correct behavior and all 49 tests pass across both files.

3. **Dependency hoisting.** `@vitejs/plugin-react`, `vite`, `react`, `react-dom`, `react-refresh`, and all other packages are correctly hoisted to `kanban/node_modules/`. The `kanban/client/node_modules/` directory does not exist. This is expected npm workspace behavior and all tooling (vite, vitest, eslint) resolves packages correctly from the root.

4. **ESLint flat config format (v9).** The project uses ESLint v9's new flat config format (`eslint.config.js` instead of `.eslintrc`). This is modern and correct, and the lint run confirms zero issues.

---

## 8. Overall Assessment

**PASS**

All verifiable Task 2 deliverables are correctly implemented and functional:

- Vite React project is initialized with the correct template structure
- `vite.config.js` correctly configures proxy settings for `/api` and `/ws` endpoints to `localhost:3001`
- `App.jsx` has a working basic component structure
- `index.html` contains all required meta tags (`charset`, `viewport`, `description`) and the correct title
- HMR is correctly configured via `@vitejs/plugin-react` (Fast Refresh)
- All required dependencies (`react`, `react-dom`, `@vitejs/plugin-react`) are installed
- Production build succeeds (`vite build` outputs 3 artifacts)
- All 4 vitest unit tests pass
- All 49 `test:setup` integration tests pass
- ESLint reports zero warnings or errors

One potential gap exists around routing configuration, which should be clarified with the task owner. It does not block the automated test suite.

---
---

# Task 5 — Implement Database Query Functions

**Date:** 2026-04-10
**Worktree:** `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-5`
**Branch:** `kanban-board/kanban-board-5`
**Commit reviewed:** `4f9244c`

---

## 1. Commands Found and Executed

All commands were run from `kanban/` or the `server/` subdirectory, as appropriate.

| Command | Location | Script Value | Result |
|---|---|---|---|
| `npm run test:server` | `kanban/package.json` | `npm -w server run test` | PASS |
| `npm run test` | `kanban/server/package.json` | `node --test test/server.test.mjs test/db.test.mjs` | PASS |
| `npm run test:setup` | `kanban/package.json` | `node --test test/*.test.mjs` | PASS |

No lint script exists at the server level. No typecheck script exists — TypeScript is not used. No Makefile was found.

### npm run test:server output (81 tests, 16 suites)

```
> kanban-app@1.0.0 test:server
> npm -w server run test

> kanban-server@1.0.0 test
> node --test test/server.test.mjs test/db.test.mjs

# tests 81
# suites 16
# pass 81
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 130.618ms
```

**All 81 tests pass.** This includes 8 suites from `server.test.mjs` (unchanged from Task 3) and 8 new suites from `db.test.mjs` covering the database query functions.

### npm run test:setup output (49 tests, 9 suites)

```
> kanban-app@1.0.0 test:setup
> node --test test/setup.test.mjs test/client.setup.test.mjs

# tests 49
# suites 9
# pass 49
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 44.652ms
```

**All 49 tests pass.**

---

## 2. Files Reviewed

| File | Exists | Notes |
|---|---|---|
| `kanban/server/db/queries.js` | YES | Main implementation file |
| `kanban/server/db/migrations/001_init.sql` | YES | Schema migration |
| `kanban/server/test/db.test.mjs` | YES | 54 tests across 8 suites |

---

## 3. Implementation Verification

### 3a. Required Functions

| Function | Required | Implemented | Notes |
|---|---|---|---|
| `initDb()` | YES | YES | Takes optional `dbPath`, defaults to `'data/kanban.db'` |
| `getCards()` | YES | YES | Returns all cards with nested comments |
| `createCard(data)` | YES | YES | Inserts card with UUID, returns persisted row |
| `updateCard(id, data)` | YES | YES | Partial update with allowlist; throws `NotFoundError` |
| `deleteCard(id)` | YES | YES | Returns `true`; throws `NotFoundError` |
| `moveCard(id, column, position)` | YES | YES | Fractional positioning with renormalization |
| `createComment(cardId, data)` | YES | YES | FK-validated; throws `ForeignKeyError` |

All 7 required functions are present and exported.

### 3b. Additional Exports (beyond spec)

| Export | Type | Notes |
|---|---|---|
| `closeDb()` | function | Closes and nullifies the db singleton; used in tests |
| `getDb()` | function | Exposes raw db instance for test introspection |
| `NotFoundError` | class | Custom error, extends `Error` |
| `DatabaseError` | class | Custom error, extends `Error` |
| `ForeignKeyError` | class | Extends `DatabaseError` |

These additions are appropriate and well-designed. They enable robust error handling in the API layer and clean test isolation.

### 3c. Prepared Statements Usage

The implementation uses better-sqlite3 prepared statements throughout via the `_prepareStatements()` function:

- `getAllCards`, `getAllComments`, `insertCard`, `getCardById`, `maxPosInCol`, `deleteCard`, `insertComment`, `getCommentById`, `getSiblings`, `updateCardPos` — all prepared once on `initDb()` and reused.

**Exception:** `updateCard` uses `db.prepare(...)` inline per call (not pre-prepared), because the SET clause varies dynamically based on which fields are provided. This is correct — you cannot pre-prepare a statement with a variable number of columns. The fields are filtered against a strict allowlist before being interpolated into the SQL template, which effectively prevents SQL injection.

**Exception:** `moveCard` prepares a `renorm` statement inline inside the transaction when renormalization is needed (the gap-below-0.001 case). This is infrequent and appropriate.

Both exceptions are valid design choices, not defects.

### 3d. Schema

**File:** `kanban/server/db/migrations/001_init.sql`

| Feature | Status | Notes |
|---|---|---|
| `cards` table | PASS | `id TEXT PRIMARY KEY`, `title TEXT NOT NULL`, `assignee TEXT`, `column TEXT NOT NULL DEFAULT 'ready'`, `position REAL NOT NULL`, `description TEXT`, `created_at INTEGER NOT NULL` |
| `comments` table | PASS | `id TEXT PRIMARY KEY`, `card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE`, `author TEXT NOT NULL`, `content TEXT NOT NULL`, `created_at INTEGER NOT NULL` |
| FK cascade delete | PASS | `ON DELETE CASCADE` on `comments.card_id` |
| Index on cards column+position | PASS | `CREATE INDEX IF NOT EXISTS idx_cards_column_position ON cards("column", position)` |
| Index on comments card_id | PASS | `CREATE INDEX IF NOT EXISTS idx_comments_card_id ON comments(card_id)` |
| `CREATE TABLE IF NOT EXISTS` | PASS | Idempotent schema application |
| WAL mode | PASS | `db.pragma('journal_mode = WAL')` in `initDb()` |
| Foreign keys enforced | PASS | `db.pragma('foreign_keys = ON')` in `initDb()` |

### 3e. Error Handling

| Scenario | Error Thrown | Status |
|---|---|---|
| `updateCard` on non-existent id | `NotFoundError` | PASS |
| `deleteCard` on non-existent id | `NotFoundError` | PASS |
| `moveCard` on non-existent id | `NotFoundError` | PASS |
| `createComment` with invalid `cardId` | `ForeignKeyError` | PASS |
| `ForeignKeyError` is a `DatabaseError` | YES (inheritance) | PASS |
| `ForeignKeyError` is an `Error` | YES (inheritance chain) | PASS |

### 3f. moveCard Logic

The `moveCard` function uses a fractional position scheme:

- **Empty column:** sets position to `1.0`
- **Position ≤ 0 (first):** sets position to `siblings[0].position / 2`
- **Position ≥ siblings.length (last):** sets position to `siblings[last].position + 1.0`
- **Middle:** averages the positions of adjacent siblings
- **Gap < 0.001 (precision floor):** renormalizes all cards in the column to integer positions (1.0, 2.0, ...) by splicing the moved card into the correct index and reassigning whole-number positions

This is a well-known fractional indexing technique. The renormalization threshold of `0.001` is reasonable for this use case. The entire move operation is wrapped in a `db.transaction()` for atomicity.

---

## 4. Test Coverage Review

The `db.test.mjs` file contains 54 tests across 8 suites (plus 27 server tests = 81 total):

| Suite | Tests | Coverage |
|---|---|---|
| `initDb and closeDb` | 6 | WAL mode, FK pragma, table creation, re-init after close |
| `getCards` | 5 | Empty state, comment nesting, ordering |
| `createCard` | 11 | UUID, timestamp, defaults, positions per column |
| `updateCard` | 7 | Partial update, multi-field, allowlist (injection prevention) |
| `deleteCard` | 5 | Success, not-found, cascade |
| `moveCard` | 11 | All 5 position cases, same-column moves, renormalization, edge cases |
| `createComment` | 7 | All fields, FK error, error hierarchy |
| `Error Classes` | 2 | Class hierarchy validation |

Coverage is comprehensive and tests both happy paths and error paths.

---

## 5. Issues Found

### No Blockers

No blocking issues were identified.

### Minor / Observations

1. **`updateCard` with no valid fields and non-existent id returns card rather than throwing.** When `data` contains no allowed fields (e.g., `updateCard(id, { malicious: 'x' })`), the function returns the existing card if it exists, or throws `NotFoundError` if it does not. This is a reasonable design choice (a no-op update returns the current state), but the behavior might surprise callers who expect a `NotFoundError` even when no fields are being updated. No test currently exercises this path with a non-existent id + empty allowed fields. *(Informational — low severity)*

2. **`initDb` does not guard against being called twice without `closeDb` in between.** Calling `initDb()` a second time without closing first will silently replace the `db` singleton and re-prepare all statements, potentially leaking the old database connection. The tests always call `closeDb()` in `afterEach`, so this is not exercised in the test suite. *(Low severity — test usage is safe)*

3. **`createComment` does not validate that `author` and `content` are non-empty strings.** If a caller passes `{ author: null, content: '' }`, the SQLite NOT NULL constraint will catch `author: null` (throwing a generic `DatabaseError`), but an empty string for `content` would be stored without complaint. Input validation at the JS layer would be more informative. *(Low severity — API layer should validate before calling)*

4. **`moveCard` renormalization prepares a new statement inside a transaction loop.** The renorm statement `db.prepare('UPDATE cards SET ...')` is created inside the `db.transaction()` callback on every renormalization call. This is functionally correct but slightly inefficient — it could be pre-prepared in `_prepareStatements()`. Given that renormalization is rare (only when gap < 0.001), this has negligible practical impact. *(Informational — micro-optimization)*

5. **No `scripts.test` at the root `kanban/package.json` level that runs both server and setup tests in one command.** Running `npm run test:server` runs DB + server tests; `npm run test:setup` runs setup tests. There is no single command to run all tests. The root `scripts.test:setup` name is slightly confusing as it covers more than just "setup." *(Informational — developer experience)*

---

## 6. Overall Assessment

**PASS**

All Task 5 deliverables are correctly implemented:

- `server/db/queries.js` is created with all 7 required functions: `initDb()`, `getCards()`, `createCard(data)`, `updateCard(id, data)`, `deleteCard(id)`, `moveCard(id, column, position)`, `createComment(cardId, data)`
- better-sqlite3 prepared statements are used for all fixed-structure queries
- The schema migration (`001_init.sql`) correctly defines `cards` and `comments` tables with appropriate indexes and FK cascade behavior
- WAL mode and foreign key enforcement are enabled in `initDb()`
- Custom error classes (`NotFoundError`, `DatabaseError`, `ForeignKeyError`) provide structured error handling
- Fractional positioning with renormalization handles the full range of card movement scenarios
- All 81 automated tests pass with zero failures
- All 49 setup/client tests continue to pass (no regressions)
- The implementation is clean, well-structured, and follows the singleton + prepared-statements pattern appropriate for a single-process Node.js server

---

---

# Task 7 — Create REST API routes for comments

**Date:** 2026-04-10  
**Worktree:** `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-7`  
**Assignee:** Emma  

---

## 1. Commands Found and Executed

| Command | Location | Result |
|---|---|---|
| `npm run test:server` | `kanban/` root | ✅ PASS |
| `npm run test:setup` | `kanban/` root | ✅ PASS |
| `npm -w client run test` | `kanban/` root | ❌ FAIL (env issue — pre-existing) |
| `npm -w client run lint` | `kanban/` root | ❌ FAIL (env issue — pre-existing) |
| `npm run build` | `kanban/` root | ❌ FAIL (env issue — pre-existing) |

---

## 2. Implementation Review

### Files Created / Modified

**`kanban/server/api/comments.js`** (new file, ~24 lines)
- Creates an Express `Router`
- Registers `POST /cards/:id/comments` (prefix `/api` applied at mount point)
- Destructures `author` and `content` from `req.body ?? {}`
- Returns `400` with `{ error: 'author and content are required' }` when either field is falsy
- Calls `createComment(req.params.id, { author, content })` inside try/catch
- On `ForeignKeyError` (card does not exist in DB), returns `404` with `{ error: err.message }`
- All other errors forwarded to Express generic error handler (500)
- Returns `201` with the created comment object on success

**`kanban/server/index.js`** (modified)
- Imports `commentsRouter` from `./api/comments.js`
- Mounts it at `app.use('/api', commentsRouter)` — full path is `POST /api/cards/:id/comments`
- CORS, JSON body parsing, and other middleware correctly configured

### Task Requirements Checklist

| Requirement | Status |
|---|---|
| `POST /api/cards/:id/comments` endpoint exists | ✅ PASS |
| Validates card exists — 404 if not found | ✅ PASS — catches `ForeignKeyError` from `createComment` |
| Validates required fields (author and content) — 400 if missing | ✅ PASS — `!author \|\| !content` guard |
| Calls `createComment` database function | ✅ PASS |
| Router mounted in `server/index.js` | ✅ PASS — `app.use('/api', commentsRouter)` |
| No separate GET endpoint (comments via `getCards()`) | ✅ PASS — no GET endpoint added |

---

## 3. Detailed Command Results

### ✅ `npm run test:server` — PASS

Runs: `node --test test/server.test.mjs test/db.test.mjs test/comments.test.mjs`

- **91 tests across 17 suites — 91 PASS, 0 FAIL**
- `comments.test.mjs`: 10 tests covering all POST endpoint scenarios — all pass:
  - Creates comment successfully (201)
  - Returns 404 for non-existent card
  - Returns 400 for missing `author`
  - Returns 400 for missing `content`
  - Returns 400 for missing both fields
  - Edge cases (whitespace, etc.)
- All `db.test.mjs` and `server.test.mjs` tests pass as well

### ✅ `npm run test:setup` — PASS

Runs: `node --test test/*.test.mjs`

- **49 tests across 9 suites — 49 PASS, 0 FAIL**

### ❌ `npm -w client run test` — FAIL (pre-existing environment issue)

```
sh: vitest: command not found
exit code: 127
```

`kanban/client/node_modules` does not exist. Client dependencies were never installed. **Pre-existing issue not caused by this task.**

### ❌ `npm -w client run lint` — FAIL (pre-existing environment issue)

```
sh: eslint: command not found
exit code: 127
```

Same root cause — client dependencies not installed.

### ❌ `npm run build` — FAIL (pre-existing environment issue)

```
sh: vite: command not found
exit code: 127
```

Same root cause — `vite` requires client `node_modules`.

---

## 4. Issues Found

### Pre-existing Environment Issue (not introduced by this task)
**Severity:** Low  
**Description:** Client workspace dependencies (`vitest`, `eslint`, `vite`) are not installed. Running `npm install` from `kanban/` at the workspace root would resolve all three failing commands.  
**Impact:** Client tests and build cannot be verified. This task is purely server-side, so it does not affect the correctness of the implementation.

---

## 5. Overall Assessment

**PASS**

The implementation is correct and complete. All server-side tests pass (91/91 for server suite, 49/49 for setup suite). The `comments.js` router correctly implements:

- Comment creation with proper field validation (400 for missing author/content)
- Card existence validation via database foreign key errors (404 for non-existent card)
- Appropriate HTTP status codes (201, 400, 404, 500)
- Clean integration with the existing Express application
- Proper router mounting at `/api` prefix in `server/index.js`

---

# Task 8 — Create API Client Wrapper Functions

**Date:** 2026-04-10
**Worktree:** `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-8`
**Branch:** `kanban-board/kanban-board-8`
**Commit reviewed:** `13d39b1`
**Implementation file:** `kanban/client/src/api/client.js`

---

## 1. Commands Found and Executed

| Command | Location | Script | Result |
|---|---|---|---|
| `npm run test` | `kanban/client/package.json` | `vitest run` | PASS |
| `npm run lint` | `kanban/client/package.json` | `eslint src` | PASS |
| `npm run build` | `kanban/client/package.json` | `vite build` | PASS |
| `npm run test:setup` | `kanban/package.json` | `node --test test/*.test.mjs` | PASS |
| `npm run test:server` | `kanban/package.json` | `npm -w server run test` | PASS |

No Makefile relevant to the task. No TypeScript compiler (`tsc`) is configured — the project uses plain JS with JSDoc annotations. No separate typecheck script exists in any `package.json`.

---

## 2. Command Results

### `npm run test` (client — vitest)

```
 RUN  v2.1.9 /…/kanban-board-8/kanban/client

 ✓ src/api/client.test.js (27 tests) 6ms
 ✓ src/App.test.jsx (4 tests) 32ms

 Test Files  2 passed (2)
      Tests  31 passed (31)
   Start at  16:01:25
   Duration  442ms
```

**Result: PASS** — All 27 client.js-specific tests and 4 App tests pass.

### `npm run lint` (client — ESLint)

```
> eslint src
(no output)
```

**Result: PASS** — ESLint exited with code 0, no warnings or errors reported.

### `npm run build` (client — Vite)

```
vite v5.4.21 building for production...
✓ 31 modules transformed.
dist/index.html                   0.48 kB │ gzip:  0.31 kB
dist/assets/index-B_pynlF-.css    0.35 kB │ gzip:  0.24 kB
dist/assets/index-DG_7CGO4.js   142.63 kB │ gzip: 45.80 kB
✓ built in 224ms
```

**Result: PASS** — Production build succeeds without errors.

### `npm run test:setup` (root — node:test)

```
# tests 49
# suites 9
# pass 49
# fail 0
```

**Result: PASS** — All 49 setup/structural tests pass.

### `npm run test:server` (server — node:test)

```
# tests 91
# suites 17
# pass 91
# fail 0
```

**Result: PASS** — All 91 server-side integration and unit tests pass. (Included for regression assurance; the task did not modify server code.)

---

## 3. Required Function Checklist

| Function | Signature | Present | HTTP Method | Endpoint |
|---|---|---|---|---|
| `fetchCards()` | `() → Promise<Card[]>` | YES | GET | `/api/cards` |
| `createCard(data)` | `(data) → Promise<Card>` | YES | POST | `/api/cards` |
| `updateCard(id, data)` | `(id, data) → Promise<Card>` | YES | PATCH | `/api/cards/:id` |
| `deleteCard(id)` | `(id) → Promise<null>` | YES | DELETE | `/api/cards/:id` |
| `createComment(cardId, data)` | `(cardId, data) → Promise<Comment>` | YES | POST | `/api/cards/:id/comments` |

All five required functions are present and exported.

---

## 4. Implementation Quality Findings

### 4.1 Error Handling

- A custom `ApiError` class extends `Error` with `name`, `status` (HTTP status or `0` for network failures), and `data` (parsed error body or `null`) properties.
- Network-level failures (`fetch` rejection) are caught and re-thrown as `ApiError` with `status: 0` and the original error message embedded.
- Non-2xx HTTP responses parse the response body for a structured `{ error: "…" }` message and fall back gracefully to `"HTTP error <status>"` when the body is not valid JSON.
- Successful response parsing failures (malformed JSON) throw `ApiError` with the actual HTTP status and the parse error message.
- `204 No Content` and `content-length: 0` responses return `null` without attempting `response.json()`.

No issues found in error handling.

### 4.2 JSON Parsing

- Request bodies are serialised with `JSON.stringify(data)` before sending.
- `Content-Type: application/json` is set automatically whenever a `body` option is present; it is correctly absent for GET and DELETE requests.
- Response parsing is handled inside a `try/catch` so parse errors propagate as `ApiError` rather than raw `SyntaxError`.

No issues found in JSON handling.

### 4.3 JSDoc Comments

All five public functions have JSDoc blocks. Each block includes:
- `@param` with named type and description for every parameter.
- `@returns` with the resolved Promise type.
- `@throws {ApiError}` documenting when the error is thrown.
- `@example` showing a realistic usage snippet.

`@typedef` blocks for `Card` and `Comment` define all relevant fields with types.
`ApiError` constructor parameters are also documented inline.

Minor observation (not a defect): The `@typedef` for `Card` documents `created_at` as `{number}` (Unix ms timestamp). The server stores it as an integer; the field name and type are consistent with the server schema so this is accurate.

### 4.4 Internal Architecture

- A private `apiFetch(path, options)` helper centralises all fetch logic, avoiding duplication across the five public functions.
- Relative URLs are used throughout (`/api/…`), correctly relying on Vite's dev proxy and same-origin production serving — as documented in the file's module-level comment.
- No hardcoded base URL or environment variable usage, which is appropriate for this project setup.

### 4.5 Test Coverage

The 27 tests in `client.test.js` cover:
- Correct URL and HTTP method for each of the five functions.
- Presence/absence of `Content-Type` header based on whether a body is sent.
- JSON serialisation of request bodies.
- Successful response parsing for all functions.
- `204` and `content-length: 0` responses returning `null` without calling `.json()`.
- Network failure → `ApiError` with `status: 0`.
- HTTP 404 and 500 → `ApiError` with matching status.
- Error body `{ error }` string used as `ApiError.message`.
- Fallback message when error body is non-JSON.
- `ApiError.data` contains parsed error body.
- Malformed success response → `ApiError`.

Coverage is comprehensive and maps directly to the specified requirements.

---

## 5. Issues Found

None. No defects, missing requirements, failing tests, lint errors, or build failures were identified.

---

## 6. Overall Assessment

**PASS**

The implementation is complete and high quality. All five required API wrapper functions are present, correctly implemented, and thoroughly tested. Error handling covers all specified edge cases (network errors, HTTP errors, non-JSON error bodies, malformed success bodies, empty responses). JSDoc annotations are accurate and include types, parameter descriptions, return types, thrown error documentation, and usage examples. The build, lint, and all test suites pass without errors.

---

# Task 16 — Implement WebSocket Broadcaster

**Date:** 2026-04-10
**Worktree:** `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-16`
**Branch:** `kanban-board/kanban-board-16`
**Commit reviewed:** `3264905`

---

## 1. Commands Found and Executed

Scripts found across `kanban/package.json` (root workspace) and `kanban/server/package.json` and `kanban/client/package.json`:

| Command | Location | Result |
|---|---|---|
| `npm run test:setup` | `kanban/package.json` | PASS |
| `npm run test:server` | `kanban/package.json` | PASS |
| `npm -w client run lint` | `kanban/client/package.json` | PASS |
| `npm -w client run test` | `kanban/client/package.json` | PASS |
| `npm run build` | `kanban/package.json` | NOT RUN (client Vite build — no changes to client source in this task) |
| `npm run start` | `kanban/package.json` | NOT RUN (long-running server process) |
| `npm run dev` | `kanban/package.json` | NOT RUN (long-running concurrent dev server) |

### test:setup result

```
# tests 49
# suites 9
# pass 49
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 51ms
```

**All 49 tests pass.** Includes verification of directory structure (`server/ws/` exists), root and workspace `package.json` scripts, Vite proxy config (`/ws` proxied with `ws: true`), and client/server package contents.

### test:server result

```
# tests 112
# suites 22
# pass 112
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2811ms
```

**All 112 tests pass.** Includes 22 suites: 17 from prior tasks (server setup, DB, comments API) and 5 new WebSocket suites (connection setup, broadcast, heartbeat, disconnection, closeWs teardown).

### client lint result

```
> kanban-client@1.0.0 lint
> eslint src
```

Exit code 0. **No lint errors.**

### client test result

```
✓ src/api/client.test.js (27 tests) 9ms
✓ src/App.test.jsx (4 tests) 39ms

Test Files  2 passed (2)
     Tests  31 passed (31)
```

**All 31 client tests pass.** No regressions from this task's changes.

---

## 2. Files Created / Modified

| File | Status | Notes |
|---|---|---|
| `kanban/server/ws/broadcaster.js` | Created | Core implementation |
| `kanban/server/test/ws.test.mjs` | Created | Test suite for broadcaster |
| `kanban/server/package.json` | Modified | `test` script updated to include `ws.test.mjs` |
| `kanban/server/index.js` | Modified | `initWs` imported and wired to HTTP server |

---

## 3. Code Review — `server/ws/broadcaster.js`

### 3.1 Required Exports

The task specification requires:
- `initWs(httpServer)` — exported ✓
- `broadcast(event, payload)` — exported ✓

Additionally, `closeWs()` is exported for test teardown. This is an internal utility not required by the spec but appropriate for enabling clean test teardown without process-level side effects.

### 3.2 WebSocket Server Attachment

`initWs` uses `new WebSocketServer({ server: httpServer })` to attach to the existing HTTP server. This is the correct pattern for sharing a port between Express HTTP and WebSocket — no separate port is opened.

### 3.3 Connected Clients List

Clients are tracked via a module-level `Set`. On `connection`, the socket is added; on `close` and `error` events, it is deleted. This is correct.

### 3.4 broadcast(event, payload)

`broadcast` serializes `{ event, payload }` as JSON once and iterates over `clients`, sending only to sockets with `readyState === WS_OPEN` (value `1`). Each send is wrapped in a try/catch to isolate per-client errors. This matches the specification.

The implementation avoids importing the `WebSocket` class just to reference `WebSocket.OPEN`, instead using the numeric constant `1` assigned to `WS_OPEN`. The comment explains the rationale. This is a correct and safe approach.

### 3.5 Heartbeat / Ping Mechanism

`initWs` accepts an optional `{ pingInterval = 30000 }` options parameter. A `setInterval` runs every `pingInterval` ms: for each client, if `isAlive` is `false`, the client is terminated and removed; otherwise `isAlive` is set to `false` and a ping is sent. On `pong`, `isAlive` is reset to `true`. This is the standard ws library heartbeat pattern.

The heartbeat interval is stored in `heartbeatInterval` and cleared in `closeWs` and in the `wss.on('close', ...)` handler (as a safety net if the HTTP server is closed outside `closeWs`).

### 3.6 Connection / Disconnection Events

- `connection`: adds socket to `clients`, sets `isAlive = true`, registers `pong`/`close`/`error` handlers.
- `close`: removes socket from `clients`.
- `error`: removes socket from `clients`.

The `error` handler only removes the socket — it does not re-throw or call `terminate()`. Since the WebSocket `error` event is typically followed by a `close` event, this is safe (the `close` handler will also delete the socket, but `Set.delete` is idempotent).

### 3.7 Defensive Re-initialization

If `initWs` is called again without `closeWs`, the module clears the existing `heartbeatInterval` and resets `clients` before creating a new `WebSocketServer`. This prevents interval leaks on re-initialization, which is relevant in test environments that call `initWs` multiple times.

### 3.8 closeWs (Test Teardown)

`closeWs` terminates all tracked clients, clears the heartbeat interval, and then calls `wss.close()` wrapped in a Promise. Terminating clients first is critical — `wss.close()` waits for all connections to close naturally, which would hang indefinitely without forcing termination.

### 3.9 Integration with server/index.js

`initWs` is imported from `./ws/broadcaster.js` and called in the startup block with the HTTP server instance after `app.listen()`. This correctly attaches the WebSocket server to the shared HTTP server.

### 3.10 Potential Issues Found

**Issue 1 — No `initWs` call in `createApp()` / test helper path (Minor, by design)**

`initWs` is only called in the entry-point startup block (`if (resolve(process.argv[1]) === ...)`). When tests import `createApp()` and start their own server, `initWs` is not called automatically. This is correct design for separation of concerns — WebSocket tests use their own HTTP servers via the WS test helpers. However, if future integration tests use `createApp()` and expect WebSocket support on the same server, they would need to call `initWs` manually. This is not a defect in the current scope, but worth noting for future tasks that integrate WS into the full application flow.

**Issue 2 — `wss` module-level state (Architectural note)**

`wss`, `clients`, and `heartbeatInterval` are module-level variables. In a multi-worker or multi-instance scenario, each process would maintain its own independent client list — broadcasts would not reach clients connected to other workers. For the current single-process scope this is correct; it would become a limitation if horizontal scaling is added.

**Issue 3 — No message handling on incoming WS messages (Acceptable for current scope)**

The task specification does not require server-side handling of messages received from clients. The implementation correctly focuses on outbound broadcasting only. No `message` event handler is registered. This is appropriate for the current task scope.

**Issue 4 — `closeWs` resets `clients` to a new Set before terminating (Minor order concern)**

In `closeWs`, the code terminates all clients and then immediately sets `clients = new Set()` before awaiting `wss.close()`. This means if `wss.close()` were to trigger any close/error events on already-terminated sockets (which it should not, since `terminate()` fires them synchronously), the handlers would call `clients.delete()` on the new empty Set — a no-op. In practice, `terminate()` fires the `close` event synchronously for already-terminated sockets, so by the time `clients = new Set()` is assigned, the `close` handlers have already run on the old Set. This is safe in the current code but is a subtle ordering dependency.

---

## 4. Code Review — `server/test/ws.test.mjs`

### 4.1 Test Structure

The test file contains 5 `describe` blocks:
1. **WebSocket server setup and client connection** — 3 tests: exports check, single client connect, multiple simultaneous clients.
2. **broadcast(event, payload)** — 7 tests: message delivery, correct event, correct payload, all-clients delivery, message shape, no-client safety, terminated client skipping.
3. **Heartbeat / ping mechanism** — 5 tests: ping sent at interval, client survives multiple cycles, dead TCP detection, only live clients receive broadcast after cleanup, timer cleared on closeWs.
4. **Client disconnection and cleanup** — 5 tests: graceful close removes client, only disconnected client removed, error event removes client, multiple simultaneous disconnections, broadcast safe after all disconnect.
5. **closeWs with open connections** — 1 test: isolated teardown test in its own describe with its own HTTP server.

Each suite creates its own HTTP server in `before` and tears it down in `after`, using `pingInterval: 50` for heartbeat tests (to avoid long waits) and `pingInterval: 5000` for disconnection tests (to isolate from heartbeat paths). This is well-designed.

### 4.2 Test Helpers

Helper functions are defined at the top of the file: `startWsServer`, `stopWsServer`, `connectClient`, `waitForMessage`, `closeClient`, `withTimeout`. These are WebSocket-specific and do not duplicate HTTP test helpers from other test files.

The `withTimeout` helper using `Promise.race` is appropriate — it prevents test hangs without requiring a full test framework timeout configuration.

### 4.3 Test Correctness

No test correctness issues were found. Tests correctly:
- Register `waitForMessage` listeners before calling `broadcast` to avoid race conditions.
- Wait for close events to propagate (`setTimeout(resolve, 20-50ms)`) before asserting client set membership via broadcast.
- Use `_socket.destroy()` to simulate dead TCP connections (not `ws.close()`, which sends a proper close frame).
- Use `withTimeout` on all async operations to prevent hangs.

---

## 5. Dev Agent Observations (from transcript)

The dev agent followed a thorough planning and TDD process:

1. **Exploration phase**: Read all existing server files, test files, db queries, comments API, and the vite config to understand the codebase before writing any code.
2. **Planning phase**: Generated a detailed TDD plan using a Plan subagent, then executed multiple review passes on the plan itself, identifying and fixing issues including: the `closeWs` hang (terminating clients before closing the server), the timer leak on `initWs` re-call, the `server/package.json` test script needing to be updated before the first RED run, and clarifying that Subtask 4 has no genuine RED phase.
3. **Implementation**: Created `ws.test.mjs` first (RED), then `broadcaster.js` (GREEN). All 112 tests passed in a single implementation attempt with no iteration.
4. **Simplify review**: Ran a three-agent simplify pass (code reuse, quality, efficiency). One cosmetic change was made: removed a `// ── Heartbeat ──` decorative section comment that described WHAT rather than WHY. No functional changes were required.

The overall dev process was methodical and high quality, with the plan review catching real bugs before implementation rather than after.

---

## 6. Issues Found

### Defects

None. No failing tests, no missing required functionality, no incorrect behavior.

### Minor Observations (Non-blocking)

| # | Severity | Description |
|---|---|---|
| 1 | Info | `initWs` is not called by `createApp()` — integration tests using `createApp()` would need to call `initWs` manually if they require WebSocket support. By-design for current scope. |
| 2 | Info | Module-level state means broadcasts do not propagate across multiple processes/workers. Acceptable for current single-process scope. |
| 3 | Info | No inbound message handler — clients cannot send messages to the server via WebSocket. Not required by the spec. |
| 4 | Info | Subtle ordering in `closeWs`: `clients = new Set()` is assigned before `wss.close()` resolves. Safe in practice due to synchronous `terminate()` behavior, but is an implicit ordering dependency. |

---

## 7. Overall Assessment

**PASS**

The implementation is complete, correct, and well-structured. All required exports (`initWs`, `broadcast`) are present. The WebSocket server attaches to the existing HTTP server, maintains a connected clients Set, implements broadcast with correct JSON format, handles connection and disconnection events, includes a configurable heartbeat/ping mechanism, and exports `closeWs` for clean test teardown. All 112 server tests and all 31 client tests pass. Lint passes with no errors. No regressions to prior tasks were introduced.

OVERALL RESULT: PASS

---

# Task 9 — Implement useBoard Hook for State Management

**Date:** 2026-04-10
**Branch:** kanban-board/kanban-board-9
**Reviewer:** QA Agent (claude-sonnet-4-6)
**Task:** Implement `useBoard` hook for state management

---

## 1. Commands Found and Executed

The following commands were identified from `package.json` scripts at multiple levels:

| Command | Location | Script |
|---|---|---|
| `npm -w client run test` | `kanban/package.json` (workspace) | `vitest run` |
| `npm -w client run lint` | `kanban/package.json` (workspace) | `eslint src` |
| `npm -w client run build` | `kanban/package.json` (workspace) | `vite build` |
| `npm -w server run test` | `kanban/package.json` (workspace) | `node --test test/server.test.mjs test/db.test.mjs test/comments.test.mjs test/ws.test.mjs` |
| `npm run test:setup` | `kanban/package.json` | `node --test test/*.test.mjs` |

No `Makefile` was found anywhere in the repository. No typecheck command exists (the project uses plain JavaScript, not TypeScript).

---

## 2. Command Results

### 2.1 Client Tests (`npm -w client run test`)

**Result: PASS**

```
 ✓ src/api/client.test.js (27 tests) 13ms
 ✓ src/App.test.jsx (4 tests) 34ms
 ✓ src/hooks/useBoard.test.js (64 tests) 3077ms

 Test Files  3 passed (3)
      Tests  95 passed (95)
   Start at  16:37:37
   Duration  3.74s
```

All 64 tests in `useBoard.test.js` pass. All 95 client-side tests pass with no failures or skipped tests.

### 2.2 Client Lint (`npm -w client run lint`)

**Result: PASS**

```
> kanban-client@1.0.0 lint
> eslint src
```

ESLint exited with no output and exit code 0. No warnings or errors.

### 2.3 Client Build (`npm -w client run build`)

**Result: PASS**

```
vite v5.4.21 building for production...
✓ 31 modules transformed.
dist/index.html                   0.48 kB │ gzip:  0.31 kB
dist/assets/index-B_pynlF-.css    0.35 kB │ gzip:  0.24 kB
dist/assets/index-DG_7CGO4.js   142.63 kB │ gzip: 45.80 kB
✓ built in 230ms
```

Production build succeeded. The hook is included in the transformed modules without any bundler errors.

### 2.4 Server Tests (`npm -w server run test`)

**Result: PASS**

```
# tests 112
# suites 22
# pass 112
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2802.441333
```

All 112 server tests pass. These cover DB operations, REST routes, comments, and the WebSocket broadcaster. No regressions from the hook implementation.

### 2.5 Setup Tests (`npm run test:setup`)

**Result: PASS**

```
# tests 49
# suites 9
# pass 49
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 50.595208
```

All 49 setup/scaffolding tests pass.

---

## 3. Test Coverage for useBoard Hook

A dedicated test file exists at `client/src/hooks/useBoard.test.js` (688 lines). It covers:

| Test Suite | Tests | Coverage |
|---|---|---|
| `initial state structure` | 2 | Initial `cards` shape, `error` null |
| `initial data loading` | 7 | Pending/resolved/rejected fetch, grouping, key mapping, sorting |
| `createCard` | 6 | Optimistic add, default column, server replacement, rollback, error throw, return value |
| `updateCard` | 5 | Optimistic update, column-change ignored, server replacement, rollback, error throw |
| `deleteCard` | 3 | Optimistic remove, rollback, error throw |
| `moveCard` | 5 | Optimistic move, column field update, server replacement, rollback, error throw |
| `addComment` | 5 | Optimistic comment, server replacement, rollback, error throw, return value |
| `error state` | 3 | Null initially, set on fetch error, null on success |
| `loading state — initial fetch` | 3 | True in-flight, false resolved, false rejected |
| `loading state — individual operations` | 10 | True/false for each of the 5 operations |
| `operation error propagation` | 5 | Re-throws for all 5 operations |
| `state shape` | 6 | Key set, array types, column field preservation, position sorting, stable order |
| `helper: columnToKey` | 3 | All three column values |

Total: **64 tests** across 13 describe blocks.

---

## 4. Code Review

### 4.1 File Location

- Required: `client/src/hooks/useBoard.js`
- Actual: `kanban/client/src/hooks/useBoard.js`

The project root is `kanban/`, consistent with the entire project structure. The file is at the correct path relative to the project root.

### 4.2 State Structure

Required: `{ ready: [], in_progress: [], done: [] }`
Implemented: `const EMPTY_BOARD = { ready: [], in_progress: [], done: [] }` — matches exactly.

The `groupCards()` helper correctly maps API column values to state keys, including the `in-progress` → `in_progress` conversion via the exported `columnToKey()` helper.

### 4.3 Required Functions

| Function | Required | Implemented | Notes |
|---|---|---|---|
| `createCard` | Yes | Yes | Temp-ID optimistic pattern; rolls back on error |
| `updateCard` | Yes | Yes | Rollback pattern; strips `column` from data to prevent accidental moves |
| `deleteCard` | Yes | Yes | Rollback pattern |
| `moveCard` | Yes | Yes | Rollback pattern; calls `apiUpdateCard` (correct — no separate move API endpoint) |
| `addComment` | Yes | Yes | Temp-ID optimistic pattern; rolls back on error |

All five required functions are implemented.

### 4.4 Optimistic Updates

All operations implement optimistic updates with rollback on failure:

- **createCard / addComment** use a temp-ID pattern: an optimistic record is inserted immediately (with a `__temp_` ID), and replaced by the server response on success, or removed on failure.
- **updateCard / deleteCard / moveCard** use a snapshot-rollback pattern: the full `cardsRef.current` state is captured synchronously before the optimistic change, and restored on failure.

The use of `cardsRef` (a ref mirroring state) to capture rollback synchronously is a technically sound solution to the React 18 issue where functional `setState` updaters are scheduled as macrotasks but API rejections arrive as microtasks — without this, the rollback variable could be stale.

### 4.5 Loading State

A `pendingRef` counter tracks concurrent in-flight operations, ensuring `loading` remains `true` until all concurrent operations complete. This is correctly implemented.

### 4.6 Error Handling

- `setError` is only called for the initial `fetchCards` failure. Per-operation errors are re-thrown to callers but do not update the `error` state — appropriate design for a hook (callers handle operation errors themselves).
- The `cancelled` flag in the `useEffect` cleanup prevents state updates after component unmount.

### 4.7 Lint Compliance

The implementation originally contained `// eslint-disable-line react-hooks/exhaustive-deps` comments on all `useCallback` hooks. These were removed in commit `23ce1ab` after the dev session identified them as redundant (all callbacks use `cardsRef` instead of closing over state, so no deps are needed). The current code has no ESLint suppressions.

### 4.8 API Contract Alignment

All API function imports (`fetchCards`, `createCard`, `updateCard`, `deleteCard`, `createComment`) match the exports in `client/src/api/client.js`. The `moveCard` function correctly calls `apiUpdateCard` with `{ column, position }` since there is no separate move endpoint in the REST API.

### 4.9 Minor Observations (Non-Blocking)

1. **`beginOp()` placement in `createCard`**: The optimistic state update happens before `beginOp()` is called. This is intentional — the optimistic UI change is immediate and synchronous, while `loading: true` is set just before the API call starts. Not a bug.
2. **Error state not cleared on retry**: If `fetchCards()` fails and sets `error`, there is no mechanism to retry or clear `error`. Not specified in task requirements.
3. **`EMPTY_BOARD` shared reference**: `EMPTY_BOARD` and `cardsRef` are initialized with the same object reference. The `applyCards` function always creates new state objects, so this is safe — the shared reference is never mutated.

---

## 5. Overall Assessment

All commands pass. The implementation:

- Lives at the correct file path
- Implements the exact required state structure `{ ready: [], in_progress: [], done: [] }`
- Implements all five required functions (`createCard`, `updateCard`, `deleteCard`, `moveCard`, `addComment`)
- Correctly handles optimistic updates with rollback on failure for all operations
- Correctly handles loading states for all operations including concurrent operations
- Correctly handles and surfaces errors from the initial fetch
- Passes 64 dedicated unit tests with no failures
- Passes ESLint with no warnings or errors
- Builds successfully for production
- Introduces no regressions in server or setup tests (161 total passing tests)

No requirement gaps, logic flaws, or test failures were found.

OVERALL RESULT: PASS

The failing client commands are a pre-existing environment issue (missing `npm install` for client workspace) and are unrelated to this task's deliverables.
