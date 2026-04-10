import { useEffect } from 'react'
import './CardModal.css'

export default function CardModal({ card, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-label={card.title}
        onClick={e => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 className="modal-title">{card.title}</h2>
        <p className="modal-assignee">
          <strong>Assignee:</strong> {card.assignee ?? 'Unassigned'}
        </p>
        <p className="modal-description">{card.description ?? 'No description'}</p>
      </div>
    </div>
  )
}
