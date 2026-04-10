import CardTile from './CardTile.jsx'
import './Column.css'

export default function Column({ title, cards, onCardClick, footer }) {
  return (
    <section className="column" aria-label={title}>
      <header className="column-header">
        <h2 className="column-title">{title}</h2>
        <span className="column-count" aria-label={`${cards.length} cards`}>
          {cards.length}
        </span>
      </header>
      <div className="column-cards">
        {cards.length === 0 ? (
          <p className="column-empty">No cards</p>
        ) : (
          cards.map(card => (
            <CardTile key={card.id} card={card} onCardClick={onCardClick} />
          ))
        )}
      </div>
      {footer}
    </section>
  )
}
