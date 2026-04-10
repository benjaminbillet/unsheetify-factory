import { useState, useRef, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import './CardTile.css'

export default function CardTile({ card, onCardClick, onUpdate }) {
  const [isEditingTitle, setIsEditingTitle]       = useState(false)
  const [editTitle, setEditTitle]                 = useState(card.title)
  const [isEditingAssignee, setIsEditingAssignee] = useState(false)
  const [editAssignee, setEditAssignee]           = useState(card.assignee ?? '')
  const [isSaving, setIsSaving]                   = useState(false)
  const [saveError, setSaveError]                 = useState(null)
  const skipTitleBlurRef                          = useRef(false)
  const skipAssigneeBlurRef                       = useRef(false)
  const titleInputRef                             = useRef(null)
  const assigneeInputRef                          = useRef(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Auto-focus input when entering edit mode (mirrors CardModal pattern)
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) titleInputRef.current.focus()
  }, [isEditingTitle])

  useEffect(() => {
    if (isEditingAssignee && assigneeInputRef.current) assigneeInputRef.current.focus()
  }, [isEditingAssignee])

  async function handleSaveTitle() {
    if (editTitle.trim() === '') { setSaveError('Title is required'); return }
    setIsSaving(true); setSaveError(null)
    try {
      await onUpdate(card.id, { title: editTitle })
      setIsEditingTitle(false)
    } catch (err) {
      setSaveError(err.message)
    } finally { setIsSaving(false) }
  }

  async function handleSaveAssignee() {
    setIsSaving(true); setSaveError(null)
    try {
      await onUpdate(card.id, { assignee: editAssignee === '' ? null : editAssignee })
      setIsEditingAssignee(false)
    } catch (err) {
      setSaveError(err.message)
    } finally { setIsSaving(false) }
  }

  const isEditing = isEditingTitle || isEditingAssignee

  const { onKeyDown: dndKeyDown, ...restListeners } = listeners ?? {}

  function handleKeyDown(e) {
    if (isEditing) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick(card) }
    dndKeyDown?.(e)
  }

  const classes = ['card-tile', isEditing && 'card-tile-editing', isDragging && 'card-tile-dragging']
    .filter(Boolean).join(' ')

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={classes}
      role="button"
      tabIndex={0}
      onClick={() => !isEditing && onCardClick(card)}
      onKeyDown={handleKeyDown}
      aria-label={card.title}
      {...attributes}
      {...restListeners}
    >
      {/* Title */}
      {isEditingTitle ? (
        <div className="card-tile-field-edit">
          <input
            ref={titleInputRef}
            aria-label="Edit title"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  { skipTitleBlurRef.current = true; handleSaveTitle() }
              if (e.key === 'Escape') { skipTitleBlurRef.current = true; setIsEditingTitle(false); setEditTitle(card.title); setSaveError(null) }
            }}
            onBlur={() => {
              if (skipTitleBlurRef.current) { skipTitleBlurRef.current = false; return }
              handleSaveTitle()
            }}
          />
          {isSaving && <span aria-label="Saving">Saving…</span>}
        </div>
      ) : (
        <h3
          className="card-tile-title"
          onClick={e => {
            e.stopPropagation()
            setEditTitle(card.title)
            setIsEditingTitle(true)
            // Mutual exclusivity: close assignee edit if open
            setIsEditingAssignee(false)
            setEditAssignee(card.assignee ?? '')
            setSaveError(null)
          }}
        >
          {card.title}
        </h3>
      )}

      {/* Assignee */}
      {isEditingAssignee ? (
        <div className="card-tile-field-edit">
          <input
            ref={assigneeInputRef}
            aria-label="Edit assignee"
            value={editAssignee}
            onChange={e => setEditAssignee(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  { skipAssigneeBlurRef.current = true; handleSaveAssignee() }
              if (e.key === 'Escape') { skipAssigneeBlurRef.current = true; setIsEditingAssignee(false); setEditAssignee(card.assignee ?? ''); setSaveError(null) }
            }}
            onBlur={() => {
              if (skipAssigneeBlurRef.current) { skipAssigneeBlurRef.current = false; return }
              handleSaveAssignee()
            }}
          />
          {isSaving && <span aria-label="Saving">Saving…</span>}
        </div>
      ) : (
        <p
          className="card-tile-assignee"
          onClick={e => {
            e.stopPropagation()
            setEditAssignee(card.assignee ?? '')
            setIsEditingAssignee(true)
            // Mutual exclusivity: close title edit if open
            setIsEditingTitle(false)
            setEditTitle(card.title)
            setSaveError(null)
          }}
        >
          {card.assignee ?? 'Unassigned'}
        </p>
      )}

      {card.description && <p className="card-tile-description">{card.description}</p>}
      {saveError && <p role="alert" className="card-tile-error">{saveError}</p>}
    </div>
  )
}
