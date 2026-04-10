# Task 24: Production Optimizations and Error Handling

## Context

The Kanban board app has a working Express server and React client. This task adds production-readiness: better error handling, request logging, rate limiting, security headers, client-side code splitting, React error boundaries, and enhanced health check endpoints. The work is purely additive — existing behavior and tests must be preserved.

**Project root:** `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-24/kanban/`

---

## Execution Order

```
Subtask 1 (Error Handler Middleware)
  → Subtask 2 (Morgan / Logger)          depends on S1
    → Subtask 3 (Rate Limiting / Helmet) depends on S1, S2
      → Subtask 6 (CORS / Health Checks) depends on S1, S2, S3

Subtask 4 (Vite Code Splitting)          independent
  → Subtask 5 (Error Boundaries)         depends on S4 (LoadingSpinner)
```

---

## New Packages to Install

```bash
npm -w server install morgan express-rate-limit helmet
```

No new client packages needed — `React.lazy`, `Suspense`, and class-based `ErrorBoundary` use existing React 18 APIs.

---

## Subtask 1: Comprehensive Error Handling Middleware

### TDD — Write tests first

**New test file:** `server/test/errorHandler.test.mjs`

Test cases:
- `notFoundHandler sends 404 JSON with { error, code: 'NOT_FOUND' } for unmatched routes`
- `errorHandler maps NotFoundError → 404, code: NOT_FOUND`
- `errorHandler maps ForeignKeyError → 404, code: NOT_FOUND`
- `errorHandler maps DatabaseError → 500, code: DATABASE_ERROR`
- `errorHandler maps err.status=400 → 400, code: VALIDATION_ERROR`
- `errorHandler maps err.status=401 → 401, code: UNAUTHORIZED`
- `errorHandler maps err.status=403 → 403, code: FORBIDDEN`
- `errorHandler maps generic Error → 500, code: INTERNAL_ERROR`
- `response always has { error: string, code: string } shape`
- `in production: 500 error message is generic "Internal Server Error" (does not leak internals)`
- `in development: error message is the actual err.message`
- `Content-Type is application/json for all error responses`
- Integration: `GET /dev/error returns 500 with { error, code } body`
- Integration: `GET /dev/error?status=422 returns 422`

### Implementation

**New file:** `server/middleware/errorHandler.js`

```js
import { NotFoundError, DatabaseError, ForeignKeyError } from '../db/queries.js';

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Not Found', code: 'NOT_FOUND' });
}

export function errorHandler(err, _req, res, _next) {
  const isProduction = process.env.NODE_ENV === 'production';
  let status = 500;
  let code = 'INTERNAL_ERROR';

  if (err instanceof NotFoundError || err instanceof ForeignKeyError) {
    status = 404; code = 'NOT_FOUND';
  } else if (err instanceof DatabaseError) {
    status = 500; code = 'DATABASE_ERROR';
  } else if (err.status === 400 || err.statusCode === 400 || err.type === 'entity.parse.failed') {
    status = 400; code = 'VALIDATION_ERROR';
  } else if (err.status === 401 || err.statusCode === 401) {
    status = 401; code = 'UNAUTHORIZED';
  } else if (err.status === 403 || err.statusCode === 403) {
    status = 403; code = 'FORBIDDEN';
  } else if (err.status === 413 || err.statusCode === 413) {
    status = 413; code = 'PAYLOAD_TOO_LARGE';
  } else if (err.status || err.statusCode) {
    status = err.status || err.statusCode;
  }

  const message = (isProduction && status === 500)
    ? 'Internal Server Error'
    : (err.message || 'Internal Server Error');

  if (!isProduction) console.error(err);

  res.status(status).json({ error: message, code });
}
```

**Modify:** `server/index.js`
- Import `{ notFoundHandler, errorHandler }` from `./middleware/errorHandler.js`
- Replace the inline 404 and error handlers at the bottom of `createApp()` with:
  ```js
  app.use(notFoundHandler);
  app.use(errorHandler);
  ```

**Backward compatibility:** Existing tests assert `typeof body.error === 'string'` — the new shape still has an `error` string, so they pass unchanged.

---

## Subtask 2: Logging with Morgan

### TDD — Write tests first

**New test file:** `server/test/logger.test.mjs`

Test cases:
- `morgan middleware: requests do not throw in dev mode (smoke test)`
- `morgan is skipped when NODE_ENV=test (no output noise in tests)`
- `requestIdMiddleware attaches X-Request-Id header to every response`
- `X-Request-Id is a non-empty string`
- `each request gets a unique X-Request-Id`
- `if incoming X-Request-Id header is present, it is echoed back`
- `logger.info(msg) does not throw, writes with INFO level`
- `logger.warn(msg) does not throw, writes with WARN level`
- `logger.error(msg) does not throw, writes with ERROR level`
- `logger.debug(msg) is suppressed when NODE_ENV=production`
- `logger.debug(msg) is active when NODE_ENV=development`

### Implementation

**New file:** `server/middleware/logger.js`

```js
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';

export function requestIdMiddleware(req, res, next) {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-Id', req.id);
  next();
}

export function morganMiddleware() {
  if (process.env.NODE_ENV === 'test') return (_req, _res, next) => next();
  const format = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
  return morgan(format);
}

const isProduction = () => process.env.NODE_ENV === 'production';
const ts = () => new Date().toISOString();

export const logger = {
  info:  (msg) => console.log(`[${ts()}] INFO  ${msg}`),
  warn:  (msg) => console.warn(`[${ts()}] WARN  ${msg}`),
  error: (msg) => console.error(`[${ts()}] ERROR ${msg}`),
  debug: (msg) => { if (!isProduction()) console.log(`[${ts()}] DEBUG ${msg}`); },
};
```

**Modify:** `server/index.js`
- Import `{ requestIdMiddleware, morganMiddleware }` from `./middleware/logger.js`
- Add immediately after `app = express()`:
  ```js
  app.use(requestIdMiddleware);
  app.use(morganMiddleware());
  ```

---

## Subtask 3: Rate Limiting and Security

### TDD — Write tests first

**New test file:** `server/test/security.test.mjs`

Test cases:
- `helmet sets X-Content-Type-Options: nosniff`
- `helmet sets X-Frame-Options header`
- `helmet removes X-Powered-By header`
- `general rate limiter: allows requests under the limit`
- `general rate limiter: returns 429 when limit exceeded`
- `429 response has Retry-After header`
- `429 response body has { error, code: 'RATE_LIMITED' } shape`
- `429 response has RateLimit-Limit and RateLimit-Remaining headers`
- `write limiter: POST /api/cards is rate-limited`
- `write limiter: GET /api/cards is NOT affected by the write limiter`
- `express.json limit: body > 100kb returns 413`
- `express.json limit: body <= 100kb is accepted`

Testing strategy: export `createRateLimiter(options)` factory from `security.js` so tests can create low-limit instances (e.g., `max: 2`) without making 100 real requests.

### Implementation

**New file:** `server/middleware/security.js`

```js
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

export const helmetMiddleware = helmet();

export function createRateLimiter(options = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED' });
    },
    ...options,
  });
}

export const generalLimiter = createRateLimiter({ max: 100 });
export const writeLimiter = createRateLimiter({ max: 30 });
```

**Modify:** `server/index.js`
- Import `{ helmetMiddleware, generalLimiter }` from `./middleware/security.js`
- Add after morgan/requestId middleware:
  ```js
  app.use(helmetMiddleware);
  app.use('/api', generalLimiter);
  ```
- Change `app.use(express.json())` to `app.use(express.json({ limit: '100kb' }))` (Express auto-returns 413 on overflow, which the `errorHandler` then catches)

**Modify:** `server/api/cards.js` and `server/api/comments.js`
- Import `writeLimiter` and apply as route-level middleware on POST, PATCH, DELETE handlers:
  ```js
  import { writeLimiter } from '../middleware/security.js';
  router.post('/cards', writeLimiter, async (req, res, next) => { ... });
  ```

---

## Subtask 6: Production CORS and Health Checks

### TDD — Write tests first

**New test file:** `server/test/health.test.mjs`

Test cases:
- `GET /health returns 200 with { ok: true, db: true } when DB is up`
- `GET /health returns 503 with { ok: false, db: false } when DB unavailable`
- `GET /health/live returns 200 { status: 'ok' } (no DB check)`
- `GET /health/ready returns 200 { status: 'ready', db: true } when DB is up`
- `GET /health/ready returns 503 { status: 'unavailable', db: false } when DB is down`
- `GET /health/ready includes a ws field`
- `GET /metrics returns 200`
- `GET /metrics includes uptime (number >= 0)`
- `GET /metrics includes memory.heapUsed, memory.heapTotal, memory.rss`
- `GET /metrics includes requestCount that increments`
- `CORS: in dev mode, reflects any Origin`
- `CORS: in production with CORS_ORIGIN set, allows that origin`
- `CORS: in production without CORS_ORIGIN, blocks cross-origin (no ACAO header)`
- `CORS: CORS_ORIGIN supports comma-separated list`

**Modify:** `server/test/server.test.mjs` — update the `GET /health` assertion at line 165-169:
```js
// Before (will break with new db field):
assert.deepStrictEqual(body, { ok: true });
// After:
assert.strictEqual(body.ok, true);
```

### Implementation changes in `server/index.js`

**CORS update:**
```js
const corsOrigins = (() => {
  if (!isProduction) return true;
  const env = process.env.CORS_ORIGIN;
  if (!env) return false;
  const list = env.split(',').map(o => o.trim());
  return list.length === 1 ? list[0] : list;
})();
app.use(cors({ origin: corsOrigins, credentials: true }));
```

**Request counter** (declare at top of `createApp()`):
```js
let requestCount = 0;
app.use((_req, _res, next) => { requestCount++; next(); });
```

**Enhanced `/health`:**
```js
app.get('/health', (_req, res) => {
  const database = getDb();
  let dbOk = false;
  try { database?.prepare('SELECT 1').get(); dbOk = true; } catch { /* */ }
  return res.status(dbOk ? 200 : 503).json({ ok: dbOk, db: dbOk });
});
```

**Liveness probe:**
```js
app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
```

**Readiness probe** (needs `getWsState()` from broadcaster):
```js
app.get('/health/ready', (_req, res) => {
  const database = getDb();
  let dbOk = false;
  try { database?.prepare('SELECT 1').get(); dbOk = true; } catch { /* */ }
  const wsOk = getWsState();
  const ready = dbOk;
  return res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'unavailable',
    db: dbOk, ws: wsOk,
  });
});
```

**Metrics endpoint:**
```js
app.get('/metrics', (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    uptime: process.uptime(),
    memory: { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss },
    requestCount,
  });
});
```

**Modify:** `server/ws/broadcaster.js`
- Add and export: `export function getWsState() { return wss !== null; }`

---

## Subtask 4: Client Bundle Code Splitting

### TDD — Write tests first

**New test file:** `client/src/components/LoadingSpinner.test.jsx`

Test cases:
- `renders without crashing`
- `has role="status"`
- `has aria-label equal to the label prop`
- `default aria-label is "Loading"`
- `accepts size prop without crashing (sm, md, lg)`
- `renders sr-only text matching the label`

**Modify:** `client/src/components/Board/Board.test.jsx`
- Add `vi.mock('./CardModal.jsx', ...)` mock (needed because CardModal becomes lazy-loaded, but the module mock makes it synchronous in tests — no test changes required beyond ensuring the mock exists)
- Verify existing tests still pass

### Implementation

**New file:** `client/src/components/LoadingSpinner.jsx`
```jsx
export default function LoadingSpinner({ label = 'Loading', size = 'md' }) {
  return (
    <div role="status" aria-label={label} className={`loading-spinner loading-spinner--${size}`}>
      <span className="sr-only">{label}</span>
    </div>
  );
}
```

**Modify:** `client/vite.config.js` — add `build` section:
```js
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react':     ['react', 'react-dom'],
        'vendor-dnd':       ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        'vendor-blocknote': ['@blocknote/core', '@blocknote/react'],
      },
    },
  },
},
```

**Modify:** `client/src/components/Board/Board.jsx`
- Replace static import of `CardModal` with:
  ```js
  import { lazy, Suspense } from 'react';
  import LoadingSpinner from '../LoadingSpinner.jsx';
  const CardModal = lazy(() => import('./CardModal.jsx'));
  ```
- Wrap the `CardModal` JSX render with:
  ```jsx
  {selectedCard && (
    <Suspense fallback={<LoadingSpinner label="Loading card details…" />}>
      <CardModal ... />
    </Suspense>
  )}
  ```

---

## Subtask 5: React Error Boundaries and Loading States

### TDD — Write tests first

**New test file:** `client/src/components/ErrorBoundary.test.jsx`

Test cases:
- `renders children when there is no error`
- `renders fallback UI when a child throws during render`
- `fallback shows "Something went wrong" heading`
- `fallback shows a "Try again" button`
- `clicking "Try again" clears the error and re-renders children`
- `clicking "Try again" calls onReset prop if provided`
- `catches errors from deeply nested children`
- `calls onError prop with (error, errorInfo) when error is caught`
- `accepts a custom fallback component via fallback prop`

Test helper:
```jsx
function ThrowOnRender({ shouldThrow }) {
  if (shouldThrow) throw new Error('Test render error');
  return <div>OK</div>;
}
```
Use `beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))` to suppress React's error logging noise during tests.

**Modify:** `client/src/App.test.jsx`
- Add: `renders Board wrapped in ErrorBoundary without crashing`
- Add: `shows error fallback when Board throws` (mock Board to throw)

### Implementation

**New file:** `client/src/components/ErrorBoundary.jsx`
```jsx
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.props.onError?.(error, errorInfo);
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ErrorBoundary]', error, errorInfo);
    }
  }

  handleReset() {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const Fallback = this.props.fallback;
        return <Fallback error={this.state.error} onReset={this.handleReset} />;
      }
      return (
        <div role="alert" className="error-boundary">
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={this.handleReset}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**Modify:** `client/src/App.jsx`
```jsx
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Board from './components/Board/Board.jsx';
import './App.css';

function App() {
  return (
    <div className="app">
      <header className="app-header"><h1>Kanban Board</h1></header>
      <main className="app-main">
        <ErrorBoundary>
          <Board />
        </ErrorBoundary>
      </main>
    </div>
  );
}
export default App;
```

**Modify:** `client/src/components/Board/Board.jsx`
- Replace `<div className="board-loading" aria-label="Loading">Loading…</div>` with:
  ```jsx
  if (loading) return <LoadingSpinner label="Loading" />;
  ```
  (The existing test `screen.getByLabelText('Loading')` continues to pass since `LoadingSpinner` uses `aria-label={label}`.)

---

## Critical Files

### Server — modified
- `server/index.js` — middleware wiring, CORS update, health endpoints, request counter
- `server/ws/broadcaster.js` — add `getWsState()` export
- `server/api/cards.js` — add `writeLimiter` to POST/PATCH/DELETE routes
- `server/api/comments.js` — add `writeLimiter` to POST route
- `server/test/server.test.mjs` — fix `deepStrictEqual` → `strictEqual` for `/health` body

### Server — created
- `server/middleware/errorHandler.js`
- `server/middleware/logger.js`
- `server/middleware/security.js`
- `server/test/errorHandler.test.mjs`
- `server/test/logger.test.mjs`
- `server/test/security.test.mjs`
- `server/test/health.test.mjs`

### Client — modified
- `client/vite.config.js` — add `build.rollupOptions.output.manualChunks`
- `client/src/App.jsx` — wrap Board in ErrorBoundary
- `client/src/App.test.jsx` — add ErrorBoundary integration tests
- `client/src/components/Board/Board.jsx` — lazy CardModal, LoadingSpinner

### Client — created
- `client/src/components/LoadingSpinner.jsx`
- `client/src/components/LoadingSpinner.test.jsx`
- `client/src/components/ErrorBoundary.jsx`
- `client/src/components/ErrorBoundary.test.jsx`

---

## Verification

```bash
# 1. Install new server packages
npm -w server install morgan express-rate-limit helmet

# 2. Run all server tests (existing + new)
npm -w server run test:all

# 3. Run all client tests
npm -w client run test

# 4. Verify build with code splitting
npm -w client run build
# → dist/assets/ should contain separate vendor-react, vendor-dnd, vendor-blocknote chunks

# 5. Run full test suite
npm run test:all

# 6. Smoke-test health endpoints manually
DB_PATH=:memory: node server/index.js &
curl http://localhost:3001/health        # → { ok: true, db: true }
curl http://localhost:3001/health/live   # → { status: 'ok' }
curl http://localhost:3001/health/ready  # → { status: 'ready', db: true, ws: false }
curl http://localhost:3001/metrics       # → { uptime, memory, requestCount }
```
