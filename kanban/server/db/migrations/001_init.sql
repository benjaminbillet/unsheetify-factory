CREATE TABLE IF NOT EXISTS cards (
  id          TEXT    PRIMARY KEY,
  title       TEXT    NOT NULL,
  assignee    TEXT,
  "column"    TEXT    NOT NULL DEFAULT 'ready',
  position    REAL    NOT NULL,
  description TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT    PRIMARY KEY,
  card_id    TEXT    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  author     TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cards_column_position ON cards("column", position);
CREATE INDEX IF NOT EXISTS idx_comments_card_id ON comments(card_id);
