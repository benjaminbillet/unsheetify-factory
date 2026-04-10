import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../index.js'; // ← required by every test suite that starts a server

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(__dirname, '..'); // kanban/server/
const ROOT = resolve(SERVER_ROOT, '..'); // kanban/

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

// ── Subtask 1: Dependency availability ───────────────────────────────────────

describe('Dependencies availability', () => {
  const pkg = JSON.parse(readFileSync(join(SERVER_ROOT, 'package.json'), 'utf8'));

  it('express can be imported', async () => {
    const { default: express } = await import('express');
    assert.strictEqual(typeof express, 'function');
  });

  it('cors can be imported', async () => {
    const { default: cors } = await import('cors');
    assert.strictEqual(typeof cors, 'function');
  });

  it('better-sqlite3 can be imported', async () => {
    const { default: Database } = await import('better-sqlite3');
    assert.strictEqual(typeof Database, 'function');
  });

  it('ws can be imported', async () => {
    const { default: WebSocket } = await import('ws');
    assert.ok(typeof WebSocket === 'function' || typeof WebSocket.WebSocket === 'function');
  });

  it('uuid v4 produces valid UUID', async () => {
    const { v4: uuidv4 } = await import('uuid');
    assert.match(uuidv4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('package.json lists express dependency', () => {
    assert.ok(pkg.dependencies.express);
  });

  it('package.json lists cors dependency', () => {
    assert.ok(pkg.dependencies.cors);
  });

  it('package.json lists better-sqlite3 dependency', () => {
    assert.ok(pkg.dependencies['better-sqlite3']);
  });

  it('package.json lists ws dependency', () => {
    assert.ok(pkg.dependencies.ws);
  });

  it('package.json lists uuid dependency', () => {
    assert.ok(pkg.dependencies.uuid);
  });

  it('nodemon is a devDependency', () => {
    assert.ok(pkg.devDependencies.nodemon);
  });
});

// ── Subtask 2: CORS and JSON middleware ───────────────────────────────────────

describe('CORS configuration', () => {
  let server, baseUrl;

  before(async () => {
    const app = createApp();
    ({ server, baseUrl } = await startTestServer(app));
  });

  after(async () => {
    await stopServer(server);
  });

  it('Access-Control-Allow-Origin present on /health with Origin header', async () => {
    const res = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.ok(
      res.headers.get('access-control-allow-origin'),
      'Expected access-control-allow-origin header to be present'
    );
  });

  it('OPTIONS preflight returns 2xx', async () => {
    const res = await fetch(`${baseUrl}/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
      },
    });
    assert.ok(res.status < 300, `Expected status < 300, got ${res.status}`);
  });
});

describe('JSON body parsing', () => {
  let server, baseUrl;

  before(async () => {
    const app = createApp();
    ({ server, baseUrl } = await startTestServer(app));
  });

  after(async () => {
    await stopServer(server);
  });

  it('parses JSON body and echoes it back', async () => {
    const res = await fetch(`${baseUrl}/dev/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'value' }),
    });
    const body = await res.json();
    assert.deepStrictEqual(body, { test: 'value' });
  });

  it('returns 4xx on malformed JSON body', async () => {
    const res = await fetch(`${baseUrl}/dev/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-valid-json{',
    });
    assert.strictEqual(res.status, 400);
  });
});

// ── Subtask 3: Health endpoint and error handling ─────────────────────────────

describe('GET /health', () => {
  let server, baseUrl;

  before(async () => {
    const app = createApp();
    ({ server, baseUrl } = await startTestServer(app));
  });

  after(async () => {
    await stopServer(server);
  });

  it('returns HTTP 200', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.strictEqual(res.status, 200);
  });

  it('returns { ok: true }', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();
    assert.deepStrictEqual(body, { ok: true });
  });

  it('returns Content-Type: application/json', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.ok(
      res.headers.get('content-type')?.includes('application/json'),
      'Expected content-type to include application/json'
    );
  });
});

describe('Error handling middleware', () => {
  let server, baseUrl;

  before(async () => {
    const app = createApp();
    ({ server, baseUrl } = await startTestServer(app));
  });

  after(async () => {
    await stopServer(server);
  });

  it('returns 500 for unhandled errors', async () => {
    const res = await fetch(`${baseUrl}/dev/error`);
    assert.strictEqual(res.status, 500);
  });

  it('response body has "error" string field', async () => {
    const res = await fetch(`${baseUrl}/dev/error`);
    const body = await res.json();
    assert.strictEqual(typeof body.error, 'string');
  });

  it('uses err.status when provided (e.g. 404)', async () => {
    const res = await fetch(`${baseUrl}/dev/error?status=404`);
    assert.strictEqual(res.status, 404);
  });
});

describe('404 for unknown routes', () => {
  let server, baseUrl;

  before(async () => {
    const app = createApp();
    ({ server, baseUrl } = await startTestServer(app));
  });

  after(async () => {
    await stopServer(server);
  });

  it('unknown GET returns 404', async () => {
    const res = await fetch(`${baseUrl}/this-route-does-not-exist`);
    assert.strictEqual(res.status, 404);
  });

  it('404 response body has "error" field', async () => {
    const res = await fetch(`${baseUrl}/this-route-does-not-exist`);
    const body = await res.json();
    assert.ok(body.error, 'Expected body.error to exist');
  });
});

// ── Subtask 4: Static files and nodemon config ────────────────────────────────

describe('Static file serving in production', () => {
  let server, baseUrl, distExisted;
  const distPath = join(ROOT, 'client', 'dist'); // → kanban/client/dist

  before(async () => {
    distExisted = existsSync(distPath);
    mkdirSync(distPath, { recursive: true });
    writeFileSync(join(distPath, 'index.html'), '<html><body>Test App</body></html>');

    const savedEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const app = createApp(); // reads NODE_ENV at call time → isProduction=true
    process.env.NODE_ENV = savedEnv;

    ({ server, baseUrl } = await startTestServer(app));
  });

  after(async () => {
    await stopServer(server);
    if (!distExisted) rmSync(distPath, { recursive: true, force: true });
  });

  it('serves index.html from client/dist for GET /', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.strictEqual(res.status, 200);
    // NOTE: res.sendFile serves HTML — use response.text(), NOT response.json()
    const body = await res.text();
    assert.ok(body.includes('Test App'), `Expected body to contain 'Test App', got: ${body}`);
  });

  it('serves index.html for unknown SPA paths (fallback)', async () => {
    const res = await fetch(`${baseUrl}/some/spa/route`);
    assert.strictEqual(res.status, 200);
    // NOTE: res.sendFile serves HTML — use response.text(), NOT response.json()
    const body = await res.text();
    assert.ok(body.includes('Test App'), `Expected body to contain 'Test App', got: ${body}`);
  });
});

describe('Nodemon configuration', () => {
  const pkg = JSON.parse(readFileSync(join(SERVER_ROOT, 'package.json'), 'utf8'));

  it('server package.json scripts.dev uses nodemon', () => {
    assert.ok(pkg.scripts?.dev, 'Expected scripts.dev to exist');
    assert.match(pkg.scripts.dev, /nodemon/);
  });

  it('server package.json has nodemonConfig with watch and ext fields', () => {
    assert.ok(pkg.nodemonConfig, 'Expected nodemonConfig to exist');
    assert.ok(Array.isArray(pkg.nodemonConfig.watch), 'Expected nodemonConfig.watch to be an array');
    assert.ok(pkg.nodemonConfig.ext, 'Expected nodemonConfig.ext to exist');
  });
});
