# Task 2: Setup Vite + React Client Application

## Context

The Kanban Board monorepo scaffold (Task 1) is complete. The `kanban/client/` workspace exists with a minimal `package.json` (no dependencies, no source files). This task wires up the Vite + React frontend so the dev server runs on `localhost:5173` with API/WebSocket proxy forwarding to the backend at `localhost:3001`.

TDD approach: structural tests (using the existing `node:test` pattern from `test/setup.test.mjs`) are written first and fail; then implementation makes them pass. Component tests (Vitest + React Testing Library) follow the same red→green cycle.

---

## Critical Files

| File | Action |
|------|--------|
| `kanban/test/client.setup.test.mjs` | **Create** – structural/config tests (node:test) |
| `kanban/client/package.json` | **Modify** – add deps & test script |
| `kanban/client/vite.config.js` | **Create** – Vite config with proxy + Vitest settings |
| `kanban/client/index.html` | **Create** – HTML entry with meta tags |
| `kanban/client/src/main.jsx` | **Create** – React root mount |
| `kanban/client/src/App.jsx` | **Create** – App shell component |
| `kanban/client/src/App.css` | **Create** – minimal baseline styles |
| `kanban/client/src/test-setup.js` | **Create** – Vitest global setup (`@testing-library/jest-dom`) |
| `kanban/client/src/App.test.jsx` | **Create** – Vitest + RTL component tests |

All commands run from `kanban/` (the workspace root) unless noted.

---

## Subtask 1 — Initialize Vite React project and install dependencies

### 1a. RED — Write failing structural tests

Create `kanban/test/client.setup.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function readPkg(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf-8'));
}

describe('Client dependencies', () => {
  it('react is a dependency',            () => assert.ok(readPkg('client/package.json').dependencies?.react));
  it('react-dom is a dependency',        () => assert.ok(readPkg('client/package.json').dependencies?.['react-dom']));
  it('vite is a devDependency',          () => assert.ok(readPkg('client/package.json').devDependencies?.vite));
  it('@vitejs/plugin-react is a devDep', () => assert.ok(readPkg('client/package.json').devDependencies?.['@vitejs/plugin-react']));
  it('vitest is a devDependency',        () => assert.ok(readPkg('client/package.json').devDependencies?.vitest));
  it('@testing-library/react is a devDep',    () => assert.ok(readPkg('client/package.json').devDependencies?.['@testing-library/react']));
  it('@testing-library/jest-dom is a devDep', () => assert.ok(readPkg('client/package.json').devDependencies?.['@testing-library/jest-dom']));
  it('jsdom is a devDependency',         () => assert.ok(readPkg('client/package.json').devDependencies?.jsdom));
});

describe('Client scripts', () => {
  it('has scripts.test', () => assert.ok(readPkg('client/package.json').scripts?.test));
});

describe('Client files', () => {
  const files = [
    'client/vite.config.js',
    'client/index.html',
    'client/src/main.jsx',
    'client/src/App.jsx',
    'client/src/App.test.jsx',
  ];
  for (const f of files) {
    it(`exists: ${f}`, () => assert.ok(existsSync(resolve(ROOT, f)), `Missing: kanban/${f}`));
  }
});
```

Run to confirm RED: `node --test test/client.setup.test.mjs`

### 1b. GREEN — Update package.json and install

Update `kanban/client/package.json`:

```json
{
  "name": "kanban-client",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev":     "vite",
    "build":   "vite build",
    "preview": "vite preview",
    "test":    "vitest run"
  },
  "dependencies": {
    "react":     "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.6",
    "@testing-library/react":    "^16.0.0",
    "@vitejs/plugin-react":      "^4.3.1",
    "jsdom":   "^24.1.1",
    "vite":    "^5.3.4",
    "vitest":  "^2.0.5"
  }
}
```

Then install from the workspace root: `npm install` (in `kanban/`)

---

## Subtask 2 — Configure vite.config.js with proxy settings

### 2a. RED — Add proxy config assertions to the test file

Extend `kanban/test/client.setup.test.mjs` with:

```js
describe('vite.config.js proxy settings', () => {
  const configText = readFileSync(resolve(ROOT, 'client/vite.config.js'), 'utf-8');

  it('proxies /api to localhost:3001', () => {
    assert.ok(configText.includes("'/api'") || configText.includes('"/api"'));
    assert.ok(configText.includes('localhost:3001'));
  });

  it('proxies /ws with ws: true', () => {
    assert.ok(configText.includes("'/ws'") || configText.includes('"/ws"'));
    assert.ok(configText.includes('ws: true'));
  });

  it('uses @vitejs/plugin-react', () => {
    assert.ok(configText.includes('@vitejs/plugin-react'));
  });

  it('configures vitest environment as jsdom', () => {
    assert.ok(configText.includes('jsdom'));
  });
});
```

Run to confirm RED (file doesn't exist yet).

### 2b. GREEN — Create vite.config.js

Create `kanban/client/vite.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
  },
})
```

---

## Subtask 3 — Set up basic App.jsx structure and verify HMR

### 3a. RED — Write failing Vitest component tests

Create `kanban/client/src/App.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App.jsx'

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />)
    // no error thrown = pass
  })

  it('renders a top-level heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('renders "Kanban Board" as the heading text', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /kanban board/i })).toBeInTheDocument()
  })

  it('renders an app container element', () => {
    const { container } = render(<App />)
    expect(container.querySelector('.app')).toBeInTheDocument()
  })
})
```

Run to confirm RED: `npm -w client run test` (App.jsx doesn't exist yet, import will fail)

### 3b. GREEN — Create remaining source files

**`kanban/client/src/test-setup.js`**
```js
import '@testing-library/jest-dom'
```

**`kanban/client/src/App.jsx`**
```jsx
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Kanban Board</h1>
      </header>
      <main className="app-main">
        {/* Board component will be rendered here */}
      </main>
    </div>
  )
}

export default App
```

**`kanban/client/src/App.css`**
```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #f0f2f5;
  color: #1a1a2e;
}

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  padding: 1rem 1.5rem;
  background: #1a1a2e;
  color: #ffffff;
}

.app-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
}

.app-main {
  flex: 1;
  padding: 1.5rem;
}
```

**`kanban/client/src/main.jsx`**
```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**`kanban/client/index.html`**
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Self-hosted Kanban board for small teams" />
    <title>Kanban Board</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

---

## Execution Order (strict TDD sequence)

1. **Create** `kanban/test/client.setup.test.mjs` with all `node:test` tests
2. **Run RED**: `node --test test/client.setup.test.mjs` → all fail
3. **Update** `kanban/client/package.json` with deps + test script
4. **Run** `npm install` from `kanban/`
5. **Create** `kanban/client/vite.config.js`
6. **Create** `kanban/client/index.html`
7. **Create** `kanban/client/src/test-setup.js`
8. **Create** `kanban/client/src/App.test.jsx` (Vitest tests)
9. **Run RED**: `npm -w client run test` → App tests fail (no App.jsx yet)
10. **Create** `kanban/client/src/App.jsx`
11. **Create** `kanban/client/src/App.css`
12. **Create** `kanban/client/src/main.jsx`
13. **Run GREEN**: `npm -w client run test` → all Vitest tests pass
14. **Run GREEN**: `node --test test/client.setup.test.mjs` → all structural tests pass

---

## Verification

```bash
# 1. Structural tests (from kanban/)
node --test test/client.setup.test.mjs

# 2. Component unit tests
npm -w client run test

# 3. Dev server smoke test (manual)
npm -w client run dev
# → open http://localhost:5173 → "Kanban Board" heading renders
# → edit src/App.jsx → browser updates instantly (HMR)
```

All 3 checks must pass before this task is complete.
