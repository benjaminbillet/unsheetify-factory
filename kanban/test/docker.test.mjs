import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Subtask 1: Dockerfile ─────────────────────────────────────────────────

describe('Dockerfile', () => {
  const dockerfilePath = resolve(ROOT, 'Dockerfile');

  it('Dockerfile exists', () => assert.ok(existsSync(dockerfilePath)));

  it('uses node:20-alpine as base image', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.ok(content.includes('node:20-alpine'), 'Expected node:20-alpine');
  });

  it('has a named build stage (FROM node:20-alpine AS build)', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.match(content, /FROM node:20-alpine AS build/i);
  });

  it('has a named runtime stage (FROM node:20-alpine AS runtime)', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.match(content, /FROM node:20-alpine AS runtime/i);
  });

  it('installs native build tools in build stage (apk add python3)', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.ok(
      content.includes('apk add') && content.includes('python3'),
      'Expected apk add with python3 for better-sqlite3 native compilation'
    );
  });

  it('runs npm run build in build stage', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.ok(content.includes('npm run build'), 'Expected npm run build command');
  });

  it('prunes devDependencies in build stage before copying to runtime', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.ok(content.includes('npm prune'), 'Expected npm prune --omit=dev in build stage');
  });

  it('copies pre-built node_modules from build stage into runtime', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.ok(
      content.includes('--from=build') && content.includes('node_modules'),
      'Expected COPY --from=build ... node_modules'
    );
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

  it('runs as a non-root user (USER directive present)', () => {
    const content = readFileSync(dockerfilePath, 'utf-8');
    assert.match(content, /^USER\s+\S+/m, 'Expected a USER directive for non-root execution');
  });
});

// ── Subtask 2: docker-compose.yml ─────────────────────────────────────────

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

  it('sets DB_PATH explicitly to /app/data/kanban.db', () => {
    const content = readFileSync(composePath, 'utf-8');
    assert.ok(
      content.includes('DB_PATH=/app/data/kanban.db'),
      'Expected explicit DB_PATH pointing to the named volume mount'
    );
  });

  it('has a restart policy', () => {
    const content = readFileSync(composePath, 'utf-8');
    assert.ok(content.includes('restart:'), 'Expected restart policy');
  });
});

// ── Subtask 2: .dockerignore ──────────────────────────────────────────────

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

  it('excludes client/dist (built inside Docker, not needed from host)', () => {
    const content = readFileSync(ignorePath, 'utf-8');
    assert.ok(content.includes('client/dist'));
  });
});

// ── Subtask 3: Environment variables and DB path ──────────────────────────

describe('Production DB path configuration', () => {
  it('server/index.js reads DB_PATH from environment', () => {
    const code = readFileSync(resolve(ROOT, 'server', 'index.js'), 'utf-8');
    assert.ok(
      code.includes('DB_PATH'),
      'Expected server/index.js to read DB_PATH env var'
    );
  });
});
