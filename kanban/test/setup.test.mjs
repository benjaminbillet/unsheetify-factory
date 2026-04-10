import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');  // kanban/ root

function readPkg(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf-8'));
}

// ── Subtask 1: Root package.json ─────────────────────────────────────────────
describe('Root package.json', () => {
  it('file exists', () => assert.ok(existsSync(resolve(ROOT, 'package.json'))));
  it('has private: true',       () => assert.equal(readPkg('package.json').private, true));
  it('has name "kanban-app"',   () => assert.equal(readPkg('package.json').name, 'kanban-app'));
  it('has version "1.0.0"',     () => assert.equal(readPkg('package.json').version, '1.0.0'));
  it('workspaces contains "client"', () => assert.ok(readPkg('package.json').workspaces?.includes('client')));
  it('workspaces contains "server"', () => assert.ok(readPkg('package.json').workspaces?.includes('server')));
});

// ── Subtask 2: npm scripts & concurrently ────────────────────────────────────
describe('Root npm scripts', () => {
  it('has scripts.dev', () => assert.ok(readPkg('package.json').scripts?.dev));
  it('scripts.dev uses concurrently', () => assert.match(readPkg('package.json').scripts.dev, /concurrently/));
  it('scripts.dev references client dev', () => assert.match(readPkg('package.json').scripts.dev, /client/));
  it('scripts.dev references server dev', () => assert.match(readPkg('package.json').scripts.dev, /server/));
  it('has scripts.build', () => assert.ok(readPkg('package.json').scripts?.build));
  it('has scripts.start', () => assert.ok(readPkg('package.json').scripts?.start));
  it('devDependencies includes concurrently', () =>
    assert.ok(readPkg('package.json').devDependencies?.concurrently));
});

// ── Subtask 3: Directory structure ───────────────────────────────────────────
describe('Directory structure', () => {
  const dirs = [
    'client',
    'client/src',
    'server',
    'server/db',
    'server/api',
    'server/ws',
  ];
  for (const dir of dirs) {
    it(`directory exists: ${dir}`, () =>
      assert.ok(existsSync(resolve(ROOT, dir)), `Missing: kanban/${dir}/`));
  }
});

// ── Subtask 4: Workspace package.json files ──────────────────────────────────
describe('Client package.json', () => {
  it('file exists', () => assert.ok(existsSync(resolve(ROOT, 'client/package.json'))));
  it('name is "kanban-client"', () => assert.equal(readPkg('client/package.json').name, 'kanban-client'));
  it('has scripts.dev',     () => assert.ok(readPkg('client/package.json').scripts?.dev));
  it('has scripts.build',   () => assert.ok(readPkg('client/package.json').scripts?.build));
  it('has scripts.preview', () => assert.ok(readPkg('client/package.json').scripts?.preview));
});

describe('Server package.json', () => {
  it('file exists', () => assert.ok(existsSync(resolve(ROOT, 'server/package.json'))));
  it('name is "kanban-server"', () => assert.equal(readPkg('server/package.json').name, 'kanban-server'));
  it('has scripts.dev',   () => assert.ok(readPkg('server/package.json').scripts?.dev));
  it('has scripts.start', () => assert.ok(readPkg('server/package.json').scripts?.start));
});
