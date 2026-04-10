import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import './CardModal.css'
import CommentList from '../CardModal/CommentList.jsx'
import BlockEditor from '../CardModal/BlockEditor.jsx'

export default function CardModal({ card, onClose, onUpdate, onDelete, onAddComment = () => Promise.resolve() }) {
  // Edit state
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle]           = useState(card.title)
  const [isEditingAssignee, setIsEditingAssignee] = useState(false)
  const [editAssignee, setEditAssignee]     = useState(card.assignee ?? '')
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [isSaving, setIsSaving]             = useState(false)
  const [saveError, setSaveError]           = useState(null)

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting]               = useState(false)

  // Focus refs
  const titleInputRef    = useRef(null)
  const assigneeInputRef = useRef(null)

  // Focus effects
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) titleInputRef.current.focus()
  }, [isEditingTitle])

  useEffect(() => {
    if (isEditingAssignee && assigneeInputRef.current) assigneeInputRef.current.focus()
  }, [isEditingAssignee])

  // Escape key handler — replaces the original handler
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

  // Save handlers
  async function handleSaveTitle() {
    if (editTitle.trim() === '') {
      setSaveError('Title is required')
      return
    }
    setIsSaving(true); setSaveError(null)
    try {
      await onUpdate(card.id, { title: editTitle })
      setIsEditingTitle(false)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveAssignee() {
    setIsSaving(true); setSaveError(null)
    try {
      await onUpdate(card.id, { assignee: editAssignee === '' ? null : editAssignee })
      setIsEditingAssignee(false)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleConfirmDelete() {
    setIsDeleting(true); setSaveError(null)
    try {
      await onDelete(card.id)
      onClose()
    } catch (err) {
      setSaveError(err.message)
      setShowDeleteConfirm(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-label={card.title}
        onClick={e => e.stopPropagation()}
      >
        {/* 1. Close button */}
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        {/* 2. Title field (editable) */}
        {isEditingTitle ? (
          <div className="modal-field-edit">
            <input
              ref={titleInputRef}
              aria-label="Title"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle() }}
            />
            <button aria-label="Save" onClick={handleSaveTitle} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              aria-label="Cancel"
              disabled={isSaving}
              onClick={() => { setIsEditingTitle(false); setEditTitle(card.title); setSaveError(null) }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="modal-field-view">
            <h2 className="modal-title">{card.title}</h2>
            <button
              aria-label="Edit title"
              onClick={() => {
                setIsEditingTitle(true); setEditTitle(card.title)
                // Mutual exclusivity: close assignee edit if open
                setIsEditingAssignee(false); setEditAssignee(card.assignee ?? ''); setSaveError(null)
              }}
            >
              Edit
            </button>
          </div>
        )}

        {/* 3. Assignee field (editable) */}
        {isEditingAssignee ? (
          <div className="modal-field-edit">
            <input
              ref={assigneeInputRef}
              aria-label="Assignee"
              value={editAssignee}
              onChange={e => setEditAssignee(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveAssignee() }}
            />
            <button aria-label="Save" onClick={handleSaveAssignee} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              aria-label="Cancel"
              disabled={isSaving}
              onClick={() => { setIsEditingAssignee(false); setEditAssignee(card.assignee ?? ''); setSaveError(null) }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="modal-field-view">
            <p className="modal-assignee">
              <strong>Assignee:</strong> {card.assignee ?? 'Unassigned'}
            </p>
            <button
              aria-label="Edit assignee"
              onClick={() => {
                setIsEditingAssignee(true); setEditAssignee(card.assignee ?? '')
                // Mutual exclusivity: close title edit if open
                setIsEditingTitle(false); setEditTitle(card.title); setSaveError(null)
              }}
            >
              Edit
            </button>
          </div>
        )}

        {/* 4. Description (BlockNote editor) */}
        <BlockEditor
          content={card.description}
          onSave={(json) => onUpdate(card.id, { description: json })}
          onEditingChange={setIsEditingDescription}
        />

        {/* 5. Error alert */}
        {saveError && <p role="alert" className="modal-error">{saveError}</p>}

        {/* 6. Comments section */}
        <CommentList
          comments={card.comments}
          onAddComment={(data) => onAddComment(card.id, data)}
        />

        {/* 7. Delete button / confirmation */}
        {showDeleteConfirm ? (
          <div className="modal-delete-confirm" role="region" aria-label="Delete confirmation">
            <p>Are you sure you want to delete this card?</p>
            <button
              aria-label="Confirm delete"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting…' : 'Confirm delete'}
            </button>
            <button
              aria-label="Keep card"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Keep card
            </button>
          </div>
        ) : (
          <button
            className="modal-delete"
            aria-label="Delete"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete
          </button>
        )}
      </div>
    </div>,
    document.body
  )
}
