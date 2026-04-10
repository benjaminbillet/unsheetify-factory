import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import App from './App.jsx'

vi.mock('./hooks/useBoard.js', () => ({
  useBoard: vi.fn(() => ({
    cards: { ready: [], in_progress: [], done: [] },
    loading: false,
    error: null,
    createCard: vi.fn(),
    updateCard: vi.fn(),
    deleteCard: vi.fn(),
    moveCard: vi.fn(),
    addComment: vi.fn(),
  })),
}))

describe('App', () => {
  let container

  beforeEach(() => {
    ;({ container } = render(<App />))
  })

  it('renders without crashing', () => {
    // beforeEach render completing without error = pass
  })

  it('renders a top-level heading', () => {
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('renders "Kanban Board" as the heading text', () => {
    expect(screen.getByRole('heading', { name: /kanban board/i })).toBeInTheDocument()
  })

  it('renders an app container element', () => {
    expect(container.querySelector('.app')).toBeInTheDocument()
  })
})
