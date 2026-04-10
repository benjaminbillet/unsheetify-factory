import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import CommentList, { formatRelativeTime } from './CommentList.jsx'

const comments = [
  { id: 'cm1', card_id: '1', author: 'Bob',   content: 'Looks good!', created_at: 1700000000000 },
  { id: 'cm2', card_id: '1', author: 'Alice', content: 'Needs work',  created_at: 1700000001000 },
]
const noop = () => Promise.resolve()

describe('CommentList — display', () => {
  it('renders a "Comments" heading', () => {
    render(<CommentList comments={[]} onAddComment={noop} />)
    expect(screen.getByRole('heading', { name: /comments/i })).toBeInTheDocument()
  })

  it('renders "No comments yet" when comments array is empty', () => {
    render(<CommentList comments={[]} onAddComment={noop} />)
    expect(screen.getByText(/no comments yet/i)).toBeInTheDocument()
  })

  it('does not render "No comments yet" when comments exist', () => {
    render(<CommentList comments={comments} onAddComment={noop} />)
    expect(screen.queryByText(/no comments yet/i)).not.toBeInTheDocument()
  })

  it('renders each comment author name', () => {
    render(<CommentList comments={comments} onAddComment={noop} />)
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('renders each comment content text', () => {
    render(<CommentList comments={comments} onAddComment={noop} />)
    expect(screen.getByText('Looks good!')).toBeInTheDocument()
    expect(screen.getByText('Needs work')).toBeInTheDocument()
  })

  it('renders comments in chronological order even when input is out of order', () => {
    // Provide fixture with newer comment (cm2) first in the array
    const outOfOrder = [comments[1], comments[0]]
    render(<CommentList comments={outOfOrder} onAddComment={noop} />)
    const items = screen.getAllByTestId('comment')
    expect(items[0]).toHaveTextContent('Looks good!')  // cm1, older, should appear first
    expect(items[1]).toHaveTextContent('Needs work')   // cm2, newer
  })

  it('renders a <time> element with ISO dateTime attribute for each comment', () => {
    render(<CommentList comments={comments} onAddComment={noop} />)
    const items = screen.getAllByTestId('comment')
    expect(within(items[0]).getByRole('time')).toHaveAttribute('dateTime', new Date(1700000000000).toISOString())
    expect(within(items[1]).getByRole('time')).toHaveAttribute('dateTime', new Date(1700000001000).toISOString())
  })
})

describe('CommentList — form', () => {
  it('renders an author name input', () => {
    render(<CommentList comments={[]} onAddComment={noop} />)
    expect(screen.getByRole('textbox', { name: /author name/i })).toBeInTheDocument()
  })

  it('renders a comment textarea', () => {
    render(<CommentList comments={[]} onAddComment={noop} />)
    expect(screen.getByRole('textbox', { name: /comment/i })).toBeInTheDocument()
  })

  it('renders an "Add Comment" submit button', () => {
    render(<CommentList comments={[]} onAddComment={noop} />)
    expect(screen.getByRole('button', { name: /add comment/i })).toBeInTheDocument()
  })

  it('shows validation error "Author name is required" when submitting with empty author', async () => {
    render(<CommentList comments={[]} onAddComment={noop} />)
    fireEvent.change(screen.getByRole('textbox', { name: /comment/i }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Author name is required')
  })

  it('shows validation error "Comment text is required" when author filled but content empty', async () => {
    render(<CommentList comments={[]} onAddComment={noop} />)
    fireEvent.change(screen.getByRole('textbox', { name: /author name/i }), { target: { value: 'Bob' } })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Comment text is required')
  })

  it('calls onAddComment with { author, content } on valid submission', async () => {
    const onAddComment = vi.fn().mockResolvedValue({})
    render(<CommentList comments={[]} onAddComment={onAddComment} />)
    fireEvent.change(screen.getByRole('textbox', { name: /author name/i }), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByRole('textbox', { name: /comment/i }), { target: { value: 'Looks good!' } })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))
    await waitFor(() => expect(onAddComment).toHaveBeenCalledWith({ author: 'Bob', content: 'Looks good!' }))
  })

  it('clears form fields after successful submission', async () => {
    const onAddComment = vi.fn().mockResolvedValue({})
    render(<CommentList comments={[]} onAddComment={onAddComment} />)
    fireEvent.change(screen.getByRole('textbox', { name: /author name/i }), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByRole('textbox', { name: /comment/i }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: /author name/i })).toHaveValue(''))
    expect(screen.getByRole('textbox', { name: /comment/i })).toHaveValue('')
  })

  it('disables submit button while onAddComment is pending', () => {
    const onAddComment = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<CommentList comments={[]} onAddComment={onAddComment} />)
    fireEvent.change(screen.getByRole('textbox', { name: /author name/i }), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByRole('textbox', { name: /comment/i }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))
    expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled()
  })

  it('shows "Submitting…" text while pending', () => {
    const onAddComment = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<CommentList comments={[]} onAddComment={onAddComment} />)
    fireEvent.change(screen.getByRole('textbox', { name: /author name/i }), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByRole('textbox', { name: /comment/i }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))
    expect(screen.getByRole('button')).toHaveTextContent('Submitting…')
  })

  it('shows error message (role="alert") when onAddComment rejects', async () => {
    const onAddComment = vi.fn().mockRejectedValue(new Error('Network error'))
    render(<CommentList comments={[]} onAddComment={onAddComment} />)
    fireEvent.change(screen.getByRole('textbox', { name: /author name/i }), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByRole('textbox', { name: /comment/i }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network error'))
  })

  it('keeps form values when onAddComment rejects', async () => {
    const onAddComment = vi.fn().mockRejectedValue(new Error('fail'))
    render(<CommentList comments={[]} onAddComment={onAddComment} />)
    fireEvent.change(screen.getByRole('textbox', { name: /author name/i }), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByRole('textbox', { name: /comment/i }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: /add comment/i }))
    await waitFor(() => expect(onAddComment).toHaveBeenCalled())
    expect(screen.getByRole('textbox', { name: /author name/i })).toHaveValue('Bob')
    expect(screen.getByRole('textbox', { name: /comment/i })).toHaveValue('hi')
  })
})

describe('formatRelativeTime', () => {
  const NOW = 1_700_000_000_000  // arbitrary fixed "now"

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('returns "just now" for a timestamp 30 seconds ago', () => {
    expect(formatRelativeTime(NOW - 30_000)).toBe('just now')
  })

  it('returns "just now" for a timestamp 59 seconds ago', () => {
    expect(formatRelativeTime(NOW - 59_000)).toBe('just now')
  })

  it('returns "1 minute ago" for a timestamp exactly 60 seconds ago', () => {
    expect(formatRelativeTime(NOW - 60_000)).toBe('1 minute ago')
  })

  it('returns "2 minutes ago" for a timestamp 2 minutes ago', () => {
    expect(formatRelativeTime(NOW - 2 * 60_000)).toBe('2 minutes ago')
  })

  it('returns "59 minutes ago" for a timestamp 59 minutes ago', () => {
    expect(formatRelativeTime(NOW - 59 * 60_000)).toBe('59 minutes ago')
  })

  it('returns "1 hour ago" for a timestamp exactly 60 minutes ago', () => {
    expect(formatRelativeTime(NOW - 60 * 60_000)).toBe('1 hour ago')
  })

  it('returns "3 hours ago" for a timestamp 3 hours ago', () => {
    expect(formatRelativeTime(NOW - 3 * 3_600_000)).toBe('3 hours ago')
  })

  it('returns "23 hours ago" for a timestamp 23 hours ago', () => {
    expect(formatRelativeTime(NOW - 23 * 3_600_000)).toBe('23 hours ago')
  })

  it('returns "yesterday" for a timestamp exactly 24 hours ago', () => {
    expect(formatRelativeTime(NOW - 24 * 3_600_000)).toBe('yesterday')
  })

  it('returns "yesterday" for a timestamp 47 hours ago', () => {
    expect(formatRelativeTime(NOW - 47 * 3_600_000)).toBe('yesterday')
  })

  it('returns "2 days ago" for a timestamp exactly 48 hours ago', () => {
    expect(formatRelativeTime(NOW - 48 * 3_600_000)).toBe('2 days ago')
  })

  it('returns "29 days ago" for a timestamp 29 days ago', () => {
    expect(formatRelativeTime(NOW - 29 * 24 * 3_600_000)).toBe('29 days ago')
  })

  it('returns toLocaleDateString() for a timestamp 30+ days ago', () => {
    const ts = NOW - 30 * 24 * 3_600_000
    expect(formatRelativeTime(ts)).toBe(new Date(ts).toLocaleDateString())
  })

  it('renders relative timestamp inside the <time> element in the comment list', () => {
    const twoHoursAgo = NOW - 2 * 3_600_000
    render(<CommentList
      comments={[{ id: 'c1', card_id: '1', author: 'Bob', content: 'hi', created_at: twoHoursAgo }]}
      onAddComment={noop}
    />)
    expect(screen.getByRole('time')).toHaveTextContent('2 hours ago')
  })
})
