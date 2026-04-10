import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { initWs, broadcast, closeWs } from '../ws/broadcaster.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

async function stopWsServer(httpServer) {
  await closeWs();
  await new Promise((resolve) => httpServer.close(resolve));
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

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ── Subtask 1: WebSocket server setup and client connection ───────────────────

describe('WebSocket server setup and client connection', () => {
  let httpServer, wsUrl;

  before(async () => {
    ({ httpServer, wsUrl } = await startWsServer());
  });

  after(async () => {
    await stopWsServer(httpServer);
  });

  it('initWs and broadcast are exported functions', () => {
    assert.strictEqual(typeof initWs, 'function');
    assert.strictEqual(typeof broadcast, 'function');
  });

  it('a client can connect successfully', async () => {
    const ws = await connectClient(wsUrl);
    assert.strictEqual(ws.readyState, WebSocket.OPEN);
    await closeClient(ws);
  });

  it('multiple clients can connect simultaneously', async () => {
    const clients = await Promise.all([
      connectClient(wsUrl),
      connectClient(wsUrl),
      connectClient(wsUrl),
    ]);
    for (const ws of clients) {
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
    }
    await Promise.all(clients.map(closeClient));
  });
});

// ── Subtask 2: broadcast(event, payload) ─────────────────────────────────────

describe('broadcast(event, payload)', () => {
  let httpServer, wsUrl;

  before(async () => {
    ({ httpServer, wsUrl } = await startWsServer());
  });

  after(async () => {
    await stopWsServer(httpServer);
  });

  it('connected client is tracked — broadcast reaches it', async () => {
    const ws = await connectClient(wsUrl);
    const msgPromise = waitForMessage(ws); // register BEFORE calling broadcast
    broadcast('test', { x: 1 });
    const msg = await withTimeout(msgPromise, 300);
    assert.ok(msg);
    await closeClient(ws);
  });

  it('sends JSON with correct event type', async () => {
    const ws = await connectClient(wsUrl);
    const msgPromise = waitForMessage(ws);
    broadcast('card:created', { id: '123' });
    const msg = await withTimeout(msgPromise, 300);
    assert.strictEqual(msg.event, 'card:created');
    await closeClient(ws);
  });

  it('sends correct payload', async () => {
    const ws = await connectClient(wsUrl);
    const msgPromise = waitForMessage(ws);
    broadcast('update', { n: 42 });
    const msg = await withTimeout(msgPromise, 300);
    assert.strictEqual(msg.payload.n, 42);
    await closeClient(ws);
  });

  it('sends to all connected clients', async () => {
    const [c1, c2, c3] = await Promise.all([
      connectClient(wsUrl),
      connectClient(wsUrl),
      connectClient(wsUrl),
    ]);
    // Register all message listeners BEFORE broadcasting (avoids race condition)
    const promises = Promise.all([waitForMessage(c1), waitForMessage(c2), waitForMessage(c3)]);
    broadcast('multi', { v: 7 });
    const results = await withTimeout(promises, 500);
    for (const msg of results) {
      assert.strictEqual(msg.event, 'multi');
      assert.strictEqual(msg.payload.v, 7);
    }
    await Promise.all([closeClient(c1), closeClient(c2), closeClient(c3)]);
  });

  it('message has both event and payload keys', async () => {
    const ws = await connectClient(wsUrl);
    const msgPromise = waitForMessage(ws);
    broadcast('shape-test', { a: 1 });
    const msg = await withTimeout(msgPromise, 300);
    assert.ok('event' in msg, 'message must have event key');
    assert.ok('payload' in msg, 'message must have payload key');
    await closeClient(ws);
  });

  it('does not throw when no clients are connected', () => {
    assert.doesNotThrow(() => broadcast('empty', {}));
  });

  it('skips terminated clients without throwing', async () => {
    const c1 = await connectClient(wsUrl);
    const c2 = await connectClient(wsUrl);
    // Terminate c1 and wait for close event to propagate server-side
    await new Promise((resolve) => {
      c1.once('close', resolve);
      c1.terminate();
    });
    const msgPromise = waitForMessage(c2);
    broadcast('skip-test', {});
    const msg = await withTimeout(msgPromise, 300);
    assert.strictEqual(msg.event, 'skip-test');
    await closeClient(c2);
  });
});

// ── Subtask 3: Heartbeat / ping mechanism ────────────────────────────────────

describe('Heartbeat / ping mechanism', () => {
  let httpServer, wsUrl;

  before(async () => {
    ({ httpServer, wsUrl } = await startWsServer({ pingInterval: 50 }));
  });

  after(async () => {
    await stopWsServer(httpServer);
  });

  it('server sends ping frames to connected clients at pingInterval', async () => {
    const ws = await connectClient(wsUrl);
    const pingPromise = new Promise((resolve) => ws.once('ping', resolve));
    await withTimeout(pingPromise, 300);
    await closeClient(ws);
  });

  it('client that responds to pings remains connected after multiple heartbeat cycles', async () => {
    const ws = await connectClient(wsUrl);
    // ws library auto-pongs on ping (RFC 6455 compliant); wait 3+ cycles
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.strictEqual(ws.readyState, WebSocket.OPEN);
    await closeClient(ws);
  });

  it('dead TCP connection is detected and removed from client set', async () => {
    const clientAlive = await connectClient(wsUrl);
    const clientDead = await connectClient(wsUrl);
    // Destroy the underlying socket without sending a WS close frame
    clientDead._socket.destroy();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const msgPromise = waitForMessage(clientAlive);
    broadcast('check', {});
    const msg = await withTimeout(msgPromise, 300);
    assert.strictEqual(msg.event, 'check');
    await closeClient(clientAlive);
  });

  it('only live clients receive broadcast after dead connection cleanup', async () => {
    const [c1, c2, cDead] = await Promise.all([
      connectClient(wsUrl),
      connectClient(wsUrl),
      connectClient(wsUrl),
    ]);
    cDead._socket.destroy();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const p1 = waitForMessage(c1);
    const p2 = waitForMessage(c2);
    broadcast('count-check', {});
    const [m1, m2] = await withTimeout(Promise.all([p1, p2]), 500);
    assert.strictEqual(m1.event, 'count-check');
    assert.strictEqual(m2.event, 'count-check');
    await Promise.all([closeClient(c1), closeClient(c2)]);
  });

  it('heartbeat interval is cleared when closeWs is called (no timer leak)', async () => {
    const ws = await connectClient(wsUrl);
    const pingPromise = new Promise((resolve) => ws.once('ping', resolve));
    await withTimeout(pingPromise, 300);
    await closeClient(ws);
    // after() hook calls closeWs() — if it hangs the suite fails
  });
});

// ── Subtask 4: Client disconnection and cleanup ───────────────────────────────

describe('Client disconnection and cleanup', () => {
  let httpServer, wsUrl;

  before(async () => {
    // Slow heartbeat so this suite tests disconnect paths, not heartbeat paths
    ({ httpServer, wsUrl } = await startWsServer({ pingInterval: 5000 }));
  });

  after(async () => {
    await stopWsServer(httpServer);
  });

  it('graceful close removes client from tracked set', async () => {
    const clientA = await connectClient(wsUrl);
    const clientB = await connectClient(wsUrl);
    await closeClient(clientA);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const msgPromise = waitForMessage(clientB);
    broadcast('after-close', {});
    const msg = await withTimeout(msgPromise, 300);
    assert.strictEqual(msg.event, 'after-close');
    await closeClient(clientB);
  });

  it('only the disconnected client is removed (others stay tracked)', async () => {
    const [c1, c2, c3] = await Promise.all([
      connectClient(wsUrl),
      connectClient(wsUrl),
      connectClient(wsUrl),
    ]);
    await closeClient(c1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const p2 = waitForMessage(c2);
    const p3 = waitForMessage(c3);
    broadcast('remaining', {});
    const [m2, m3] = await withTimeout(Promise.all([p2, p3]), 500);
    assert.strictEqual(m2.event, 'remaining');
    assert.strictEqual(m3.event, 'remaining');
    await Promise.all([closeClient(c2), closeClient(c3)]);
  });

  it('error event on socket removes client', async () => {
    const clientA = await connectClient(wsUrl);
    const clientB = await connectClient(wsUrl);
    clientB._socket.destroy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const msgPromise = waitForMessage(clientA);
    broadcast('error-cleanup', {});
    const msg = await withTimeout(msgPromise, 300);
    assert.strictEqual(msg.event, 'error-cleanup');
    await closeClient(clientA);
  });

  it('multiple simultaneous disconnections do not corrupt client set', async () => {
    const all = await Promise.all([
      connectClient(wsUrl),
      connectClient(wsUrl),
      connectClient(wsUrl),
      connectClient(wsUrl),
      connectClient(wsUrl),
    ]);
    await Promise.all([closeClient(all[0]), closeClient(all[1]), closeClient(all[2])]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const p3 = waitForMessage(all[3]);
    const p4 = waitForMessage(all[4]);
    broadcast('multi-disconnect', {});
    const [m3, m4] = await withTimeout(Promise.all([p3, p4]), 500);
    assert.strictEqual(m3.event, 'multi-disconnect');
    assert.strictEqual(m4.event, 'multi-disconnect');
    await Promise.all([closeClient(all[3]), closeClient(all[4])]);
  });

  it('broadcast is safe when all clients have disconnected', async () => {
    const [c1, c2] = await Promise.all([connectClient(wsUrl), connectClient(wsUrl)]);
    await Promise.all([closeClient(c1), closeClient(c2)]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.doesNotThrow(() => broadcast('all-gone', {}));
  });
});

// ── Isolated: closeWs with open connections ───────────────────────────────────

describe('closeWs with open connections', () => {
  it('closeWs terminates all connected clients and resolves', async () => {
    const { httpServer, wsUrl } = await startWsServer();
    await Promise.all([connectClient(wsUrl), connectClient(wsUrl), connectClient(wsUrl)]);
    await withTimeout(stopWsServer(httpServer), 2000);
  });
});
