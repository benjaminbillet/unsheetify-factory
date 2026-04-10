import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BlockNoteSchema } from '@blocknote/core'
import { useCreateBlockNote, BlockNoteViewRaw } from '@blocknote/react'
import BlockEditor from './BlockEditor.jsx'

// vi.mock is hoisted — factory must NOT reference module-scope variables
vi.mock('@blocknote/react', () => ({
  useCreateBlockNote: vi.fn(),
  BlockNoteViewRaw: vi.fn(({ editable }) => (
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
  BlockNoteViewRaw.mockClear()
})

// ---------------------------------------------------------------------------
// Subtask 1 — Basic rendering
// ---------------------------------------------------------------------------
describe('BlockEditor — basic rendering', () => {
  it('renders "No description" when content is null', () => {
    render(<BlockEditor content={null} onSave={vi.fn()} />)
    expect(screen.getByText('No description')).toBeInTheDocument()
  })

  it('renders "No description" when content is undefined', () => {
    render(<BlockEditor content={undefined} onSave={vi.fn()} />)
    expect(screen.getByText('No description')).toBeInTheDocument()
  })

  it('renders "No description" when content is empty string', () => {
    render(<BlockEditor content="" onSave={vi.fn()} />)
    expect(screen.getByText('No description')).toBeInTheDocument()
  })

  it('renders BlockNoteViewRaw in view mode when content is provided', () => {
    render(<BlockEditor content="some content" onSave={vi.fn()} />)
    expect(screen.getByTestId('blocknote-view')).toBeInTheDocument()
  })

  it('renders an "Edit description" button in view mode', () => {
    render(<BlockEditor content={null} onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: /edit description/i })).toBeInTheDocument()
  })

  it('does not render BlockNoteViewRaw when content is null', () => {
    render(<BlockEditor content={null} onSave={vi.fn()} />)
    expect(screen.queryByTestId('blocknote-view')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Subtask 2 — Initialization / parseContent
// ---------------------------------------------------------------------------
describe('BlockEditor — initialization', () => {
  it('calls useCreateBlockNote with parsed JSON content when content is valid JSON', () => {
    const jsonContent = '[{"type":"paragraph","content":[{"type":"text","text":"hello","styles":{}}]}]'
    render(<BlockEditor content={jsonContent} onSave={vi.fn()} />)
    expect(useCreateBlockNote).toHaveBeenCalledWith(
      expect.objectContaining({ initialContent: JSON.parse(jsonContent) })
    )
  })

  it('calls useCreateBlockNote with paragraph block fallback when content is plain text', () => {
    render(<BlockEditor content="plain text" onSave={vi.fn()} />)
    expect(useCreateBlockNote).toHaveBeenCalledWith(
      expect.objectContaining({
        initialContent: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain text', styles: {} }] }]
      })
    )
  })

  it('calls useCreateBlockNote with undefined initialContent when content is null', () => {
    render(<BlockEditor content={null} onSave={vi.fn()} />)
    expect(useCreateBlockNote).toHaveBeenCalledWith(
      expect.objectContaining({ initialContent: undefined })
    )
  })

  it('calls useCreateBlockNote with an explicit BlockNoteSchema restricted to the required block types', () => {
    render(<BlockEditor content={null} onSave={vi.fn()} />)
    const [options] = useCreateBlockNote.mock.calls[0]
    expect(options.schema).toBeInstanceOf(BlockNoteSchema)
    const blockTypes = Object.keys(options.schema.blockSpecs)
    expect(blockTypes).toEqual(expect.arrayContaining(['paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'codeBlock']))
    expect(blockTypes).toHaveLength(5)
  })
})

// ---------------------------------------------------------------------------
// Subtask 3 — Edit / read-only mode toggle
// ---------------------------------------------------------------------------
describe('BlockEditor — mode toggle', () => {
  it('clicking "Edit description" enters edit mode (shows Save and Cancel buttons)', () => {
    render(<BlockEditor content="some content" onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    expect(screen.getByRole('button', { name: /save description/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel description edit/i })).toBeInTheDocument()
  })

  it('in edit mode, BlockNoteViewRaw receives editable={true}', () => {
    render(<BlockEditor content="some content" onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    expect(screen.getByTestId('blocknote-view')).toHaveAttribute('data-editable', 'true')
  })

  it('in view mode, BlockNoteViewRaw receives editable={false} when content is provided', () => {
    render(<BlockEditor content="some content" onSave={vi.fn()} />)
    expect(screen.getByTestId('blocknote-view')).toHaveAttribute('data-editable', 'false')
  })

  it('clicking Cancel exits edit mode', () => {
    render(<BlockEditor content="some content" onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel description edit/i }))
    expect(screen.getByRole('button', { name: /edit description/i })).toBeInTheDocument()
  })

  it('clicking Cancel hides Save and Cancel buttons', () => {
    render(<BlockEditor content="some content" onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel description edit/i }))
    expect(screen.queryByRole('button', { name: /save description/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel description edit/i })).not.toBeInTheDocument()
  })

  it('Escape key cancels edit mode when editing', () => {
    render(<BlockEditor content="some content" onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: /save description/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit description/i })).toBeInTheDocument()
  })

  it('Escape key does not affect component when not in edit mode', () => {
    render(<BlockEditor content="some content" onSave={vi.fn()} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('button', { name: /edit description/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save description/i })).not.toBeInTheDocument()
  })

  it('calls onEditingChange with true when Edit is clicked', () => {
    const onEditingChange = vi.fn()
    render(<BlockEditor content="some content" onSave={vi.fn()} onEditingChange={onEditingChange} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    expect(onEditingChange).toHaveBeenCalledWith(true)
  })

  it('calls onEditingChange with false when Cancel is clicked', () => {
    const onEditingChange = vi.fn()
    render(<BlockEditor content="some content" onSave={vi.fn()} onEditingChange={onEditingChange} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel description edit/i }))
    expect(onEditingChange).toHaveBeenCalledWith(false)
  })

  it('calls onEditingChange with false when Save succeeds', async () => {
    const onEditingChange = vi.fn()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<BlockEditor content="some content" onSave={onSave} onEditingChange={onEditingChange} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    fireEvent.click(screen.getByRole('button', { name: /save description/i }))
    await waitFor(() => expect(onEditingChange).toHaveBeenCalledWith(false))
  })

  it('Cancel calls editor.replaceBlocks to reset content', () => {
    render(<BlockEditor content="some content" onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel description edit/i }))
    expect(mockEditor.replaceBlocks).toHaveBeenCalled()
  })

  it('Cancel with null content calls replaceBlocks with a minimum paragraph block', () => {
    render(<BlockEditor content={null} onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel description edit/i }))
    expect(mockEditor.replaceBlocks).toHaveBeenCalledWith(
      mockEditor.document,
      [{ type: 'paragraph', content: [] }]
    )
  })

  it('calls replaceBlocks when content prop changes externally while in view mode', () => {
    const { rerender } = render(<BlockEditor content="old content" onSave={vi.fn()} />)
    mockEditor.replaceBlocks.mockClear()
    rerender(<BlockEditor content="new content" onSave={vi.fn()} />)
    expect(mockEditor.replaceBlocks).toHaveBeenCalledWith(
      mockEditor.document,
      [{ type: 'paragraph', content: [{ type: 'text', text: 'new content', styles: {} }] }]
    )
  })

  it('does not call replaceBlocks when content prop changes while editing', () => {
    const { rerender } = render(<BlockEditor content="old content" onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    mockEditor.replaceBlocks.mockClear()
    rerender(<BlockEditor content="new content" onSave={vi.fn()} />)
    expect(mockEditor.replaceBlocks).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Subtask 4 — Save / JSON serialization
// ---------------------------------------------------------------------------
describe('BlockEditor — save', () => {
  it('Save calls onSave with JSON.stringify of editor.document', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<BlockEditor content="some content" onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    fireEvent.click(screen.getByRole('button', { name: /save description/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(JSON.stringify(mockEditor.document)))
  })

  it('Save button is disabled and shows "Saving…" while pending', () => {
    const onSave = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<BlockEditor content="some content" onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    fireEvent.click(screen.getByRole('button', { name: /save description/i }))
    const saveBtn = screen.getByRole('button', { name: /save description/i })
    expect(saveBtn).toBeDisabled()
    expect(saveBtn).toHaveTextContent('Saving…')
  })

  it('Cancel button is disabled while saving', () => {
    const onSave = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<BlockEditor content="some content" onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    fireEvent.click(screen.getByRole('button', { name: /save description/i }))
    expect(screen.getByRole('button', { name: /cancel description edit/i })).toBeDisabled()
  })

  it('Save exits edit mode on success', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<BlockEditor content="some content" onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    fireEvent.click(screen.getByRole('button', { name: /save description/i }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /save description/i })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /edit description/i })).toBeInTheDocument()
  })

  it('Save stays in edit mode on rejection', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Server error'))
    render(<BlockEditor content="some content" onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    fireEvent.click(screen.getByRole('button', { name: /save description/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /save description/i })).toBeInTheDocument()
  })

  it('Save shows error alert with message on rejection', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Save failed'))
    render(<BlockEditor content="some content" onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    fireEvent.click(screen.getByRole('button', { name: /save description/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Save failed'))
  })

  it('no error alert shown on initial render', () => {
    render(<BlockEditor content="some content" onSave={vi.fn()} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('error alert clears after a second Save succeeds', async () => {
    const onSave = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(undefined)
    render(<BlockEditor content="some content" onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: /edit description/i }))
    // First save — fails
    fireEvent.click(screen.getByRole('button', { name: /save description/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    // Second save — succeeds
    fireEvent.click(screen.getByRole('button', { name: /save description/i }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})
