import './CardTile.css'

export default function CardTile({ card, onCardClick }) {
  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onCardClick(card)
    }
  }

  return (
    <div
      className="card-tile"
      role="button"
      tabIndex={0}
      onClick={() => onCardClick(card)}
      onKeyDown={handleKeyDown}
      aria-label={card.title}
    >
      <h3 className="card-tile-title">{card.title}</h3>
      <p className="card-tile-assignee">{card.assignee ?? 'Unassigned'}</p>
      {card.description && (
        <p className="card-tile-description">{card.description}</p>
      )}
    </div>
  )
}
