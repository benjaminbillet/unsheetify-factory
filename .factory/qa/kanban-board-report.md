# QA Report — Task 20: Create Docker Configuration

**Date:** 2026-04-10  
**Worktree:** `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-20`  
**Reviewer role:** QA Engineer (read-only, no fixes applied)  
**Overall Result:** ✅ PASS

---

## 1. Project Structure Overview

```
kanban/
├── Dockerfile               ← NEW (Task 20)
├── docker-compose.yml       ← NEW (Task 20)
├── .dockerignore            ← NEW (Task 20)
├── package.json             # Workspace root (workspaces: client, server)
├── client/                  # Vite + React SPA
│   └── src/
├── server/                  # Express + SQLite (better-sqlite3)
│   ├── api/
│   ├── db/
│   ├── ws/
│   └── test/
└── test/                    # Root workspace structural tests
```

---

## 2. Commands Found and Executed

| # | Command | Source | Result |
|---|---------|--------|--------|
| 1 | `npm -w client run lint` | `client/package.json` → ESLint | ✅ PASS |
| 2 | `npm run build` | root `package.json` → Vite production build | ✅ PASS |
| 3 | `npm -w client run test` | `client/package.json` → Vitest | ✅ PASS |
| 4 | `npm run test:server` | root `package.json` → Node built-in runner | ✅ PASS |
| 5 | `npm run test:setup` | root `package.json` → structural tests | ✅ PASS |

No `Makefile` found. No TypeScript typecheck script (project uses plain JS/JSX, no `tsconfig.json`).

---

## 3. Command Results

### 3.1 `npm -w client run lint` — ✅ PASS

Exit code 0. No ESLint errors or warnings.

---

### 3.2 `npm run build` — ✅ PASS

Exit code 0. Vite production build completed successfully.

```
vite v5.4.21 building for production...
✓ 558 modules transformed.
dist/index.html                     0.48 kB │ gzip:   0.31 kB
dist/assets/index-BZa6x_DO.css     29.84 kB │ gzip:   6.03 kB
dist/assets/module-BvCTiNll.js     77.23 kB │ gzip:  27.78 kB
dist/assets/native-B5Vb9Oiz.js    380.35 kB │ gzip:  82.06 kB
dist/assets/index-dV7-MwWi.js   1,354.66 kB │ gzip: 418.79 kB

(!) Some chunks are larger than 500 kB after minification.
✓ built in 1.60s
```

The large-chunk warning (~1.35 MB) is expected from the bundled BlockNote/ProseMirror/Tiptap dependencies. This is a warning only — exit code is 0.

---

### 3.3 `npm -w client run test` — ✅ PASS

```
 Test Files  11 passed (11)
      Tests  365 passed (365)
   Start at  18:30:51
   Duration  5.85s
```

All 365 tests pass across 11 test files. Notable results:

| File | Tests | Result |
|------|-------|--------|
| `src/api/client.test.js` | 27 | ✅ |
| `src/hooks/useWebSocket.test.js` | 42 | ✅ |
| `src/components/Board/Column.test.jsx` | 8 | ✅ |
| `src/components/CardModal/CommentList.test.jsx` | 32 | ✅ |
| `src/components/CreateCardForm.test.jsx` | 33 | ✅ |
| `src/components/CardModal/BlockEditor.test.jsx` | 32 | ✅ |
| `src/components/Board/Board.test.jsx` | 17 | ✅ |
| `src/components/Board/CardTile.test.jsx` | 9 | ✅ |
| `src/components/Board/CardModal.test.jsx` | 60 | ✅ |
| `src/App.test.jsx` | 4 | ✅ |
| `src/hooks/useBoard.test.js` | 101 | ✅ |

**Warnings (pre-existing, not introduced by Task 20):** 4 tests in `src/hooks/useBoard.test.js` emit React `act(...)` warnings to stderr. These do not cause failures and originate from code not changed by this task.

---

### 3.4 `npm run test:server` — ✅ PASS

```
# tests 148
# suites 28
# pass 148
# fail 0
# duration_ms 2831.584542
```

All 148 server tests pass across 28 suites.

---

### 3.5 `npm run test:setup` — ✅ PASS

```
# tests 76
# suites 13
# pass 76
# fail 0
# duration_ms 60.810416
```

All 76 structural/scaffold tests pass. This suite includes dedicated Docker-specific tests:

**Dockerfile suite (13 tests — all pass):**
- Dockerfile exists
- Uses `node:20-alpine` as base image
- Has named build stage (`FROM node:20-alpine AS build`)
- Has named runtime stage (`FROM node:20-alpine AS runtime`)
- Installs native build tools in build stage (`apk add python3`)
- Runs `npm run build` in build stage
- Prunes devDependencies before copying to runtime
- Copies pre-built `node_modules` from build stage into runtime
- Copies `client/dist` from build stage into runtime
- EXPOSEs port 3000
- Sets `NODE_ENV=production`
- Sets `PORT=3000`
- Runs as a non-root user (`USER` directive present)

**docker-compose.yml suite (9 tests — all pass):**
- `docker-compose.yml` exists
- Defines an `app` service
- Maps port `3000:3000`
- Defines a named volume for data persistence
- Mounts named volume into `/app/data`
- Sets `NODE_ENV=production`
- Sets `PORT=3000`
- Sets `DB_PATH` explicitly to `/app/data/kanban.db`
- Has a restart policy

**.dockerignore suite (4 tests — all pass):**
- `.dockerignore` exists
- Excludes `node_modules`
- Excludes `.git`
- Excludes `client/dist`

---

## 4. Docker Files Review

### 4.1 Dockerfile

#### Stage 1 — `FROM node:20-alpine AS build`

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Node 20 Alpine base | `FROM node:20-alpine AS build` | ✅ |
| Native build tools for `better-sqlite3` | `RUN apk add --no-cache python3 make g++` | ✅ |
| Layer cache optimization | Copies manifests before source | ✅ |
| Install all deps | `RUN npm ci` | ✅ |
| Build client with Vite | `RUN npm run build` (produces `client/dist/`) | ✅ |
| Prune devDeps before runtime copy | `RUN npm prune --omit=dev` | ✅ |

#### Stage 2 — `FROM node:20-alpine AS runtime`

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Node 20 Alpine base | `FROM node:20-alpine AS runtime` | ✅ |
| Copy pruned `node_modules` | `COPY --from=build /app/node_modules` | ✅ |
| Copy server source | `COPY server/ ./server/` | ✅ |
| Copy built client assets | `COPY --from=build /app/client/dist ./client/dist` | ✅ |
| Create data dir for SQLite | `RUN mkdir -p /app/data` | ✅ |
| Non-root user (security) | `addgroup`/`adduser` + `USER appuser` | ✅ |
| Production env var | `ENV NODE_ENV=production` | ✅ |
| Port env var | `ENV PORT=3000` | ✅ |
| Expose port | `EXPOSE 3000` | ✅ |
| Direct node invocation (signal handling) | `CMD ["node", "server/index.js"]` | ✅ |

**Static file path alignment:** `server/index.js` uses `join(__dirname, '..', 'client', 'dist')`, resolving to `/app/client/dist` at runtime. The Dockerfile copies built assets to exactly `/app/client/dist`. ✅ Correctly aligned.

---

### 4.2 `docker-compose.yml`

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_PATH=/app/data/kanban.db
    volumes:
      - kanban-data:/app/data
    restart: unless-stopped

volumes:
  kanban-data:
```

| Requirement | Status |
|-------------|--------|
| Single `app` service | ✅ |
| Builds from local Dockerfile (`build: .`) | ✅ |
| Port `3000:3000` | ✅ |
| `NODE_ENV=production` | ✅ |
| Named volume `kanban-data` for SQLite persistence | ✅ |
| Volume mounted to `/app/data` | ✅ |
| `DB_PATH` explicitly set to `/app/data/kanban.db` | ✅ |
| Restart policy (`unless-stopped`) | ✅ |

---

### 4.3 `.dockerignore`

| Entry | Purpose | Status |
|-------|---------|--------|
| `node_modules`, `*/node_modules` | Avoid copying host deps (recompiled in Docker) | ✅ |
| `.git`, `.gitignore` | Exclude VCS files | ✅ |
| `client/dist` | Built inside Docker, not from host | ✅ |
| `.env`, `.env.*` | Exclude secrets | ✅ |
| `*.md`, `test/`, `server/test/`, `*.test.*`, `*.spec.*` | Exclude dev/test files | ✅ |
| `.DS_Store`, `npm-debug.log*` | Exclude OS/debug artifacts | ✅ |

---

## 5. Observations (Non-Blocking)

### Chunk Size Warning in Vite Build
The production build emits a warning that `index-dV7-MwWi.js` exceeds 500 kB (1,354 kB unminified). This is expected: the BlockNote editor bundles ProseMirror, Tiptap, and related dependencies. The build exits with code 0. No code-splitting was required by the task specification.

### `act()` Warnings in `useBoard.test.js`
Four tests emit React `act(...)` warnings to stderr. These are pre-existing, not introduced by this task, and do not cause test failures.

---

## 6. Overall Assessment

The Docker configuration is **complete and correct**. All three new files (`Dockerfile`, `docker-compose.yml`, `.dockerignore`) implement every requirement from the task specification:

- ✅ Multi-stage Dockerfile with Node 20 Alpine in both stages
- ✅ Stage 1 builds the Vite client SPA
- ✅ Built assets copied to the path the server expects (`client/dist`)
- ✅ `docker-compose.yml` with named volume for SQLite persistence
- ✅ Port 3000 exposed and mapped
- ✅ `NODE_ENV=production` and `DB_PATH` configured
- ✅ `.dockerignore` excludes all unnecessary files

All 589 tests across 5 test runs pass. ESLint is clean. The production build succeeds.
