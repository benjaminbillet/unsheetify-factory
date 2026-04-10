# QA Report — Task 14: Integrate BlockNote Rich Text Editor

**Date:** 2026-04-10  
**Worktree:** `/Users/benjamin/.sofactory/worktrees/kanban-board/kanban-board-14`  
**Commit:** `4b67355` — _feat(kanban-board): task 14 - Integrate BlockNote rich text editor_  
**Reviewer role:** QA Engineer (read-only, no fixes applied)

---

## 1. Project Structure Overview

```
kanban-board-14/
└── kanban/
    ├── package.json               # Workspace root (client + server workspaces)
    ├── test/
    │   ├── setup.test.mjs         # Root structural tests (49 tests)
    │   └── client.setup.test.mjs  # Client dependency/file tests
    ├── client/
    │   ├── package.json           # Vitest, ESLint, Vite scripts
    │   ├── eslint.config.js
    │   ├── vite.config.js
    │   └── src/
    │       └── components/
    │           ├── Board/
    │           │   └── CardModal.jsx / CardModal.test.jsx  ← modified
    │           └── CardModal/
    │               ├── BlockEditor.jsx        ← NEW
    │               ├── BlockEditor.css        ← NEW
    │               └── BlockEditor.test.jsx   ← NEW
    └── server/
        ├── package.json
        └── (node_modules NOT installed in worktree)
```

### Files changed in this task (from `git diff HEAD~1 --name-only`):

| File | Status |
|------|--------|
| `kanban/client/package.json` | Modified — added `@blocknote/core` and `@blocknote/react` |
| `kanban/client/src/components/Board/CardModal.jsx` | Modified — integrated BlockEditor |
| `kanban/client/src/components/Board/CardModal.test.jsx` | Modified — added description test suite |
| `kanban/client/src/components/CardModal/BlockEditor.css` | New file |
| `kankan/client/src/components/CardModal/BlockEditor.jsx` | New file |
| `kanban/client/src/components/CardModal/BlockEditor.test.jsx` | New file |
| `kanban/package-lock.json` | Modified — added BlockNote lock entries |

---

## 2. Commands Found

| # | Command | Source |
|---|---------|--------|
| 1 | `npm -w client run test` | `client/package.json` → `scripts.test` (Vitest) |
| 2 | `npm -w client run lint` | `client/package.json` → `scripts.lint` (ESLint) |
| 3 | `npm -w client run build` | `client/package.json` → `scripts.build` (Vite) |
| 4 | `npm -w server run test` | Root `package.json` → `scripts.test:server` |
| 5 | `node --test test/*.test.mjs` | Root `package.json` → `scripts.test:setup` |

No `Makefile` found. No TypeScript typecheck script (project uses plain JS/JSX, no `tsconfig.json`).

---

## 3. Command Results

### 3.1 `npm -w client run test` — ✅ PASS

**Exit code:** 0

```
 Test Files  11 passed (11)
      Tests  365 passed (365)
   Start at  18:18:49
   Duration  5.75s
```

All 365 tests pass across 11 test files. Task-14-relevant results:

| File | Tests | Result |
|------|-------|--------|
| `src/components/CardModal/BlockEditor.test.jsx` | 32 | ✅ All pass |
| `src/components/Board/CardModal.test.jsx` | 60 | ✅ All pass (5 new description tests included) |

**Warnings (pre-existing, not introduced by this task):**  
Four tests in `src/hooks/useBoard.test.js` emit React `act(...)` warnings to stderr. These do not cause test failures and originate from code unchanged by this task.

```
Warning: An update to TestComponent inside a test was not wrapped in act(...)
  > WebSocket integration — initialization > calls useWebSocket with a ws:// URL containing /ws
  > WebSocket integration — initialization > subscribes to all 5 event types
  > WebSocket integration — initialization > passes an onEvent callback to useWebSocket
  > multi-client state consistency > refetches board state when WebSocket reconnects after disconnect
```

---

### 3.2 `npm -w client run lint` — ✅ PASS

**Exit code:** 0  
No ESLint errors or warnings. The `BlockEditor.jsx` uses one intentional `// eslint-disable-next-line react-hooks/exhaustive-deps` on the Escape-key `useEffect`, which is acceptable given the stable semantics of `handleCancel`.

---

### 3.3 `npm -w client run build` — ✅ PASS (with expected warning)

**Exit code:** 0

```
vite v5.4.21 building for production...
✓ 558 modules transformed.
dist/index.html                     0.48 kB │ gzip:   0.31 kB
dist/assets/index-BZa6x_DO.css     29.84 kB │ gzip:   6.03 kB
dist/assets/module-BvCTiNll.js     77.23 kB │ gzip:  27.78 kB
dist/assets/native-B5Vb9Oiz.js    380.35 kB │ gzip:  82.06 kB
dist/assets/index-dV7-MwWi.js   1,354.66 kB │ gzip: 418.79 kB

(!) Some chunks are larger than 500 kB after minification.
✓ built in 1.44s
```

The large-chunk warning (~1.35 MB unminified) is expected: BlockNote bundles ProseMirror, Tiptap, and related dependencies. The build exits cleanly with code 0. No code-splitting of the editor is required by the task spec.

---

### 3.4 `npm -w server run test` — ❌ FAIL (pre-existing environment issue)

**Exit code:** 1

```
# tests 25  (only ws.test.mjs ran; other test files fail to load)
# pass 21
# fail 4
```

Four test files (`cards.test.mjs`, `comments.test.mjs`, `db.test.mjs`, `server.test.mjs`) immediately throw:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'express' imported from .../server/index.js
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'better-sqlite3' imported from .../server/db/queries.js
```

**Root cause:** `kanban/server/node_modules/` does not exist in the worktree (confirmed by `ls` returning "No such file or directory"). Server dependencies are not installed. This failure is identical across all prior task branches — it is a worktree environment setup issue, not introduced by Task 14. Task 14 only touches client-side files; no server code was modified.

---

### 3.5 `node --test test/*.test.mjs` — ✅ PASS

**Exit code:** 0

```
# tests 49
# suites 9
# pass 49
# fail 0
# duration_ms 45.148541
```

All 49 structural/scaffold tests pass (workspace layout, `package.json` shape, Vite proxy config, etc.).

---

## 4. Dependency Verification

| Package | Required by task | `client/package.json` entry | Installed version |
|---------|------------------|-----------------------------|-------------------|
| `@blocknote/react` | ✅ Yes | `^0.47.3` (dependencies) | 0.47.3 ✅ |
| `@blocknote/core` | ✅ Yes | `^0.47.3` (dependencies) | 0.47.3 ✅ |

Both packages are listed as runtime `dependencies` (not `devDependencies`), which is correct since they are included in the production bundle. They are hoisted to the workspace root `node_modules/@blocknote/`.

---

## 5. Feature Checklist Against Task Requirements

| Requirement | Status | Notes |
|-------------|--------|-------|
| Install `@blocknote/react` and `@blocknote/core` | ✅ PASS | Both at 0.47.3, listed as production deps |
| Create `client/src/components/CardModal/BlockEditor.jsx` | ✅ PASS | File exists, 114 lines, well-structured |
| Configure BlockNote with headings, paragraphs, bullet lists, numbered lists, and code blocks | ✅ PASS | Explicit `BlockNoteSchema.create` with exactly 5 block specs: `paragraph`, `heading`, `bulletListItem`, `numberedListItem`, `codeBlock` |
| Add edit/read-only mode toggle | ✅ PASS | `isEditing` state drives `editable` prop; Save/Cancel buttons in edit mode, Edit button in view mode; `onEditingChange` callback fires correctly |
| Save description as JSON string to database | ✅ PASS | `JSON.stringify(editor.document)` passed to `onSave`; CardModal calls `onUpdate(card.id, { description: json })` |
| Handle empty state gracefully | ✅ PASS | `content` falsy → "No description" placeholder; cancel with null resets to empty paragraph block |
| Add proper styling to match application theme | ✅ PASS | `BlockEditor.css` provides scoped layout and a CSS variable override (`.block-editor .bn-editor { --bn-colors-editor-text: #333; }`) |
| Integration with `CardModal` | ✅ PASS | `<BlockEditor>` replaces static description field; `isEditingDescription` prevents modal Escape-close during editor editing |

---

## 6. Code Review Findings

### 6.1 Observation: `parseContent` plain-text fallback produces a block without `id` and `props`

**Severity:** Low  
**File:** `BlockEditor.jsx`, line 25

```js
return [{ type: 'paragraph', content: [{ type: 'text', text: raw, styles: {} }] }]
```

A fully valid BlockNote block requires `id` and `props` at the top level. The fallback is only triggered when `raw` is not parseable JSON (e.g., legacy plain-text descriptions). In practice, any description written through BlockNote is stored as proper JSON, so this path is only hit for pre-existing data. BlockNote may internally emit warnings or auto-correct the block. This is low risk.

---

### 6.2 Observation: `onSave` is not guarded with optional chaining

**Severity:** Info (not a bug in practice)  
**File:** `BlockEditor.jsx`, line 77

```js
await onSave(JSON.stringify(editor.document))
```

`onSave` is called without optional chaining, making it a de-facto required prop. All usages in `CardModal.jsx` pass it correctly. The concern is only if the component is reused elsewhere without `onSave` — it would throw a runtime error. Consistent with how `onSave` is treated as required.

---

### 6.3 Pre-existing: `act()` warnings in `useBoard.test.js`

**Severity:** Low (tests still pass)  
**Origin:** Carried over from prior tasks; not related to Task 14.

---

### 6.4 Pre-existing: Server tests fail due to missing `node_modules`

**Severity:** High (server test suite broken), but **not introduced by this task**  
**Origin:** Worktree environment — `npm install` was not run for the server workspace in this worktree.

---

## 7. Test Coverage Assessment

### `BlockEditor.test.jsx` — 32 tests in 4 groups

| Group | Tests | Coverage |
|-------|-------|----------|
| Basic rendering | 6 | Null/undefined/empty content renders "No description"; provided content renders BlockNoteViewRaw; Edit button present |
| Initialization | 4 | JSON parse, plain-text fallback, null → `undefined` initialContent; explicit `BlockNoteSchema` with exactly 5 block types and correct names |
| Mode toggle | 14 | Enter/exit edit mode, `editable` prop, Escape key, `onEditingChange` callback, cancel reset, external content prop reactivity (replaceBlocks called on prop change, but not during active edit) |
| Save | 8 | `onSave` called with `JSON.stringify`, loading state disables buttons, error display on rejection, error clears on success |

Coverage is thorough. The schema validation test (group 2, test 4) explicitly verifies that `BlockNoteSchema` is passed and contains exactly the 5 required block types — satisfying Subtask 2's specification.

### `CardModal.test.jsx` — 5 new `CardModal — description` tests

| Test | Verifies |
|------|---------|
| BlockEditor rendered | `data-testid="block-editor"` present in DOM |
| `content` prop | `card.description` passed through |
| `onSave` wires `onUpdate` | `onUpdate(id, { description: json })` called |
| Escape guarded while editing | `onClose` not called when `isEditingDescription=true` |
| Escape closes after editing ends | `onClose` called once after cancel |

---

## 8. Overall Assessment

**Task 14 implementation: ✅ PASS**

All client tests pass (365/365), lint is clean, and the production build succeeds. Every task requirement has been implemented correctly:

- `@blocknote/react` and `@blocknote/core` installed as production dependencies (0.47.3)
- `BlockEditor.jsx` wrapper component created with proper React hooks
- **Explicit block schema** configured with exactly the 5 required block types (paragraph, heading, bulletListItem, numberedListItem, codeBlock) — no extra block types exposed
- Edit/read-only toggle implemented via `isEditing` state and `editable` prop
- JSON serialization via `JSON.stringify(editor.document)` on save
- Empty state ("No description" placeholder) handled gracefully
- Styling integrated via scoped CSS with BlockNote CSS variable override
- `CardModal` integration complete with Escape-key guard during description editing
- External content reactivity implemented (replaceBlocks called when `content` prop changes while not editing)

The only notable issues are low-severity (plain-text fallback block missing `id`/`props` fields) and pre-existing (server `node_modules` missing, `act()` warnings in unrelated tests). Neither was introduced by this task.
