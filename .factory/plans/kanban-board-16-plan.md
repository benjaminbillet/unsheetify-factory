# Plan: Implement WebSocket Broadcaster (Task #16)

## Context

The kanban board needs real-time event push to all connected clients. The `ws@^8.16.0` library is already a production dependency in `server/package.json`. The `server/ws/` directory exists but is empty. The server uses an Express `createApp()` factory — WebSocket attachment happens by passing the HTTP server to `initWs()`. Client already has a Vite proxy rule for `/ws` with `ws: true`, confirming WebSocket support is expected.

Tests use **Node.js built-in `node:test`** (NOT Jest), `.mjs` extensions, `assert from 'node:assert/strict'`, and real HTTP servers on random ports (port 0).

## Files to Create

- `server/ws/broadcaster.js` — the WebSocket broadcaster module
- `server/test/ws.test.mjs` — all four subtask test suites

## Files to Modify

- `server/package.json` — add `test/ws.test.mjs` to test script

## Architecture Decisions

- Module-level state (`wss`, `clients`, `heartbeatInterval`) initialized by `initWs`, reset by `closeWs`
- `initWs(httpServer, { pingInterval = 30000 } = {})` — `pingInterval` is configurable for testability (tests use 50ms)
- `broadcast(event, payload)` — serializes `{ event, payload }` as JSON, sends to all OPEN clients, catches per-client errors
- `closeWs()` — exported for test teardown; clears interval, empties set, closes wss
- Import pattern: `import { WebSocketServer, WebSocket } from 'ws'` in broadcaster; `import { WebSocket } from 'ws'` in tests

---

## Subtask 1: WebSocket Server Setup + Client Connection

### Red: Write tests first (in `server/test/ws.test.mjs`)

**Test helpers (top of file):**
```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { initWs, broadcast, closeWs } from '../ws/broadcaster.js';

function startWsServer(opts = {}) {
  return new Promise((resolve) => {
    const httpServer = createServer();
    initWs(httpServer, opts);
    httpServer.listen(0, () => {
      const { port } = httpServer.address();
      resolve({ httpServer, wsUrl: `ws://localhost:${port}` });
    });
  });
}

function connectClient(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function waitForMessage(ws) {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString())));
  });
}

function closeClient(ws) {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    ws.once('close', resolve);
    ws.close();
  });
}
```

**Suite: `'WebSocket server setup and client connection'`**
```
before: startWsServer()
after:  closeWs() + httpServer.close()
```

Tests:
1. `'initWs does not throw when given a valid HTTP server'` — assert no error
2. `'a client can connect successfully'` — connect client, assert `readyState === WebSocket.OPEN`
3. `'multiple clients can connect simultaneously'` — connect 3 clients, assert all OPEN
4. `'connected client is tracked (broadcast reaches it)'` — connect client, broadcast any event, await message, assert received
5. `'closeWs resolves cleanly'` — after suite, closeWs() resolves without error

### Green: Implement `server/ws/broadcaster.js`

```js
import { WebSocketServer, WebSocket } from 'ws';

let wss = null;
let clients = new Set();
let heartbeatInterval = null;

function initWs(httpServer, { pingInterval = 30000 } = {}) {
  clients = new Set();
  wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    clients.add(ws);

    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => { clients.delete(ws); });
    ws.on('error', () => { clients.delete(ws); });
  });

  heartbeatInterval = setInterval(() => {
    for (const client of clients) {
      if (!client.isAlive) {
        clients.delete(client);
        client.terminate();
      } else {
        client.isAlive = false;
        client.ping();
      }
    }
  }, pingInterval);

  wss.on('close', () => { clearInterval(heartbeatInterval); });
}

function broadcast(event, payload) {
  const data = JSON.stringify({ event, payload });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(data); } catch { /* isolate per-client errors */ }
    }
  }
}

async function closeWs() {
  clearInterval(heartbeatInterval);
  heartbeatInterval = null;
  clients = new Set();
  if (wss) {
    await new Promise((resolve) => wss.close(resolve));
    wss = null;
  }
}

export { initWs, broadcast, closeWs };
```

---

## Subtask 2: Broadcast Functionality

### Red: Add tests to `ws.test.mjs`

**Suite: `'broadcast(event, payload)'`**
```
before: startWsServer()
after:  closeWs() + httpServer.close()
```

Tests:
1. `'sends JSON with correct event and payload to connected client'` — connect client, `broadcast('card:created', { id: '123' })`, `waitForMessage`, assert `msg.event === 'card:created'` and `msg.payload.id === '123'`
2. `'sends to all connected clients'` — connect 3 clients, broadcast, `Promise.all` three `waitForMessage`, assert all three get same message
3. `'does not throw when no clients are connected'` — call `broadcast('empty', {})` with no clients connected, assert no error
4. `'message shape has both event and payload keys'` — broadcast any event, parse raw message, assert both keys exist
5. `'skips clients in non-OPEN state without throwing'` — connect 2 clients, terminate client1, broadcast, assert client2 receives message and no error is thrown

### Green

The `broadcast` function already covers all these cases from Subtask 1's implementation. No changes needed if Subtask 1 was implemented correctly.

---

## Subtask 3: Heartbeat/Ping Mechanism

### Red: Add tests to `ws.test.mjs`

**Helper:**
```js
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    )
  ]);
}
```

**Suite: `'Heartbeat / ping mechanism'`**
```
before: startWsServer({ pingInterval: 50 })
after:  closeWs() + httpServer.close()
```

Tests:
1. `'server sends a ping frame to connected client within pingInterval'` — connect client, `new Promise(r => client.once('ping', r))`, wrap in `withTimeout(, 200)`, assert resolves
2. `'client that responds to pings stays connected'` — connect client (ws library auto-pongs), wait 120ms (>2 intervals), assert `client.readyState === WebSocket.OPEN`
3. `'client that does not respond to pings is terminated'` — connect client, destroy underlying socket via `client._socket.destroy()` (simulates dead connection), wait 150ms, assert `client.readyState === WebSocket.CLOSED`
4. `'terminated dead client is removed (broadcast reaches only live clients)'` — connect clientA (alive) + clientB (immediately `_socket.destroy()`), wait 150ms, broadcast, `waitForMessage(clientA)` resolves, assert received
5. `'heartbeat interval is cleared after closeWs (no timer leak)'` — `closeWs()` resolves without hanging; no errors thrown after close

### Green

The heartbeat `setInterval` and pong handler were already implemented in Subtask 1. Tests should pass. If timing is flaky, bump the `withTimeout` duration.

---

## Subtask 4: Disconnection + Cleanup

### Red: Add tests to `ws.test.mjs`

**Suite: `'Client disconnection and cleanup'`**
```
before: startWsServer({ pingInterval: 5000 })  // slow heartbeat; this suite manages connections
after:  closeWs() + httpServer.close()
```

Tests:
1. `'graceful close removes client from set'` — connect clientA + clientB, `closeClient(clientA)`, broadcast, `waitForMessage(clientB)` succeeds (proves A was removed and B still connected)
2. `'close event removes client (broadcast count correct)'` — connect 3 clients, close 1, broadcast, await only 2 messages, assert 2 received
3. `'error on socket removes client from set'` — connect clientA + clientB, destroy clientB socket, wait 50ms, broadcast, only clientA receives
4. `'multiple rapid disconnections do not corrupt client set'` — connect 5 clients, `Promise.all` to close 3 simultaneously, wait 50ms, broadcast, exactly 2 messages received
5. `'broadcast is safe after all clients disconnect'` — connect and close all clients, call `broadcast('safe', {})`, assert no error thrown

### Green

All cleanup handlers (`close`, `error`) were implemented in Subtask 1. Tests should pass with correct handler wiring.

---

## package.json Update

**File:** `server/package.json` line 9

Change:
```json
"test": "node --test test/server.test.mjs test/db.test.mjs test/comments.test.mjs"
```
To:
```json
"test": "node --test test/server.test.mjs test/db.test.mjs test/comments.test.mjs test/ws.test.mjs"
```

---

## TDD Execution Order

For each subtask:
1. Write the tests (they fail — module not found or assertion errors)
2. Run: `cd server && npm test` → confirm RED
3. Implement the feature
4. Run: `cd server && npm test` → confirm GREEN
5. Refactor if needed

**Critical:** Since all four subtasks share one implementation file (`broadcaster.js`), write the complete implementation incrementally:
- After Subtask 1 tests: implement `initWs` + `closeWs` (no broadcast, no heartbeat yet) → Subtask 1 tests pass
- After Subtask 2 tests: add `broadcast` → Subtask 2 tests pass  
- After Subtask 3 tests: add heartbeat `setInterval` + pong handler → Subtask 3 tests pass  
- After Subtask 4 tests: verify `close`/`error` handlers already implemented → Subtask 4 tests pass

---

## Verification

Run the full server test suite to confirm all tests pass:
```bash
cd /Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-16/kanban/server
npm test
```

Expected: all existing tests (`server.test.mjs`, `db.test.mjs`, `comments.test.mjs`) remain green, plus new `ws.test.mjs` tests all pass.

Also verify the broadcaster exports are correct by checking they can be imported:
```bash
node -e "import('./ws/broadcaster.js').then(m => console.log(Object.keys(m)))"
```
Expected output: `[ 'initWs', 'broadcast', 'closeWs' ]`
