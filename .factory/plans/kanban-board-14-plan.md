# Plan: Integrate BlockNote Rich Text Editor (Task 14)

## Context

The Kanban board's `CardModal` currently displays `card.description` as a read-only `<p>` element (line 180 of `CardModal.jsx`). Task 14 replaces this with a BlockNote-powered rich-text editor that supports headings, paragraphs, bullet lists, numbered lists, and code blocks — with an edit/read-only toggle and JSON persistence.

The description field already exists in the API and data model (`updateCard(id, { description })` is supported). Only the UI component and its integration into `CardModal` are missing.

---

## Critical Files

| File | Role |
|---|---|
| `client/src/components/Board/CardModal.jsx` | Existing modal — line 180 replaced with `<BlockEditor>` |
| `client/src/components/Board/CardModal.test.jsx` | Existing tests — 2 description tests pass via mock, new describe block added |
| `client/src/components/CardModal/BlockEditor.jsx` | **NEW** — BlockNote wrapper component |
| `client/src/components/CardModal/BlockEditor.test.jsx` | **NEW** — TDD tests for BlockEditor |
| `client/src/components/CardModal/BlockEditor.css` | **NEW** — Styling for BlockEditor |
| `client/package.json` | Gains `@blocknote/react`, `@blocknote/core` (and possibly `@blocknote/mantine`) |

---

## Architecture Decisions

1. **Component location**: `client/src/components/CardModal/BlockEditor.jsx` (new subdirectory, per task spec). `CardModal.jsx` stays in `Board/`.
2. **Escape key**: `BlockEditor` owns its own document-level `keydown` listener (only active when `isEditing` is true). `CardModal` tracks `isEditingDescription` state (via `onEditingChange` prop) and guards its own Escape handler from closing the modal while description is being edited.
3. **`onEditingChange` notification**: Use **only** a `useEffect` that fires when `isEditing` changes — do NOT also call `onEditingChange` explicitly inside `handleSave`/`handleCancel`, to avoid double-invocation.
4. **JSON storage**: `JSON.stringify(editor.document)` on save; `JSON.parse(content)` on load. Plain-text descriptions (legacy data) fall back to a single paragraph block. `null`/`undefined`/`''` passes `undefined` as `initialContent` to BlockNote.
5. **Test isolation**: Tests for `BlockEditor` mock `@blocknote/react` entirely (jsdom cannot run ProseMirror). Tests for `CardModal` mock `'../CardModal/BlockEditor.jsx'` (the path as it appears in CardModal's import statement) so they require no BlockNote knowledge.
6. **Empty state**: `content` that is `null`, `undefined`, or `''` renders a `<p className="block-editor-empty">No description</p>` placeholder. `<BlockNoteView>` is only rendered when content is non-empty.
7. **Mutual exclusivity**: Description editing is **independent** of title and assignee editing — no mutual exclusivity is enforced between them. This matches the task scope and avoids needing to control `BlockEditor`'s internal state from `CardModal`.
8. **`parseContent` placement**: Defined as a **module-level utility function** (outside the component) in `BlockEditor.jsx` so it is stable, not recreated on render, and usable in test assertions.

---

## BlockNote Package Note

Both `useCreateBlockNote` and `BlockNoteView` are exported from `@blocknote/react`. The base CSS lives in `@blocknote/core`:

```js
import '@blocknote/core/style.css'
import { useCreateBlockNote, BlockNoteView } from '@blocknote/react'
```

`@blocknote/mantine` is optional (Mantine Design System theming only) and is **not required** for this task.

**Action during implementation**: After `npm install @blocknote/react @blocknote/core`, verify that `BlockNoteView` is exported from `@blocknote/react` by checking `node_modules/@blocknote/react/dist/index.js` or the package's type declarations. If it is not (rare edge case), also check `@blocknote/mantine`. Update the mock target package accordingly.

---

## Subtask 1 — Install packages & create basic component structure

### TDD Step Order

1. **Install packages first** (run in `client/` directory) — required before any test file can import from `@blocknote/react`:
   ```
   npm install @blocknote/react @blocknote/core
   ```
   Then verify `BlockNoteView` is exported from `@blocknote/react` (see Package Note above).
2. Create `client/src/components/CardModal/` directory.
3. Create a **minimal stub** `BlockEditor.jsx` (just `export default function BlockEditor() { return null }`) so the test file can import it without a module-not-found error.
4. Write the test file — all tests should **fail** (red) because the stub returns `null`.
5. Implement the real component to make tests pass (green).

### 1a. Tests to write first (`BlockEditor.test.jsx`)

File: `client/src/components/CardModal/BlockEditor.test.jsx`

**Important vi.mock rule**: `vi.mock()` is hoisted by Vitest to the top of the file before any variable declarations. The mock factory function therefore **cannot reference variables defined in the module scope** (they are `undefined` at hoist time). Define `mockEditor` separately and use `beforeEach` to wire it up via `.mockReturnValue()`.

```js
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCreateBlockNote, BlockNoteView } from '@blocknote/react'
import BlockEditor from './BlockEditor.jsx'

// vi.mock is hoisted — factory must NOT reference module-scope variables
vi.mock('@blocknote/react', () => ({
  useCreateBlockNote: vi.fn(),
  BlockNoteView: vi.fn(({ editable }) => (
    <div data-testid="blocknote-view" data-editable={String(editable)} />
  )),
}))

const mockEditor = {
  document: [
    { type: 'paragraph', id: '1', content: [{ type: 'text', text: 'Hello', styles: {} }], props: {} }
  ],
  replaceBlocks: vi.fn(),
}

beforeEach(() => {
  useCreateBlockNote.mockClear()
  useCreateBlockNote.mockReturnValue(mockEditor)
  mockEditor.replaceBlocks.mockClear()
  BlockNoteView.mockClear()
})
```

Test cases (all should **fail** against the stub):
- `renders "No description" when content is null`
- `renders "No description" when content is undefined`
- `renders "No description" when content is empty string`
- `renders BlockNoteView in view mode when content is provided`
- `renders an "Edit description" button in view mode`
- `does not render BlockNoteView when content is null`

### 1b. Implementation

*(Packages are already installed per TDD Step Order above.)*

**Create** `client/src/components/CardModal/BlockEditor.jsx`:

```jsx
import { useState, useEffect, useRef } from 'react'
import { useCreateBlockNote, BlockNoteView } from '@blocknote/react'
import '@blocknote/core/style.css'
import './BlockEditor.css'

// Module-level utility — not recreated on each render
export function parseContent(raw) {
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return [{ type: 'paragraph', content: [{ type: 'text', text: raw, styles: {} }] }]
  }
}

export default function BlockEditor({ content, onSave, onEditingChange }) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const editor = useCreateBlockNote({ initialContent: parseContent(content) })

  // Notify parent when editing state changes, but NOT on initial mount
  // (parent's initial isEditingDescription is already false — no need to re-set it).
  const isMountRef = useRef(true)
  useEffect(() => {
    if (isMountRef.current) { isMountRef.current = false; return }
    onEditingChange?.(isEditing)
  }, [isEditing, onEditingChange])

  // Escape key cancels edit (only active when editing)
  useEffect(() => {
    if (!isEditing) return
    function onKey(e) {
      if (e.key === 'Escape') handleCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // handleCancel is stable within an isEditing=true session; content is read at call time via closure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing])

  function handleCancel() {
    setIsEditing(false)
    setSaveError(null)
    // Reset editor to last-saved content; use minimum valid document when content is empty
    const resetBlocks = parseContent(content) ?? [{ type: 'paragraph', content: [] }]
    editor.replaceBlocks(editor.document, resetBlocks)
  }

  async function handleSave() {
    setIsSaving(true)
    setSaveError(null)
    try {
      await onSave(JSON.stringify(editor.document))
      setIsEditing(false)  // triggers the useEffect above → onEditingChange?.(false)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setIsSaving(false)
    }
  }
  // NOTE: do NOT call onEditingChange explicitly here or in handleCancel;
  // the useEffect above is the single place that notifies the parent.

  return (
    <div className="block-editor">
      {isEditing ? (
        <div className="block-editor-edit">
          <BlockNoteView editor={editor} editable={true} />
          <div className="block-editor-actions">
            <button aria-label="Save description" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save'}
            </button>
            <button aria-label="Cancel description edit" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </button>
          </div>
          {saveError && <p role="alert" className="block-editor-error">{saveError}</p>}
        </div>
      ) : (
        <div className="block-editor-view">
          {content
            ? <BlockNoteView editor={editor} editable={false} />
            : <p className="block-editor-empty">No description</p>
          }
          <button aria-label="Edit description" onClick={() => { setIsEditing(true); setSaveError(null) }}>
            Edit
          </button>
        </div>
      )}
    </div>
  )
}
```

---

## Subtask 2 — Configure editor with required block types

BlockNote's default schema includes headings (h1/h2/h3), paragraphs, bullet lists, numbered lists, and code blocks — no custom schema configuration is needed.

### 2a. Tests to write first

Add to `BlockEditor.test.jsx` (new `describe('BlockEditor — initialization', ...)` block):

- `useCreateBlockNote is called with parsed JSON content when content is valid JSON`
  - Render with `content='[{"type":"paragraph","content":[{"type":"text","text":"hello","styles":{}}]}]'`
  - Assert `expect(useCreateBlockNote).toHaveBeenCalledWith(expect.objectContaining({ initialContent: JSON.parse(content) }))`
- `useCreateBlockNote is called with paragraph block fallback when content is plain text`
  - Render with `content='plain text'`
  - Assert `initialContent` is `[{ type: 'paragraph', content: [{ type: 'text', text: 'plain text', styles: {} }] }]`
- `useCreateBlockNote is called with undefined initialContent when content is null`
  - Render with `content={null}`
  - Assert `initialContent` is `undefined`

### 2b. Implementation

`parseContent` (module-level, already defined in Subtask 1) handles all three cases. No additional implementation beyond Subtask 1 is needed for block type configuration.

---

## Subtask 3 — Edit / read-only mode toggle

### 3a. Tests to write first

Add to `BlockEditor.test.jsx` (new `describe('BlockEditor — mode toggle', ...)` block):

- `clicking "Edit description" enters edit mode (shows Save and Cancel buttons)`
- `in edit mode, BlockNoteView receives editable={true}`
- `in view mode, BlockNoteView receives editable={false}` (when content is provided)
- `clicking Cancel exits edit mode`
- `clicking Cancel hides Save and Cancel buttons`
- `Escape key cancels edit mode when editing`
- `Escape key does not affect component when not in edit mode`
- `calls onEditingChange with true when Edit is clicked`
- `calls onEditingChange with false when Cancel is clicked`
- `calls onEditingChange with false when Save succeeds` — click Edit, click Save (resolves), assert `onEditingChange` was called with `false`
- `Cancel calls editor.replaceBlocks to reset content`
- `Cancel with null content calls replaceBlocks with a minimum paragraph block`

Add to `CardModal.test.jsx` — new `describe('CardModal — description', ...)` block at the bottom:

- `renders BlockEditor in place of the static description paragraph`
  - Confirm `screen.getByTestId('block-editor')` is within the dialog
- `BlockEditor receives card.description as its content prop`
  - After rendering with `card.description = 'Some description'`, confirm the mocked BlockEditor received `content='Some description'` (check rendered text from mock)
- `Escape does not close modal when BlockEditor reports isEditing=true`
  - Click the mock "Edit description" button (calls `onEditingChange(true)`)
  - Fire `keyDown(document.body, { key: 'Escape' })`
  - Assert `onClose` was NOT called
- `Escape closes modal after description editing ends`
  - Click the mock "Edit description" button (calls `onEditingChange(true)`)
  - Click the mock "Cancel description edit" button (calls `onEditingChange(false)`)
  - Fire `keyDown(document.body, { key: 'Escape' })`
  - Assert `onClose` WAS called once

### 3b. Implementation — CardModal.jsx changes

Add state variable:
```js
const [isEditingDescription, setIsEditingDescription] = useState(false)
```

Replace line 180 (`<p className="modal-description">...`) with:
```jsx
<BlockEditor
  content={card.description}
  onSave={(json) => onUpdate(card.id, { description: json })}
  onEditingChange={setIsEditingDescription}
/>
```

Update the Escape key `useEffect` — add `isEditingDescription` to dependency array and add guard:
```js
useEffect(() => {
  function onKey(e) {
    if (e.key !== 'Escape') return
    if (isEditingTitle) {
      setIsEditingTitle(false); setEditTitle(card.title); setSaveError(null)
    } else if (isEditingAssignee) {
      setIsEditingAssignee(false); setEditAssignee(card.assignee ?? ''); setSaveError(null)
    } else if (isEditingDescription) {
      // BlockEditor owns its own Escape handler; CardModal just prevents modal close
    } else {
      onClose()
    }
  }
  document.addEventListener('keydown', onKey)
  return () => document.removeEventListener('keydown', onKey)
}, [onClose, isEditingTitle, isEditingAssignee, isEditingDescription, card.title, card.assignee])
```

Add import at top of `CardModal.jsx`:
```js
import BlockEditor from '../CardModal/BlockEditor.jsx'
```

---

## Subtask 4 — JSON serialization and styling integration

### 4a. Tests to write first

Add to `BlockEditor.test.jsx` (new `describe('BlockEditor — save', ...)` block):

- `Save calls onSave with JSON.stringify of editor.document`
  - Render with content, click Edit, click Save, assert `onSave` called with `JSON.stringify(mockEditor.document)`
- `Save button is disabled and shows "Saving…" while pending`
  - `onSave` returns `new Promise(() => {})` (never resolves)
- `Cancel button is disabled while saving`
- `Save exits edit mode on success`
- `Save stays in edit mode on rejection`
- `Save shows error alert with message on rejection`
- `no error alert shown on initial render`
- `error alert clears after a second Save succeeds` — use `onSave = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined)`; click Edit, click Save (first call rejects → error appears), click Save again (second call resolves → exits edit mode); assert no element with `role="alert"` is in the document

Add to `CardModal.test.jsx` (`'CardModal — description'` describe):

- `BlockEditor onSave prop calls onUpdate(card.id, { description: json })`
  - `onUpdate = vi.fn().mockResolvedValue({ ...card, description: '{"blocks":"test"}' })`
  - Click the mock's "Save description" button
  - Assert `onUpdate` called with `('1', { description: '{"blocks":"test"}' })`

Update two **existing** `CardModal` tests so they pass with the mocked `BlockEditor`:
- `renders description when present`: currently asserts `toHaveTextContent('Some description')`. The mock renders `<span>{content ?? 'No description'}</span>` where `content='Some description'`, so this test continues to pass unchanged.
- `renders 'No description' when description is null`: the mock renders "No description" when `content` is null. Test continues to pass unchanged.

### 4b. Implementation — styling

**Create** `client/src/components/CardModal/BlockEditor.css`:
```css
.block-editor {
  margin-bottom: 0.5rem;
}

.block-editor-view {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.block-editor-edit {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.block-editor-actions {
  display: flex;
  gap: 0.5rem;
}

.block-editor-empty {
  font-size: 0.875rem;
  color: #999;
  font-style: italic;
  margin: 0;
}

.block-editor-error {
  color: #c0392b;
  font-size: 0.8rem;
  margin: 0.25rem 0;
}

/* Override BlockNote theme to match app palette */
.block-editor [data-theming-css-variables-demo] {
  --bn-colors-editor-text: #333;
}
```

**Update** `CardModal.css`: remove the `.modal-description` rule (lines 65–70) since it is superseded by `.block-editor-empty` and BlockNote's own rendering.

---

## Mock Patterns Reference

### In `BlockEditor.test.jsx` (complete setup)

```js
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCreateBlockNote, BlockNoteView } from '@blocknote/react'
import BlockEditor from './BlockEditor.jsx'

// IMPORTANT: vi.mock is hoisted before variable declarations.
// Do NOT reference module-scope variables inside the factory.
vi.mock('@blocknote/react', () => ({
  useCreateBlockNote: vi.fn(),
  BlockNoteView: vi.fn(({ editable }) => (
    <div data-testid="blocknote-view" data-editable={String(editable)} />
  )),
}))

// Define mockEditor AFTER vi.mock (it is wired up in beforeEach, not in the factory)
const mockEditor = {
  document: [
    { type: 'paragraph', id: '1', content: [{ type: 'text', text: 'Hello', styles: {} }], props: {} }
  ],
  replaceBlocks: vi.fn(),
}

beforeEach(() => {
  useCreateBlockNote.mockClear()
  useCreateBlockNote.mockReturnValue(mockEditor)
  mockEditor.replaceBlocks.mockClear()
  BlockNoteView.mockClear()
})
```

### In `CardModal.test.jsx` (add at top of file, before describe blocks)

```js
// Must be at module top level; vi.mock is hoisted automatically by Vitest
vi.mock('../CardModal/BlockEditor.jsx', () => ({
  default: vi.fn(({ content, onSave, onEditingChange }) => (
    <div data-testid="block-editor">
      <span>{content ?? 'No description'}</span>
      <button aria-label="Edit description" onClick={() => onEditingChange?.(true)}>Edit</button>
      <button aria-label="Cancel description edit" onClick={() => onEditingChange?.(false)}>Cancel</button>
      <button aria-label="Save description" onClick={() => onSave?.('{"blocks":"test"}')}>Save</button>
    </div>
  )),
}))
```

The mock includes three buttons so CardModal tests can simulate all three state transitions: enter edit (`onEditingChange(true)`), cancel edit (`onEditingChange(false)`), and trigger the `onSave` callback.

The `'../CardModal/BlockEditor.jsx'` path is correct because both `CardModal.jsx` (which imports it) and `CardModal.test.jsx` live in `client/src/components/Board/`, so the relative path to the new file is identical from both.

---

## Verification

1. **Unit tests**: `cd client && npm test` — all existing tests pass; new `BlockEditor.test.jsx` passes; `CardModal.test.jsx` passes with the mock.
2. **Manual smoke test**: `npm run dev` → open a card → click "Edit" on description → type rich text with heading/bullets/code → Save → reopen modal → content displays correctly in read-only mode.
3. **JSON roundtrip**: Confirm `card.description` in network tab contains a JSON array string (BlockNote blocks format), not plain text.
4. **Empty state**: Card with `null` description shows "No description" placeholder; clicking Edit opens an empty editor.
5. **Escape behavior**: Escape while description is being edited cancels the edit (modal stays open); second Escape closes the modal.
6. **Error state**: Mock a network failure on save → error alert appears inside the editor, edit mode persists, modal remains open.
7. **Legacy content**: Manually set `description` to plain text in the DB → confirm BlockNote wraps it in a paragraph and displays correctly.
