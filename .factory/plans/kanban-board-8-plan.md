# Plan: Task 8 — Create API Client Wrapper Functions

## Context

The Kanban app needs a typed fetch-wrapper module so React components can communicate with the Express REST API. No client-side API layer exists yet. This task creates `client/src/api/client.js` covering all five endpoints (cards CRUD + create comment) with robust error handling, JSON parsing, and JSDoc annotations. Tests are written in Vitest (the client's test runner) following TDD: tests are written first, implementation follows.

---

## Files to Create

| File | Purpose |
|---|---|
| `client/src/api/client.test.js` | All Vitest tests for the API client |
| `client/src/api/client.js` | Implementation of the API client |

No existing files are modified.

---

## Architecture Decisions

- **Relative URLs** (`/api/cards`) — Vite's dev proxy rewrites them to `http://localhost:3001`; production serves from the same origin.
- **`apiFetch` internal helper** — one place handles headers, error detection, and JSON parsing; all exported functions delegate to it.
- **`ApiError` class** — extends `Error` with `.status` (HTTP status or `0` for network failures) and `.data` (parsed error body or `null`). Exported so callers can `instanceof` check.
- **Content-Type header** — only injected when `options.body` is present (avoids spurious header on GET/DELETE).
- **204 / empty-body responses** — detected by `response.status === 204` or `content-length: 0`; return `null` instead of attempting JSON parse.
- **Module format** — ES module (`export`), consistent with `client/package.json` `"type": "module"`.

---

## Subtask 1 — Basic fetch wrapper functions (Red → Green)

### Test cases to write first (`client.test.js`)

```
describe('fetchCards')
  ✓ calls fetch with GET /api/cards
  ✓ does NOT set Content-Type header (no body)

describe('createCard')
  ✓ calls fetch with POST /api/cards
  ✓ sends JSON-serialised body
  ✓ sets Content-Type: application/json

describe('updateCard')
  ✓ calls fetch with PATCH /api/cards/<id>
  ✓ sends JSON-serialised body
  ✓ sets Content-Type: application/json

describe('deleteCard')
  ✓ calls fetch with DELETE /api/cards/<id>
  ✓ does NOT set Content-Type header

describe('createComment')
  ✓ calls fetch with POST /api/cards/<cardId>/comments
  ✓ sends JSON-serialised body
  ✓ sets Content-Type: application/json
```

Each test stubs `fetch` with `vi.stubGlobal('fetch', vi.fn())` in `beforeEach`, restores in `afterEach` with `vi.unstubAllGlobals()`. The stub returns a minimal mock response (`ok: true, status: 200, json: () => Promise.resolve({})`) so the function doesn't throw.

### Implementation (`client.js`) to make tests green

```js
export class ApiError extends Error { constructor(msg, status, data) {...} }

async function apiFetch(path, options = {}) {
  const headers = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { ...options, headers: { ...headers, ...options.headers } });
  // (error handling added in subtask 2, JSON parsing in subtask 3)
  return response.json();
}

export async function fetchCards()              { return apiFetch('/api/cards'); }
export async function createCard(data)          { return apiFetch('/api/cards', { method:'POST', body:JSON.stringify(data) }); }
export async function updateCard(id, data)      { return apiFetch(`/api/cards/${id}`, { method:'PATCH', body:JSON.stringify(data) }); }
export async function deleteCard(id)            { return apiFetch(`/api/cards/${id}`, { method:'DELETE' }); }
export async function createComment(cardId, data) { return apiFetch(`/api/cards/${cardId}/comments`, { method:'POST', body:JSON.stringify(data) }); }
```

---

## Subtask 2 — Error handling (Red → Green)

### Additional test cases

```
describe('network errors')
  ✓ when fetch() throws, re-throws as ApiError with status 0
  ✓ ApiError.message contains original network error message

describe('HTTP error responses')
  ✓ 404 response throws ApiError with status 404
  ✓ 500 response throws ApiError with status 500
  ✓ error body { error: "Not Found" } → ApiError.message = "Not Found"
  ✓ non-JSON error body → ApiError.message = "HTTP error 404" (fallback)
  ✓ ApiError.data contains parsed error body when available
```

Mock 404 response: `{ ok: false, status: 404, json: () => Promise.resolve({ error: 'Not Found' }), headers: { get: () => null } }`.

Mock network error: `vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))`.

### Implementation additions to `apiFetch`

```js
async function apiFetch(path, options = {}) {
  const headers = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(path, { ...options, headers: { ...headers, ...options.headers } });
  } catch (err) {
    throw new ApiError(`Network error: ${err.message}`, 0, null);
  }

  if (!response.ok) {
    let errorData = null;
    try { errorData = await response.json(); } catch { /* ignore */ }
    const message = errorData?.error ?? `HTTP error ${response.status}`;
    throw new ApiError(message, response.status, errorData);
  }

  // JSON parsing added in subtask 3
  return response.json();
}
```

---

## Subtask 3 — JSON parsing & response handling (Red → Green)

### Additional test cases

```
describe('successful response parsing')
  ✓ fetchCards() returns the parsed array from response body
  ✓ createCard() returns the parsed card object
  ✓ updateCard() returns the parsed updated card
  ✓ createComment() returns the parsed comment object

describe('empty responses')
  ✓ 204 status response returns null (no json() call attempted)
  ✓ response with content-length: 0 returns null

describe('malformed JSON')
  ✓ when response.json() rejects, throws ApiError with original status
```

Malformed JSON mock: `{ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected token')), headers: { get: () => null } }`.

Empty response mock: `{ ok: true, status: 204, headers: { get: (h) => h === 'content-length' ? '0' : null }, json: vi.fn() }` — assert `json` is never called.

### Implementation additions to `apiFetch`

```js
  // After the !response.ok block:
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return null;
  }
  try {
    return await response.json();
  } catch (err) {
    throw new ApiError(`Failed to parse response: ${err.message}`, response.status, null);
  }
```

---

## Subtask 4 — JSDoc annotations (no new tests)

Add JSDoc to `client.js`:

```js
/**
 * @typedef {Object} Card
 * @property {string} id
 * @property {string} title
 * @property {string|null} assignee
 * @property {string} column  - e.g. 'ready', 'in-progress', 'done'
 * @property {number} position
 * @property {string|null} description
 * @property {number} created_at  - Unix ms timestamp
 * @property {Comment[]} comments
 */

/**
 * @typedef {Object} Comment
 * @property {string} id
 * @property {string} card_id
 * @property {string} author
 * @property {string} content
 * @property {number} created_at
 */

/**
 * Fetch all cards with their nested comments.
 * @returns {Promise<Card[]>}
 * @throws {ApiError} on network or HTTP error
 */
export async function fetchCards() { ... }

/**
 * Create a new card.
 * @param {{ title: string, assignee?: string, column?: string, description?: string }} data
 * @returns {Promise<Card>}
 * @throws {ApiError}
 */
export async function createCard(data) { ... }

/**
 * Partially update an existing card.
 * @param {string} id
 * @param {{ title?: string, assignee?: string, column?: string, description?: string, position?: number }} data
 * @returns {Promise<Card>}
 * @throws {ApiError}
 */
export async function updateCard(id, data) { ... }

/**
 * Delete a card (and its comments).
 * @param {string} id
 * @returns {Promise<null>}
 * @throws {ApiError}
 */
export async function deleteCard(id) { ... }

/**
 * Add a comment to a card.
 * @param {string} cardId
 * @param {{ author: string, content: string }} data
 * @returns {Promise<Comment>}
 * @throws {ApiError}
 */
export async function createComment(cardId, data) { ... }
```

---

## Execution Order (strict TDD)

1. Create `client/src/api/client.test.js` with **all subtask 1** tests → run tests → confirm **red**
2. Create `client/src/api/client.js` with subtask 1 implementation → run tests → confirm **green**
3. Add subtask 2 tests to `client.test.js` → run → **red**
4. Add error handling in `apiFetch` → run → **green**
5. Add subtask 3 tests → run → **red**
6. Add JSON/empty-response handling in `apiFetch` → run → **green**
7. Add JSDoc (subtask 4) — run tests to confirm still **green**

---

## Verification

```bash
# Run client tests (from repo root)
npm -w client run test

# Expected: all tests in client/src/api/client.test.js pass
# Confirm file exists and exports are correct
node -e "import('./client/src/api/client.js').then(m => console.log(Object.keys(m)))"
```

All 5 exported functions (`fetchCards`, `createCard`, `updateCard`, `deleteCard`, `createComment`) plus `ApiError` class should be present.
