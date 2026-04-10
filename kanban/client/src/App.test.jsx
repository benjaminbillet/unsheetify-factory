import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import App from './App.jsx'

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
