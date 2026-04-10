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
  it('eslint is a devDependency',        () => assert.ok(readPkg('client/package.json').devDependencies?.eslint));
});

describe('Client scripts', () => {
  it('has scripts.test', () => assert.ok(readPkg('client/package.json').scripts?.test));
  it('has scripts.lint', () => assert.ok(readPkg('client/package.json').scripts?.lint));
});

describe('Client files', () => {
  const files = [
    'client/eslint.config.js',
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

// NOTE: readFileSync is called inside each it() — never at describe() level —
// so a missing file fails this specific test cleanly instead of crashing the suite.
describe('vite.config.js proxy settings', () => {
  it('proxies /api to localhost:3001', () => {
    const cfg = readFileSync(resolve(ROOT, 'client/vite.config.js'), 'utf-8');
    assert.ok(cfg.includes("'/api'") || cfg.includes('"/api"'));
    assert.ok(cfg.includes('localhost:3001'));
  });

  it('proxies /ws with ws: true', () => {
    const cfg = readFileSync(resolve(ROOT, 'client/vite.config.js'), 'utf-8');
    assert.ok(cfg.includes("'/ws'") || cfg.includes('"/ws"'));
    assert.ok(cfg.includes('ws: true'));
  });

  it('uses @vitejs/plugin-react', () => {
    const cfg = readFileSync(resolve(ROOT, 'client/vite.config.js'), 'utf-8');
    assert.ok(cfg.includes('@vitejs/plugin-react'));
  });

  it('configures vitest environment as jsdom', () => {
    const cfg = readFileSync(resolve(ROOT, 'client/vite.config.js'), 'utf-8');
    assert.ok(cfg.includes('jsdom'));
  });
});
