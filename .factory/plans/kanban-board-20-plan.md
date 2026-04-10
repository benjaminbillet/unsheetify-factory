# Task 20: Docker Configuration Implementation Plan

## Context

The kanban board app needs Docker support to be deployable as a container. The app has two workspaces under `kanban/`:
- **Client**: React + Vite SPA that builds to `client/dist/`
- **Server**: Node.js/Express on port 3001 (default), serves static files from `../client/dist` when `NODE_ENV=production`
- **Database**: SQLite via `better-sqlite3`, stored at `data/kanban.db` relative to `process.cwd()`

**Critical gap identified**: `server/index.js` never calls `initDb()` in its production startup block. Any API request that touches the DB will crash with `TypeError: Cannot read properties of undefined`. This must be fixed as part of Subtask 1.

**Native module constraint**: `better-sqlite3` compiles a native C++ addon at install time. Alpine Linux uses musl libc, so prebuilt glibc binaries do not work — compilation from source is required. Build tools (`python3 make g++`) must be installed via `apk` before any `npm ci` that installs `better-sqlite3`. The Dockerfile strategy compiles once in the build stage, prunes devDeps, then copies the pre-built `node_modules` to the runtime stage so the runtime image contains no build tools.

**Project root for all Docker files**: `kanban/` (the directory with `package.json`, `client/`, `server/`)

---

## Subtask 1: Fix `initDb()` and create multi-stage Dockerfile

### 1a. Tests to write FIRST (RED phase)

**File**: `server/test/server.test.mjs` — append a new `describe` block at the end.

`readFileSync`, `join`, `SERVER_ROOT` are already imported/defined at the top of this file, so no new imports are needed.

```javascript
// ── Subtask (Docker): Production startup initializes DB ───────────────────

describe('Production startup: initDb called', () => {
  it('server/index.js imports initDb from db/queries.js', () => {
    const code = readFileSync(join(SERVER_ROOT, 'index.js'), 'utf-8');
    assert.ok(
      code.includes('initDb'),
      'Expected index.js to import or reference initDb'
    );
  });

  it('initDb() is called in the entry-point startup block', () => {
    const code = readFileSync(join(SERVER_ROOT, 'index.js'), 'utf-8');
    assert.match(code, /initDb\s*\(/, 'Expected initDb() call in index.js');
  });
});
```

Both tests fail RED because `server/index.js` currently has no reference to `initDb`.

**File**: `test/docker.test.mjs` — new file. Write ALL test describe blocks for all three subtasks upfront in this single file (they will all be RED initially; implementation makes them GREEN one by one).

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Subtask 1: Dockerfile ─────────────────────────────────────────────────

describe('Dockerfile', () => {
  const dockerfilePath = resolve(ROOT, 'Dockerfile');

  it('Dockerfile exists', () => assert.ok(existsSync(dockerfilePath)));

  it('uses node:20-alpine as base image', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.ok(content.includes('node:20-alpine'), 'Expected node:20-alpine');
  });

  it('has a named build stage (FROM node:20-alpine AS build)', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.match(content, /FROM node:20-alpine AS build/i);
  });

  it('has a named runtime stage (FROM node:20-alpine AS runtime)', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.match(content, /FROM node:20-alpine AS runtime/i);
  });

  it('installs native build tools in build stage (apk add python3)', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.ok(
      content.includes('apk add') && content.includes('python3'),
      'Expected apk add with python3 for better-sqlite3 native compilation'
    );
  });

  it('runs npm run build in build stage', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.ok(content.includes('npm run build'), 'Expected npm run build command');
  });

  it('prunes devDependencies in build stage before copying to runtime', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.ok(content.includes('npm prune'), 'Expected npm prune --omit=dev in build stage');
  });

  it('copies pre-built node_modules from build stage into runtime', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.ok(
      content.includes('--from=build') && content.includes('node_modules'),
      'Expected COPY --from=build ... node_modules'
    );
  });

  it('copies client/dist from build stage into runtime', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.ok(
      content.includes('--from=build') && content.includes('client/dist'),
      'Expected COPY --from=build ... client/dist'
    );
  });

  it('EXPOSEs port 3000', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.match(content, /EXPOSE\s+3000/);
  });

  it('sets NODE_ENV=production', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.ok(content.includes('NODE_ENV=production'));
  });

  it('sets PORT=3000', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.ok(content.includes('PORT=3000'));
  });

  it('runs as a non-root user (USER directive present)', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.match(content, /^USER\s+\S+/m, 'Expected a USER directive for non-root execution');
  });
});

// ── Subtask 2: docker-compose.yml ─────────────────────────────────────────

describe('docker-compose.yml', () => {
  const composePath = resolve(ROOT, 'docker-compose.yml');

  it('docker-compose.yml exists', () => assert.ok(existsSync(composePath)));

  it('defines an "app" service', () => {
    const content = readFileSync(composePath, 'utf-8');
    assert.ok(content.includes('app:'), 'Expected "app:" service definition');
  });

  it('maps port 3000:3000', () => {
    const content = readFileSync(composePath, 'utf-8');
    assert.ok(content.includes('3000:3000'), 'Expected port 3000:3000 mapping');
  });

  it('defines a named volume for data persistence', () => {
    const content = readFileSync(composePath, 'utf-8');
    assert.match(content, /volumes:/, 'Expected volumes: section');
  });

  it('mounts named volume into /app/data', () => {
    const content = readFileSync(composePath, 'utf-8');
    assert.ok(content.includes('/app/data'), 'Expected /app/data volume mount');
  });

  it('sets NODE_ENV=production', () => {
    const content = readFileSync(composePath, 'utf-8');
    assert.ok(content.includes('NODE_ENV=production'));
  });

  it('sets PORT=3000', () => {
    const content = readFileSync(composePath, 'utf-8');
    assert.ok(content.includes('PORT=3000'));
  });

  it('has a restart policy', () => {
    const content = readFileSync(composePath, 'utf-8');
    assert.ok(content.includes('restart:'), 'Expected restart policy');
  });
});

// ── Subtask 2: .dockerignore ──────────────────────────────────────────────

describe('.dockerignore', () => {
  const ignorePath = resolve(ROOT, '.dockerignore');

  it('.dockerignore exists', () => assert.ok(existsSync(ignorePath)));

  it('excludes node_modules', () => {
    const content = readFileSync(ignorePath, 'utf-8');
    assert.ok(content.includes('node_modules'));
  });

  it('excludes .git', () => {
    const content = readFileSync(ignorePath, 'utf-8');
    assert.ok(content.includes('.git'));
  });

  it('excludes client/dist (built inside Docker, not needed from host)', () => {
    const content = readFileSync(ignorePath, 'utf-8');
    assert.ok(content.includes('client/dist'));
  });
});

// ── Subtask 3: Environment variables and DB path ──────────────────────────

describe('Production DB path configuration', () => {
  it('server/index.js reads DB_PATH from environment', () => {
    const code = readFileSync(resolve(ROOT, 'server', 'index.js'), 'utf-8');
    assert.ok(
      code.includes('DB_PATH'),
      'Expected server/index.js to read DB_PATH env var'
    );
  });
});
```

### 1b. Implementation (GREEN phase)

**Modify**: `server/index.js`

Add `initDb` import at the top with the other imports, and call it in the production startup block:

```javascript
// Add alongside the existing imports at the top of the file:
import { initDb } from './db/queries.js';

// Replace the existing startup block at the bottom of the file with:
if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dbPath = process.env.DB_PATH || 'data/kanban.db';
  initDb(dbPath);
  const app = createApp();
  const PORT = process.env.PORT || 3001;
  const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  initWs(server);
}
```

**Create**: `Dockerfile` at project root (`kanban/Dockerfile`)

```dockerfile
# ── Stage 1: Build client + compile native deps ────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Build tools required to compile better-sqlite3 native addon from source.
# Alpine uses musl libc so prebuilt glibc binaries don't work.
RUN apk add --no-cache python3 make g++

# Copy workspace manifests first for layer-cache efficiency
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install all deps (compiles better-sqlite3; Vite devDeps needed for build)
RUN npm ci

# Copy client source and build the React SPA
COPY client/ ./client/
RUN npm run build

# Remove devDependencies so only production deps are copied to the runtime stage
RUN npm prune --omit=dev

# ── Stage 2: Production runtime ────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Copy workspace manifests
COPY package.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Copy pre-built, production-only node_modules from build stage.
# better-sqlite3 native binary is already compiled — no build tools needed here.
COPY --from=build /app/node_modules ./node_modules

# Copy server source
COPY server/ ./server/

# Copy pre-built client SPA assets from build stage
COPY --from=build /app/client/dist ./client/dist

# Create data directory for SQLite, set ownership before switching user
RUN mkdir -p /app/data \
    && addgroup -S appgroup \
    && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app

USER appuser

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run directly via node (not npm) so the process receives OS signals correctly.
# WORKDIR /app means process.cwd() = /app, so the default DB path
# 'data/kanban.db' resolves to /app/data/kanban.db (the named volume mount).
CMD ["node", "server/index.js"]
```

**Key design decisions in the Dockerfile**:
- Build tools (`apk add python3 make g++`) are in the build stage only — the runtime image has no compiler toolchain
- `npm prune --omit=dev` runs in the build stage; the pruned `node_modules` (containing the pre-compiled `better-sqlite3` binary) is copied to the runtime stage via `COPY --from=build`
- `package-lock.json` is NOT copied to the runtime stage because `npm ci` is not run there
- `chown -R appuser:appgroup /app` runs before `USER appuser` — this ensures `/app/data` is writable by the non-root user when Docker mounts the named volume over it
- `CMD ["node", "server/index.js"]` from `WORKDIR /app` keeps `process.cwd()` at `/app`, so the default `DB_PATH` of `data/kanban.db` resolves to `/app/data/kanban.db`
- Server static file path: `join(__dirname, '..', 'client', 'dist')` = `join('/app/server', '..', 'client', 'dist')` = `/app/client/dist` ✓

---

## Subtask 2: docker-compose.yml with volume persistence + .dockerignore

### 2a. Tests

Already written in `test/docker.test.mjs` above (all tests are written at the start of Subtask 1 in one file).

### 2b. Implementation (GREEN phase)

**Create**: `docker-compose.yml` at project root (`kanban/docker-compose.yml`)

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    volumes:
      - kanban-data:/app/data
    restart: unless-stopped

volumes:
  kanban-data:
```

**Create**: `.dockerignore` at project root (`kanban/.dockerignore`)

```
# Dependencies (reinstalled/compiled inside Docker)
node_modules
*/node_modules

# Git
.git
.gitignore

# Client build output (built inside Docker, not needed from host)
client/dist

# Environment files
.env
.env.*

# Development/test files
*.md
test/
server/test/
client/src/**/*.test.*
client/src/**/*.spec.*

# Misc
.DS_Store
npm-debug.log*
```

---

## Subtask 3: Environment variables and production optimizations

### 3a. Tests

Already written in `test/docker.test.mjs` above (the `'Production DB path configuration'` describe block).

### 3b. Implementation (GREEN phase)

The `server/index.js` change from Subtask 1 (`process.env.DB_PATH || 'data/kanban.db'`) satisfies the DB_PATH test. No additional implementation needed.

The non-root user setup, `NODE_ENV=production`, `PORT=3000` environment variables, and multi-stage build are all already in the Dockerfile from Subtask 1.

---

## Critical Files

| File | Action | Purpose |
|------|--------|---------|
| `kanban/server/index.js` | **Modify** | Add `initDb()` import + call at startup; read `DB_PATH` env var |
| `kanban/Dockerfile` | **Create** | Multi-stage build with native compilation in stage 1, lean runtime in stage 2 |
| `kanban/docker-compose.yml` | **Create** | Service definition, port mapping, named volume |
| `kanban/.dockerignore` | **Create** | Build context exclusions |
| `kanban/server/test/server.test.mjs` | **Modify** | Append `describe` block verifying `initDb()` call |
| `kanban/test/docker.test.mjs` | **Create** | File-content tests for all Docker config files |

---

## Execution Order (strict TDD)

1. **RED**: Append new `describe` block to `server/test/server.test.mjs`
2. **RED**: Create `test/docker.test.mjs` with all tests
3. Confirm tests fail: `cd kanban && node --test server/test/server.test.mjs` and `node --test test/docker.test.mjs`
4. **GREEN**: Modify `server/index.js` — add `initDb` import and call
5. **GREEN**: Create `Dockerfile`
6. **GREEN**: Create `docker-compose.yml`
7. **GREEN**: Create `.dockerignore`
8. Confirm all tests pass: `node --test server/test/server.test.mjs` and `node --test test/docker.test.mjs`

---

## Verification (end-to-end)

```bash
# 1. Run the static tests (fast, no Docker required)
cd kanban
node --test test/docker.test.mjs
node --test server/test/server.test.mjs

# 2. Build the Docker image (validates Dockerfile correctness)
docker build -t kanban-board .

# 3. Start with docker-compose
docker compose up -d

# 4. Verify app is running and serving the SPA
curl http://localhost:3000/health     # → {"ok":true}
curl http://localhost:3000/           # → HTML page (React app shell)

# 5. Test data persistence across container restarts.
#    NOTE: The server has no GET /api/cards endpoint, so persistence is verified
#    indirectly via card position. SQLite assigns position=1.0 to the first card
#    in a column. If data persists after restart, the second card gets position=2.0.
#    If the DB was wiped, the second card would also get position=1.0.

# Create first card (position will be 1.0 — first card in "ready" column)
curl -s -X POST http://localhost:3000/api/cards \
  -H "Content-Type: application/json" \
  -d '{"title":"Card One","column":"ready"}'
# Response should include: "position":1.0

# Restart the container (named volume keeps /app/data intact)
docker compose restart app

# Wait for server to come back up
curl http://localhost:3000/health     # → {"ok":true}

# Create second card — if DB persisted, max position in "ready" is 1.0, so new card gets 2.0
curl -s -X POST http://localhost:3000/api/cards \
  -H "Content-Type: application/json" \
  -d '{"title":"Card Two","column":"ready"}'
# Response MUST include: "position":2.0  (proves Card One still exists in the DB)
# If position is 1.0, the DB was not persisted (volume misconfigured)

# 6. Verify production mode (dev-only routes must not exist)
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:3000/dev/echo \
  -H "Content-Type: application/json" \
  -d '{}'
# → 404  (POST /dev/echo is not registered in production)
```
