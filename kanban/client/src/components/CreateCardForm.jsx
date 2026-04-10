import { useState, useEffect, useRef } from 'react'
import './CreateCardForm.css'

export default function CreateCardForm({ onSubmit }) {
  const [isOpen, setIsOpen]                   = useState(false)
  const [title, setTitle]                     = useState('')
  const [assignee, setAssignee]               = useState('')
  const [isSubmitting, setIsSubmitting]       = useState(false)
  const [validationError, setValidationError] = useState(null)
  const [apiError, setApiError]               = useState(null)

  const titleInputRef = useRef(null)

  // Auto-focus title input when the form opens
  useEffect(() => {
    if (isOpen && titleInputRef.current) titleInputRef.current.focus()
  }, [isOpen])

  // Escape key closes and resets the form (only when open)
  useEffect(() => {
    if (!isOpen) return
    function onKey(e) {
      if (e.key !== 'Escape') return
      setIsOpen(false)
      setTitle('')
      setAssignee('')
      setValidationError(null)
      setApiError(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen])

  function handleOpen() {
    setIsOpen(true)
  }

  function handleClose() {
    setIsOpen(false)
    setTitle('')
    setAssignee('')
    setValidationError(null)
    setApiError(null)
  }

  function handleTitleChange(e) {
    setTitle(e.target.value)
    if (validationError) setValidationError(null)
    if (apiError) setApiError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) {
      setValidationError('Title is required')
      return
    }
    setIsSubmitting(true)
    setApiError(null)
    try {
      await onSubmit({ title: title.trim(), assignee: assignee.trim() || null })
      handleClose()
    } catch (err) {
      setApiError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const displayError = validationError ?? apiError

  if (!isOpen) {
    return (
      <div className="create-card-form">
        <button className="create-card-form-toggle" onClick={handleOpen}>
          + Add card
        </button>
      </div>
    )
  }

  return (
    <div className="create-card-form create-card-form--open">
      <form className="create-card-form-body" onSubmit={handleSubmit}>
        <label htmlFor="ccf-title">Title</label>
        <input
          id="ccf-title"
          ref={titleInputRef}
          aria-label="Title"
          value={title}
          onChange={handleTitleChange}
          disabled={isSubmitting}
        />

        <label htmlFor="ccf-assignee">Assignee</label>
        <input
          id="ccf-assignee"
          aria-label="Assignee"
          value={assignee}
          onChange={e => setAssignee(e.target.value)}
          disabled={isSubmitting}
        />

        {displayError && (
          <p role="alert" className="create-card-form-error">{displayError}</p>
        )}

        <div className="create-card-form-actions">
          <button
            type="submit"
            className="create-card-form-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Adding…' : 'Add card'}
          </button>
          <button
            type="button"
            className="create-card-form-cancel"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
