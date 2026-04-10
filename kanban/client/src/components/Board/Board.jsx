import { useState } from 'react'
import { useBoard } from '../../hooks/useBoard.js'
import Column from './Column.jsx'
import CardModal from './CardModal.jsx'
import './Board.css'

export default function Board() {
  const { cards, loading, error } = useBoard()
  const [selectedCard, setSelectedCard] = useState(null)

  if (loading) return <div className="board-loading" aria-label="Loading">Loading…</div>
  if (error) return <div className="board-error" role="alert">{error}</div>

  return (
    <div className="board">
      <Column title="Ready" cards={cards.ready} onCardClick={setSelectedCard} />
      <Column title="In Progress" cards={cards.in_progress} onCardClick={setSelectedCard} />
      <Column title="Done" cards={cards.done} onCardClick={setSelectedCard} />
      {selectedCard && (
        <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </div>
  )
}
