import CardTile from './CardTile.jsx'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import './Column.css'

export default function Column({ title, cards, columnId, onCardClick, onUpdate, footer }) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId })
  const cardIds = cards.map(c => c.id)

  return (
    <section className={`column${isOver ? ' column-drag-over' : ''}`} aria-label={title}>
      <header className="column-header">
        <h2 className="column-title">{title}</h2>
        <span className="column-count" aria-label={`${cards.length} cards`}>
          {cards.length}
        </span>
      </header>
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div className="column-cards" ref={setNodeRef}>
          {cards.length === 0
            ? <p className="column-empty">No cards</p>
            : cards.map(card => <CardTile key={card.id} card={card} onCardClick={onCardClick} onUpdate={onUpdate} />)}
        </div>
      </SortableContext>
      {footer}
    </section>
  )
}
