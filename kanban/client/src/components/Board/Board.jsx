import { useState } from 'react'
import { DndContext, closestCenter, DragOverlay, useSensor, useSensors, MouseSensor, TouchSensor } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useBoard, columnToKey } from '../../hooks/useBoard.js'
import Column from './Column.jsx'
import CardModal from './CardModal.jsx'
import CreateCardForm from '../CreateCardForm.jsx'
import './Board.css'

// Module-level constants and pure utilities (exported for testing)
export const COLUMN_IDS = ['ready', 'in-progress', 'done']

export function findCardColumn(cardId, cards) {
  for (const [key, colCards] of Object.entries(cards)) {
    if (colCards.some(c => c.id === cardId)) {
      return key === 'in_progress' ? 'in-progress' : key
    }
  }
  return null
}

export function calculatePosition(sortedCards, insertIndex) {
  if (sortedCards.length === 0) return 1.0
  const before = insertIndex > 0 ? sortedCards[insertIndex - 1].position : 0
  const after = insertIndex < sortedCards.length ? sortedCards[insertIndex].position : undefined
  return after !== undefined ? (before + after) / 2 : before + 1
}

export default function Board() {
  const { cards, loading, error, createCard, updateCard, deleteCard, addComment, moveCard } = useBoard()
  const [selectedCardId, setSelectedCardId] = useState(null)
  const [activeCard, setActiveCard] = useState(null)

  // ALL hooks must be declared BEFORE early returns (React Rules of Hooks)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  if (loading) return <div className="board-loading" aria-label="Loading">Loading…</div>
  if (error) return <div className="board-error" role="alert">{error}</div>

  const allCards = [...cards.ready, ...cards.in_progress, ...cards.done]
  const selectedCard = selectedCardId ? (allCards.find(c => c.id === selectedCardId) ?? null) : null

  function handleDragStart({ active }) {
    setActiveCard(allCards.find(c => c.id === active.id) ?? null)
  }

  function handleDragEnd({ active, over }) {
    setActiveCard(null)
    if (!over || active.id === over.id) return

    const activeId = active.id
    const overId = over.id

    const sourceColumn = findCardColumn(activeId, cards)
    if (!sourceColumn) return

    const isDroppedOnColumn = COLUMN_IDS.includes(overId)
    const targetColumn = isDroppedOnColumn ? overId : findCardColumn(overId, cards)
    if (!targetColumn) return

    const sourceKey = columnToKey(sourceColumn)
    const targetKey = columnToKey(targetColumn)

    // No-op: dropped card on its own column header/empty area
    if (sourceKey === targetKey && isDroppedOnColumn) return

    if (sourceKey === targetKey) {
      // Same-column reorder
      const colCards = cards[targetKey]
      const oldIndex = colCards.findIndex(c => c.id === activeId)
      const newIndex = colCards.findIndex(c => c.id === overId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

      const reordered = arrayMove(colCards, oldIndex, newIndex)
      const before = reordered[newIndex - 1]?.position ?? 0
      const after = reordered[newIndex + 1]?.position
      const newPosition = after !== undefined ? (before + after) / 2 : before + 1
      moveCard(activeId, targetColumn, newPosition)
    } else {
      // Cross-column move
      const targetCards = cards[targetKey].filter(c => c.id !== activeId)
      let insertIndex = isDroppedOnColumn
        ? targetCards.length
        : targetCards.findIndex(c => c.id === overId)
      if (insertIndex === -1) insertIndex = targetCards.length

      const newPosition = calculatePosition(targetCards, insertIndex)
      moveCard(activeId, targetColumn, newPosition)
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter}
                onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="board">
        <Column
          title="Ready"
          columnId="ready"
          cards={cards.ready}
          onCardClick={(card) => setSelectedCardId(card.id)}
          onUpdate={updateCard}
          footer={<CreateCardForm onSubmit={createCard} />}
        />
        <Column title="In Progress" columnId="in-progress" cards={cards.in_progress} onCardClick={(card) => setSelectedCardId(card.id)} onUpdate={updateCard} />
        <Column title="Done" columnId="done" cards={cards.done} onCardClick={(card) => setSelectedCardId(card.id)} onUpdate={updateCard} />
      </div>
      <DragOverlay>
        {activeCard ? (
          <div className="card-tile card-drag-overlay">
            <h3 className="card-tile-title">{activeCard.title}</h3>
            <p className="card-tile-assignee">{activeCard.assignee ?? 'Unassigned'}</p>
            {activeCard.description && (
              <p className="card-tile-description">{activeCard.description}</p>
            )}
          </div>
        ) : null}
      </DragOverlay>
      {selectedCard && (
        <CardModal
          card={selectedCard}
          onClose={() => setSelectedCardId(null)}
          onUpdate={updateCard}
          onDelete={deleteCard}
          onAddComment={addComment}
        />
      )}
    </DndContext>
  )
}
