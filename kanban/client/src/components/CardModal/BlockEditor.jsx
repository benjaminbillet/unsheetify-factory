import { useState, useEffect, useRef } from 'react'
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import './BlockEditor.css'

// Explicit schema scoped to the required block types only
// (headings, paragraphs, bullet lists, numbered lists, code blocks)
const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph:        defaultBlockSpecs.paragraph,
    heading:          defaultBlockSpecs.heading,
    bulletListItem:   defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    codeBlock:        defaultBlockSpecs.codeBlock,
  },
})

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

  const editor = useCreateBlockNote({ schema, initialContent: parseContent(content) })

  // Notify parent when editing state changes, but NOT on initial mount
  const isMountRef = useRef(true)
  useEffect(() => {
    if (isMountRef.current) { isMountRef.current = false; return }
    onEditingChange?.(isEditing)
  }, [isEditing, onEditingChange])

  // Sync editor when the content prop changes externally (e.g., real-time WebSocket update)
  // while the user is not actively editing, so stale content is never displayed.
  const prevContentRef = useRef(content)
  useEffect(() => {
    if (isEditing) return                         // don't overwrite an in-progress edit
    if (content === prevContentRef.current) return // no change
    prevContentRef.current = content
    const resetBlocks = parseContent(content) ?? [{ type: 'paragraph', content: [] }]
    editor.replaceBlocks(editor.document, resetBlocks)
  }, [content, isEditing, editor])

  // Escape key cancels edit (only active when editing)
  useEffect(() => {
    if (!isEditing) return
    function onKey(e) {
      if (e.key === 'Escape') handleCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
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
      setIsEditing(false)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

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
