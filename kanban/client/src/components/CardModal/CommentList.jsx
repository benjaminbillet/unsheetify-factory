import { useState } from 'react'
import './CommentList.css'

export function formatRelativeTime(timestamp) {
  const diff    = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours   = Math.floor(minutes / 60)
  const days    = Math.floor(hours / 24)

  if (seconds < 60)  return 'just now'
  if (minutes < 60)  return minutes === 1 ? '1 minute ago'  : `${minutes} minutes ago`
  if (hours   < 24)  return hours   === 1 ? '1 hour ago'    : `${hours} hours ago`
  if (days    === 1) return 'yesterday'
  if (days    < 30)  return `${days} days ago`
  return new Date(timestamp).toLocaleDateString()
}

export default function CommentList({ comments, onAddComment }) {
  // Sort chronologically (oldest first) regardless of input order
  const sorted = [...comments].sort((a, b) => a.created_at - b.created_at)

  const [author, setAuthor]             = useState('')
  const [content, setContent]           = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError]               = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (author.trim() === '') { setError('Author name is required'); return }
    if (content.trim() === '') { setError('Comment text is required'); return }
    setIsSubmitting(true); setError(null)
    try {
      await onAddComment({ author: author.trim(), content: content.trim() })
      setAuthor(''); setContent('')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="comment-list">
      <h3 className="comment-list-heading">Comments</h3>
      {sorted.length === 0 ? (
        <p className="comment-list-empty">No comments yet</p>
      ) : (
        <ul className="comment-list-items">
          {sorted.map(cm => (
            <li key={cm.id} data-testid="comment" className="comment-item">
              <div className="comment-meta">
                <span className="comment-author">{cm.author}</span>
                <time className="comment-time" dateTime={new Date(cm.created_at).toISOString()}>
                  {formatRelativeTime(cm.created_at)}
                </time>
              </div>
              <p className="comment-content">{cm.content}</p>
            </li>
          ))}
        </ul>
      )}
      <form className="comment-form" onSubmit={handleSubmit}>
        {error && <p role="alert" className="comment-form-error">{error}</p>}
        <input
          type="text"
          aria-label="Author name"
          value={author}
          onChange={e => setAuthor(e.target.value)}
          disabled={isSubmitting}
        />
        <textarea
          aria-label="Comment"
          value={content}
          onChange={e => setContent(e.target.value)}
          disabled={isSubmitting}
          rows={3}
        />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting…' : 'Add Comment'}
        </button>
      </form>
    </section>
  )
}
