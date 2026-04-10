import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initDb, closeDb, getDb,
  getCards, createCard, updateCard, deleteCard, moveCard, createComment,
  NotFoundError, DatabaseError, ForeignKeyError,
} from './queries.js';

// ─── initDb / closeDb ─────────────────────────────────────────────────────────
describe('initDb / closeDb', () => {
  it('initDb(:memory:) returns a Database instance', () => {
    const db = initDb(':memory:');
    assert.ok(db, 'should return a truthy db');
    closeDb();
  });

  it('creates cards table', () => {
    const db = initDb(':memory:');
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cards'").get();
    assert.ok(row, 'cards table should exist');
    closeDb();
  });

  it('creates comments table', () => {
    const db = initDb(':memory:');
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='comments'").get();
    assert.ok(row, 'comments table should exist');
    closeDb();
  });

  it('enables foreign keys (pragma returns 1)', () => {
    const db = initDb(':memory:');
    const val = db.pragma('foreign_keys', { simple: true });
    assert.equal(val, 1);
    closeDb();
  });

  it('closeDb() closes the database (subsequent prepare() throws)', () => {
    const db = initDb(':memory:');
    closeDb();
    assert.throws(() => db.prepare('SELECT 1'), /database|connection/i);
  });

  it('can call initDb again after closeDb', () => {
    initDb(':memory:');
    closeDb();
    const db2 = initDb(':memory:');
    assert.ok(db2);
    closeDb();
  });
});

// ─── getCards ─────────────────────────────────────────────────────────────────
describe('getCards', () => {
  beforeEach(() => initDb(':memory:'));
  afterEach(() => closeDb());

  it('returns empty array when no cards', () => {
    assert.deepEqual(getCards(), []);
  });

  it('returns cards with empty comments array', () => {
    createCard({ title: 'Card A' });
    const cards = getCards();
    assert.equal(cards.length, 1);
    assert.deepEqual(cards[0].comments, []);
  });

  it('returns cards ordered by column then position', () => {
    createCard({ title: 'R1', column: 'ready' });
    createCard({ title: 'D1', column: 'done' });
    createCard({ title: 'R2', column: 'ready' });
    createCard({ title: 'I1', column: 'in_progress' });
    const cards = getCards();
    // ORDER BY "column", position — alphabetical by column name
    // 'done' < 'in_progress' < 'ready'
    const titles = cards.map(c => c.title);
    assert.equal(titles[0], 'D1');
    assert.equal(titles[1], 'I1');
    assert.equal(titles[2], 'R1');
    assert.equal(titles[3], 'R2');
  });

  it('nests comments under the correct card', () => {
    const card1 = createCard({ title: 'Card 1' });
    const card2 = createCard({ title: 'Card 2' });
    createComment(card1.id, { author: 'Alice', content: 'Hello from card 1' });
    createComment(card2.id, { author: 'Bob',   content: 'Hello from card 2' });
    const cards = getCards();
    const c1 = cards.find(c => c.id === card1.id);
    const c2 = cards.find(c => c.id === card2.id);
    assert.equal(c1.comments.length, 1);
    assert.equal(c1.comments[0].content, 'Hello from card 1');
    assert.equal(c2.comments.length, 1);
    assert.equal(c2.comments[0].content, 'Hello from card 2');
  });

  it('comments are ordered by created_at within a card', () => {
    const card = createCard({ title: 'Card' });
    createComment(card.id, { author: 'A', content: 'First'  });
    createComment(card.id, { author: 'B', content: 'Second' });
    const cards = getCards();
    const comments = cards[0].comments;
    assert.equal(comments.length, 2);
    assert.ok(comments[0].created_at <= comments[1].created_at);
    assert.equal(comments[0].content, 'First');
    assert.equal(comments[1].content, 'Second');
  });
});

// ─── createCard ───────────────────────────────────────────────────────────────
describe('createCard', () => {
  beforeEach(() => initDb(':memory:'));
  afterEach(() => closeDb());

  it('returns card with all required fields', () => {
    const card = createCard({ title: 'My Card' });
    assert.ok(card.id,          'id should be set');
    assert.equal(card.title, 'My Card');
    assert.ok('assignee'    in card, 'assignee field should exist');
    assert.ok('column'      in card, 'column field should exist');
    assert.ok('position'    in card, 'position field should exist');
    assert.ok('description' in card, 'description field should exist');
    assert.ok('created_at'  in card, 'created_at field should exist');
  });

  it('generates a valid UUID v4 for id', () => {
    const card = createCard({ title: 'UUID Test' });
    assert.match(card.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('sets created_at to a recent Unix timestamp in ms', () => {
    const before = Date.now();
    const card   = createCard({ title: 'Timestamp Test' });
    const after  = Date.now();
    assert.ok(card.created_at >= before, 'created_at should be >= before');
    assert.ok(card.created_at <= after,  'created_at should be <= after');
  });

  it("defaults column to 'ready'", () => {
    const card = createCard({ title: 'Default Column' });
    assert.equal(card.column, 'ready');
  });

  it('defaults assignee and description to null', () => {
    const card = createCard({ title: 'Defaults Test' });
    assert.equal(card.assignee,    null);
    assert.equal(card.description, null);
  });

  it('assigns position 1.0 to the first card in a column', () => {
    const card = createCard({ title: 'First Card', column: 'done' });
    assert.equal(card.position, 1.0);
  });

  it('assigns max+1 to subsequent cards in the same column', () => {
    const card1 = createCard({ title: 'Card 1', column: 'ready' });
    const card2 = createCard({ title: 'Card 2', column: 'ready' });
    assert.equal(card2.position, card1.position + 1.0);
  });

  it('positions are independent per column', () => {
    const readyCard = createCard({ title: 'Ready Card', column: 'ready' });
    const doneCard  = createCard({ title: 'Done Card',  column: 'done'  });
    assert.equal(readyCard.position, 1.0);
    assert.equal(doneCard.position,  1.0);
  });

  it('stores optional fields (assignee, description) when provided', () => {
    const card = createCard({ title: 'Full Card', assignee: 'Alice', description: 'Some desc' });
    assert.equal(card.assignee,    'Alice');
    assert.equal(card.description, 'Some desc');
  });

  it('card appears in getCards() after creation', () => {
    const card  = createCard({ title: 'Visible Card' });
    const cards = getCards();
    assert.ok(cards.some(c => c.id === card.id));
  });
});

// ─── updateCard ───────────────────────────────────────────────────────────────
describe('updateCard', () => {
  let cardId;

  beforeEach(() => {
    initDb(':memory:');
    cardId = createCard({ title: 'Original', assignee: 'Bob' }).id;
  });
  afterEach(() => closeDb());

  it('updates title and returns the updated card', () => {
    const card = updateCard(cardId, { title: 'Updated' });
    assert.equal(card.title, 'Updated');
  });

  it('partial update does not modify unspecified fields', () => {
    updateCard(cardId, { title: 'New Title' });
    const card = getCards().find(c => c.id === cardId);
    assert.equal(card.assignee, 'Bob');
  });

  it('can update multiple fields at once', () => {
    const card = updateCard(cardId, { title: 'Multi', assignee: 'Alice', description: 'Desc' });
    assert.equal(card.title,       'Multi');
    assert.equal(card.assignee,    'Alice');
    assert.equal(card.description, 'Desc');
  });

  it('returned card matches state in database', () => {
    const returned = updateCard(cardId, { title: 'Synced' });
    const fromDb   = getCards().find(c => c.id === cardId);
    assert.equal(returned.title,    fromDb.title);
    assert.equal(returned.assignee, fromDb.assignee);
  });

  it('throws NotFoundError for a non-existent id', () => {
    assert.throws(() => updateCard('no-such-id', { title: 'X' }), NotFoundError);
  });

  it('error message contains the id', () => {
    try {
      updateCard('missing-id', { title: 'X' });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err.message.includes('missing-id'));
    }
  });

  it('ignores fields not in the allowlist (SQL injection prevention)', () => {
    // Sending an un-allowed field should not crash and should not corrupt the table
    const card = updateCard(cardId, { title: 'Safe', injected: 'DROP TABLE cards' });
    assert.equal(card.title, 'Safe');
    // Table still intact
    assert.ok(getCards().length > 0);
  });
});

// ─── deleteCard ───────────────────────────────────────────────────────────────
describe('deleteCard', () => {
  let cardId;

  beforeEach(() => {
    initDb(':memory:');
    cardId = createCard({ title: 'To Delete' }).id;
  });
  afterEach(() => closeDb());

  it('returns true on successful deletion', () => {
    assert.equal(deleteCard(cardId), true);
  });

  it('card no longer appears in getCards() after deletion', () => {
    deleteCard(cardId);
    assert.ok(!getCards().some(c => c.id === cardId));
  });

  it('throws NotFoundError for a non-existent id', () => {
    assert.throws(() => deleteCard('no-such-id'), NotFoundError);
  });

  it('throws NotFoundError if card was already deleted', () => {
    deleteCard(cardId);
    assert.throws(() => deleteCard(cardId), NotFoundError);
  });

  it('cascade-deletes associated comments when card is deleted', () => {
    createComment(cardId, { author: 'Alice', content: 'Will be deleted' });
    deleteCard(cardId);
    const rows = getDb().prepare('SELECT * FROM comments WHERE card_id = ?').all(cardId);
    assert.equal(rows.length, 0);
  });
});

// ─── moveCard ─────────────────────────────────────────────────────────────────
describe('moveCard', () => {
  beforeEach(() => initDb(':memory:'));
  afterEach(() => closeDb());

  it('moves card to empty column', () => {
    const card  = createCard({ title: 'Mover', column: 'ready' });
    const moved = moveCard(card.id, 'done', 0);
    assert.equal(moved.column,   'done');
    assert.equal(moved.position, 1.0);
  });

  it('moves card to first position in populated column', () => {
    const existing = createCard({ title: 'Existing', column: 'done' });
    const card     = createCard({ title: 'Mover',    column: 'ready' });
    const moved    = moveCard(card.id, 'done', 0);
    assert.ok(moved.position < existing.position);
  });

  it('moves card to last position in populated column', () => {
    const existing = createCard({ title: 'Existing', column: 'done' });
    const card     = createCard({ title: 'Mover',    column: 'ready' });
    const moved    = moveCard(card.id, 'done', 1);
    assert.ok(moved.position > existing.position);
  });

  it('moves card to middle position in column', () => {
    const c1   = createCard({ title: 'C1',    column: 'done'  });
    const c2   = createCard({ title: 'C2',    column: 'done'  });
    const card = createCard({ title: 'Mover', column: 'ready' });
    const moved = moveCard(card.id, 'done', 1);
    assert.ok(moved.position > c1.position);
    assert.ok(moved.position < c2.position);
  });

  it('returned card reflects updated column and position', () => {
    const card  = createCard({ title: 'Mover', column: 'ready' });
    const moved = moveCard(card.id, 'in_progress', 0);
    assert.equal(moved.column, 'in_progress');
    assert.ok(typeof moved.position === 'number');
  });

  it('moves card within same column to later position', () => {
    const c1 = createCard({ title: 'C1', column: 'ready' });
    const c2 = createCard({ title: 'C2', column: 'ready' });
    const moved = moveCard(c1.id, 'ready', 1);
    assert.ok(moved.position > c2.position);
  });

  it('moves card within same column to earlier position', () => {
    const c1 = createCard({ title: 'C1', column: 'ready' });
    const c2 = createCard({ title: 'C2', column: 'ready' });
    const moved = moveCard(c2.id, 'ready', 0);
    assert.ok(moved.position < c1.position);
  });

  it('renormalizes column when position gap falls below 0.001', () => {
    // Create three cards then force a tiny gap between the first two
    const cA   = createCard({ title: 'A', column: 'ready' });
    const cB   = createCard({ title: 'B', column: 'ready' });
    const mover = createCard({ title: 'Mover', column: 'done' });

    // Force positions to have a gap of 0.0005 (< 0.001)
    const db = getDb();
    db.prepare('UPDATE cards SET position = ? WHERE id = ?').run(1.0,    cA.id);
    db.prepare('UPDATE cards SET position = ? WHERE id = ?').run(1.0005, cB.id);

    // Move Mover between A and B — gap triggers renormalization
    const moved = moveCard(mover.id, 'ready', 1);

    // After renormalization all positions in 'ready' should be clean integers
    const readyCards = db
      .prepare('SELECT position FROM cards WHERE "column" = ? ORDER BY position')
      .all('ready');
    readyCards.forEach((r, i) => {
      assert.ok(
        Math.abs(r.position - (i + 1.0)) < 0.0001,
        `expected position ~${i + 1}, got ${r.position}`,
      );
    });
    assert.equal(moved.column, 'ready');
  });

  it('throws NotFoundError for a non-existent card id', () => {
    assert.throws(() => moveCard('no-such-id', 'ready', 0), NotFoundError);
  });

  it('negative position value treated as first position', () => {
    const c1   = createCard({ title: 'C1',    column: 'done'  });
    const card = createCard({ title: 'Mover', column: 'ready' });
    const moved = moveCard(card.id, 'done', -5);
    assert.ok(moved.position < c1.position);
  });

  it('position beyond end treated as last position', () => {
    const c1   = createCard({ title: 'C1',    column: 'done'  });
    const card = createCard({ title: 'Mover', column: 'ready' });
    const moved = moveCard(card.id, 'done', 999);
    assert.ok(moved.position > c1.position);
  });
});

// ─── createComment ────────────────────────────────────────────────────────────
describe('createComment', () => {
  let cardId;

  beforeEach(() => {
    initDb(':memory:');
    cardId = createCard({ title: 'Parent Card' }).id;
  });
  afterEach(() => closeDb());

  it('returns comment with all fields', () => {
    const comment = createComment(cardId, { author: 'Alice', content: 'Hello' });
    assert.ok(comment.id,                  'id should be set');
    assert.equal(comment.card_id, cardId);
    assert.equal(comment.author,  'Alice');
    assert.equal(comment.content, 'Hello');
    assert.ok('created_at' in comment);
  });

  it('generates a valid UUID v4 for comment id', () => {
    const comment = createComment(cardId, { author: 'Alice', content: 'Hello' });
    assert.match(comment.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('sets created_at to a recent timestamp', () => {
    const before  = Date.now();
    const comment = createComment(cardId, { author: 'Alice', content: 'Hello' });
    const after   = Date.now();
    assert.ok(comment.created_at >= before);
    assert.ok(comment.created_at <= after);
  });

  it('comment appears nested under the card in getCards()', () => {
    createComment(cardId, { author: 'Alice', content: 'Nested' });
    const card = getCards().find(c => c.id === cardId);
    assert.equal(card.comments.length, 1);
    assert.equal(card.comments[0].content, 'Nested');
  });

  it('multiple comments accumulate under the card', () => {
    createComment(cardId, { author: 'Alice', content: 'First'  });
    createComment(cardId, { author: 'Bob',   content: 'Second' });
    const card = getCards().find(c => c.id === cardId);
    assert.equal(card.comments.length, 2);
  });

  it('throws ForeignKeyError for a non-existent cardId', () => {
    assert.throws(
      () => createComment('no-such-card', { author: 'Alice', content: 'Hello' }),
      ForeignKeyError,
    );
  });

  it('ForeignKeyError is also an instance of DatabaseError', () => {
    try {
      createComment('no-such-card', { author: 'A', content: 'B' });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof DatabaseError,   'should be instanceof DatabaseError');
      assert.ok(err instanceof ForeignKeyError, 'should be instanceof ForeignKeyError');
    }
  });
});

// ─── Error Classes ────────────────────────────────────────────────────────────
describe('Error Classes', () => {
  it('NotFoundError is instanceof Error with correct name and message', () => {
    const err = new NotFoundError('not found msg');
    assert.ok(err instanceof Error);
    assert.equal(err.name,    'NotFoundError');
    assert.equal(err.message, 'not found msg');
  });

  it('ForeignKeyError is instanceof DatabaseError and Error', () => {
    const err = new ForeignKeyError('fk error msg');
    assert.ok(err instanceof DatabaseError);
    assert.ok(err instanceof Error);
    assert.equal(err.name,    'ForeignKeyError');
    assert.equal(err.message, 'fk error msg');
  });
});
