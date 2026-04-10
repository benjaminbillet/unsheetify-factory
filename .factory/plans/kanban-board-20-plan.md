# Task 20: Docker Configuration Implementation Plan

## Context

The kanban board app needs Docker support to be deployable as a container. The app has two workspaces under `kanban/`:
- **Client**: React + Vite SPA that builds to `client/dist/`
- **Server**: Node.js/Express on port 3001 (default), serves static files from `../client/dist` when `NODE_ENV=production`
- **Database**: SQLite via `better-sqlite3`, stored at `data/kanban.db` relative to `process.cwd()`

**Critical gap identified**: `server/index.js` never calls `initDb()` in its production startup block. Any API request that touches the DB will crash with `TypeError: Cannot read properties of undefined`. This must be fixed as part of Subtask 1.

**Project root for all Docker files**: `/kanban/` (the directory with `package.json`, `client/`, `server/`)

---

## Subtask 1: Fix `initDb()` and create multi-stage Dockerfile

### 1a. Tests to write FIRST (RED phase)

**File**: `server/test/server.test.mjs` — append a new `describe` block at the end.

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

**File**: `test/docker.test.mjs` — new file (Dockerfile section only for this subtask).

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

describe('Dockerfile', () => {
  const dockerfilePath = resolve(ROOT, 'Dockerfile');

  it('Dockerfile exists', () => assert.ok(existsSync(dockerfilePath)));

  it('uses node:20-alpine as build base', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.ok(content.includes('node:20-alpine'), 'Expected node:20-alpine');
  });

  it('has a named build stage (AS build)', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.match(content, /FROM node:20-alpine AS build/i);
  });

  it('has a named runtime stage (AS runtime)', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.match(content, /FROM node:20-alpine AS runtime/i);
  });

  it('runs npm run build in build stage', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.ok(content.includes('npm run build'), 'Expected npm run build command');
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
});
```

### 1b. Implementation (GREEN phase)

**Modify**: `server/index.js`

Add `initDb` import and call in the production startup block:

```javascript
// Add to existing imports at top of file:
import { initDb } from './db/queries.js';

// Modify the startup block (currently at bottom of file):
if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dbPath = process.env.DB_PATH || 'data/kanban.db';
  initDb(dbPath);                                           // ← ADD THIS LINE
  const app = createApp();
  const PORT = process.env.PORT || 3001;
  const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  initWs(server);
}
```

**Create**: `Dockerfile` at project root (`kanban/Dockerfile`)

```dockerfile
# ── Stage 1: Build client ──────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Copy workspace manifests first for layer-cache efficiency
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install all deps (Vite devDeps needed for client build)
RUN npm ci

# Copy client source and build
COPY client/ ./client/
RUN npm run build

# ── Stage 2: Production runtime ───────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy server source
COPY server/ ./server/

# Copy pre-built client assets from build stage
COPY --from=build /app/client/dist ./client/dist

# Pre-create the data directory (volume will overlay it at runtime)
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/index.js"]
```

**Notes on Dockerfile design decisions**:
- `WORKDIR /app` → `node server/index.js` keeps `process.cwd()` at `/app` so `data/kanban.db` resolves to `/app/data/kanban.db` (consistent with the named volume mount point)
- `npm ci --omit=dev` installs only production deps for both workspaces (no Vite, no Vitest, no nodemon)
- Server serves static files from `join(__dirname, '..', 'client', 'dist')` = `/app/client/dist` ✓

---

## Subtask 2: docker-compose.yml with volume persistence + .dockerignore

### 2a. Tests to write FIRST (RED phase)

**File**: `test/docker.test.mjs` — append these describe blocks:

```javascript
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
    // Named volume appears in both `volumes:` top-level and service volumes section
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

  it('excludes client/dist (build output not needed in context)', () => {
    const content = readFileSync(ignorePath, 'utf-8');
    assert.ok(content.includes('client/dist'));
  });
});
```

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
# Dependencies (reinstalled inside Docker)
node_modules
*/node_modules

# Git
.git
.gitignore

# Client build output (built inside Docker)
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

### 3a. Tests to write FIRST (RED phase)

These are already covered by the tests written in Subtasks 1 and 2 (NODE_ENV=production, PORT=3000 in both Dockerfile and docker-compose.yml). No additional test files needed.

Add one final describe block to `test/docker.test.mjs` to verify the DB_PATH support:

```javascript
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

### 3b. Implementation (GREEN phase)

The `server/index.js` change from Subtask 1 (`process.env.DB_PATH || 'data/kanban.db'`) already satisfies this test. No additional implementation needed.

**Optional security improvement** — add non-root user to Dockerfile (after `RUN mkdir -p /app/data`):
```dockerfile
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app
USER appuser
```

---

## Critical Files

| File | Action | Purpose |
|------|--------|---------|
| `kanban/server/index.js` | **Modify** | Add `initDb()` import + call at startup |
| `kanban/Dockerfile` | **Create** | Multi-stage build |
| `kanban/docker-compose.yml` | **Create** | Service + named volume |
| `kanban/.dockerignore` | **Create** | Build context exclusions |
| `kanban/server/test/server.test.mjs` | **Modify** | Append initDb test describe block |
| `kanban/test/docker.test.mjs` | **Create** | New Docker config test file |

---

## Execution Order (strict TDD)

1. **RED**: Append new `describe` block to `server/test/server.test.mjs` (initDb tests)
2. **RED**: Create `test/docker.test.mjs` with all Docker config tests
3. Confirm tests fail: `cd kanban && node --test server/test/server.test.mjs` and `node --test test/docker.test.mjs`
4. **GREEN**: Modify `server/index.js` — add initDb import and call
5. **GREEN**: Create `Dockerfile`
6. **GREEN**: Create `docker-compose.yml`
7. **GREEN**: Create `.dockerignore`
8. Confirm all tests pass: `node --test server/test/server.test.mjs` and `node --test test/docker.test.mjs`

---

## Verification (end-to-end)

```bash
# 1. Run the static tests
cd kanban
node --test test/docker.test.mjs
node --test server/test/server.test.mjs

# 2. Build the Docker image
docker build -t kanban-board .

# 3. Start with docker-compose
docker compose up -d

# 4. Verify the app is running
curl http://localhost:3000/health          # → {"ok":true}
curl http://localhost:3000/               # → HTML page with React app

# 5. Test data persistence
# Create a card
curl -X POST http://localhost:3000/api/cards \
  -H "Content-Type: application/json" \
  -d '{"title":"Test card","assignee":"Alice"}'

# Restart the container
docker compose restart

# Verify card still exists after restart
curl http://localhost:3000/health          # Server still running

# 6. Check production mode (no /dev routes)
curl http://localhost:3000/dev/echo -X POST  # → 404
```
