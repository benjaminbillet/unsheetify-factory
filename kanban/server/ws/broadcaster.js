import { WebSocketServer } from 'ws';

// WebSocket.OPEN = 1 — use numeric constant to avoid importing the WebSocket class
const WS_OPEN = 1;

let wss = null;
let clients = new Set();
let heartbeatInterval = null;

function initWs(httpServer, { pingInterval = 30000 } = {}) {
  // Defensive: clear any existing state from a previous call without closeWs
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
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

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  });
}

function broadcast(event, payload) {
  const data = JSON.stringify({ event, payload });
  for (const client of clients) {
    if (client.readyState === WS_OPEN) {
      try {
        client.send(data);
      } catch {
        // Isolate per-client send errors; do not crash the broadcaster
      }
    }
  }
}

// closeWs: exported for test teardown; terminates all open connections so
// wss.close() does not hang waiting for them to close naturally.
async function closeWs() {
  clearInterval(heartbeatInterval);
  heartbeatInterval = null;
  for (const client of clients) {
    client.terminate();
  }
  clients = new Set();
  if (wss) {
    await new Promise((resolve) => wss.close(resolve));
    wss = null;
  }
}

export { initWs, broadcast, closeWs };
