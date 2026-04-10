import { useState } from 'react'
import { useBoard } from '../../hooks/useBoard.js'
import Column from './Column.jsx'
import CardModal from './CardModal.jsx'
import CreateCardForm from '../CreateCardForm.jsx'
import './Board.css'

export default function Board() {
  const { cards, loading, error, createCard, updateCard, deleteCard, addComment } = useBoard()
  const [selectedCardId, setSelectedCardId] = useState(null)
  const allCards = [...cards.ready, ...cards.in_progress, ...cards.done]
  const selectedCard = selectedCardId ? (allCards.find(c => c.id === selectedCardId) ?? null) : null

  if (loading) return <div className="board-loading" aria-label="Loading">Loading…</div>
  if (error) return <div className="board-error" role="alert">{error}</div>

  return (
    <div className="board">
      <Column
        title="Ready"
        cards={cards.ready}
        onCardClick={(card) => setSelectedCardId(card.id)}
        onUpdate={updateCard}
        footer={<CreateCardForm onSubmit={createCard} />}
      />
      <Column title="In Progress" cards={cards.in_progress} onCardClick={(card) => setSelectedCardId(card.id)} onUpdate={updateCard} />
      <Column title="Done" cards={cards.done} onCardClick={(card) => setSelectedCardId(card.id)} onUpdate={updateCard} />
      {selectedCard && (
        <CardModal
          card={selectedCard}
          onClose={() => setSelectedCardId(null)}
          onUpdate={updateCard}
          onDelete={deleteCard}
          onAddComment={addComment}
        />
      )}
    </div>
  )
}
