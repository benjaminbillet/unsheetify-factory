import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initDb, closeDb, getDb,
  getCards, createCard, updateCard, deleteCard, moveCard, createComment,
  renormalizeColumn,
  NotFoundError, DatabaseError, ForeignKeyError,
} from '../db/queries.js';

// ---------------------------------------------------------------------------
// initDb and closeDb
// ---------------------------------------------------------------------------
describe('initDb and closeDb', () => {
  it('initDb with :memory: returns a Database instance', () => {
    const db = initDb(':memory:');
    assert.ok(db);
    assert.ok(typeof db.prepare === 'function');
    closeDb();
  });

  it('initDb creates the cards table', () => {
    initDb(':memory:');
    const result = getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cards'").get();
    assert.equal(result.name, 'cards');
    closeDb();
  });

  it('initDb creates the comments table', () => {
    initDb(':memory:');
    const result = getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='comments'").get();
    assert.equal(result.name, 'comments');
    closeDb();
  });

  it('initDb enables foreign keys', () => {
    initDb(':memory:');
    const fk = getDb().pragma('foreign_keys', { simple: true });
    assert.equal(fk, 1);
    closeDb();
  });

  it('closeDb closes the database', () => {
    initDb(':memory:');
    const raw = getDb();
    closeDb();
    assert.throws(() => raw.prepare('SELECT 1'));
  });

  it('initDb can be called again after closeDb', () => {
    initDb(':memory:');
    closeDb();
    assert.doesNotThrow(() => initDb(':memory:'));
    closeDb();
  });
});

// ---------------------------------------------------------------------------
// getCards
// ---------------------------------------------------------------------------
describe('getCards', () => {
  beforeEach(() => initDb(':memory:'));
  afterEach(() => closeDb());

  it('returns empty array when no cards exist', () => {
    assert.deepEqual(getCards(), []);
  });

  it('returns cards with empty comments array', () => {
    createCard({ title: 'T' });
    const result = getCards();
    assert.deepEqual(result[0].comments, []);
  });

  it('returns cards ordered by column then position (alphabetical column order)', () => {
    createCard({ title: 'Done1', column: 'done' });
    createCard({ title: 'Done2', column: 'done' });
    createCard({ title: 'Ready1', column: 'ready' });
    const result = getCards();
    assert.equal(result[0].column, 'done');
    assert.equal(result[1].column, 'done');
    assert.equal(result[2].column, 'ready');
    assert.ok(result[0].position < result[1].position);
  });

  it('nests comments under the correct card', () => {
    const cardA = createCard({ title: 'Card A' });
    const cardB = createCard({ title: 'Card B' });
    createComment(cardA.id, { author: 'Alice', content: 'Comment 1' });
    createComment(cardA.id, { author: 'Alice', content: 'Comment 2' });
    createComment(cardB.id, { author: 'Bob', content: 'Comment 3' });
    const cards = getCards();
    const foundA = cards.find(c => c.id === cardA.id);
    const foundB = cards.find(c => c.id === cardB.id);
    assert.equal(foundA.comments.length, 2);
    assert.equal(foundB.comments.length, 1);
    for (const comment of foundA.comments) assert.equal(comment.card_id, cardA.id);
    for (const comment of foundB.comments) assert.equal(comment.card_id, cardB.id);
  });

  it('comments are ordered by created_at within a card', () => {
    const card = createCard({ title: 'T' });
    const db = getDb();
    const ins = db.prepare(
      'INSERT INTO comments (id, card_id, author, content, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    ins.run('c3', card.id, 'Author', 'Third',  3000);
    ins.run('c1', card.id, 'Author', 'First',  1000);
    ins.run('c2', card.id, 'Author', 'Second', 2000);
    const result = getCards().find(c => c.id === card.id);
    assert.equal(result.comments[0].created_at, 1000);
    assert.equal(result.comments[1].created_at, 2000);
    assert.equal(result.comments[2].created_at, 3000);
  });
});

// ---------------------------------------------------------------------------
// createCard
// ---------------------------------------------------------------------------
describe('createCard', () => {
  beforeEach(() => initDb(':memory:'));
  afterEach(() => closeDb());

  it('returns card with all required fields', () => {
    const card = createCard({ title: 'My card' });
    assert.ok('id' in card);
    assert.ok('title' in card);
    assert.ok('assignee' in card);
    assert.ok('column' in card);
    assert.ok('position' in card);
    assert.ok('description' in card);
    assert.ok('created_at' in card);
  });

  it('generates a valid UUID v4 for id', () => {
    const card = createCard({ title: 'UUID test' });
    assert.match(card.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('sets created_at to a recent Unix timestamp in ms', () => {
    const t0 = Date.now();
    const card = createCard({ title: 'Timestamp' });
    const t1 = Date.now();
    assert.ok(card.created_at >= t0 && card.created_at <= t1);
  });

  it('defaults column to ready', () => {
    const card = createCard({ title: 'X' });
    assert.equal(card.column, 'ready');
  });

  it('defaults assignee and description to null', () => {
    const card = createCard({ title: 'X' });
    assert.equal(card.assignee, null);
    assert.equal(card.description, null);
  });

  it('assigns position 1.0 to the first card in a column', () => {
    const card = createCard({ title: 'A', column: 'done' });
    assert.equal(card.position, 1.0);
  });

  it('assigns position max+1 to subsequent cards in the same column', () => {
    const c1 = createCard({ title: 'A', column: 'done' });
    const c2 = createCard({ title: 'B', column: 'done' });
    const c3 = createCard({ title: 'C', column: 'done' });
    assert.equal(c1.position, 1.0);
    assert.equal(c2.position, 2.0);
    assert.equal(c3.position, 3.0);
  });

  it('positions are independent per column', () => {
    createCard({ title: 'R', column: 'ready' });
    const done = createCard({ title: 'D', column: 'done' });
    assert.equal(done.position, 1.0);
  });

  it('uses provided column value', () => {
    const card = createCard({ title: 'X', column: 'in_progress' });
    assert.equal(card.column, 'in_progress');
  });

  it('stores optional fields when provided', () => {
    const card = createCard({ title: 'Full', assignee: 'Alice', description: 'Desc' });
    assert.equal(card.assignee, 'Alice');
    assert.equal(card.description, 'Desc');
  });

  it('card appears in getCards() after creation', () => {
    const card = createCard({ title: 'Visible' });
    const cards = getCards();
    assert.ok(cards.some(c => c.id === card.id));
  });
});

// ---------------------------------------------------------------------------
// updateCard
// ---------------------------------------------------------------------------
describe('updateCard', () => {
  let cardId;
  beforeEach(() => {
    initDb(':memory:');
    cardId = createCard({ title: 'Original', column: 'ready' }).id;
  });
  afterEach(() => closeDb());

  it('updates title and returns the updated card', () => {
    const updated = updateCard(cardId, { title: 'New' });
    assert.equal(updated.title, 'New');
    assert.equal(updated.id, cardId);
  });

  it('partial update does not modify unspecified fields', () => {
    const updated = updateCard(cardId, { title: 'Partial' });
    assert.equal(updated.description, null);
    assert.equal(updated.column, 'ready');
  });

  it('can update multiple fields at once', () => {
    const updated = updateCard(cardId, { title: 'Multi', assignee: 'Bob', description: 'Desc' });
    assert.equal(updated.title, 'Multi');
    assert.equal(updated.assignee, 'Bob');
    assert.equal(updated.description, 'Desc');
  });

  it('returned card matches state in database', () => {
    updateCard(cardId, { title: 'DB Check' });
    const cards = getCards();
    const found = cards.find(c => c.id === cardId);
    assert.equal(found.title, 'DB Check');
  });

  it('throws NotFoundError for a non-existent id', () => {
    try {
      updateCard('no-such-id', { title: 'X' });
      assert.fail('Expected NotFoundError');
    } catch (e) {
      assert.ok(e instanceof NotFoundError);
    }
  });

  it('error message contains the id', () => {
    try {
      updateCard('bad-id', { title: 'X' });
      assert.fail('Expected NotFoundError');
    } catch (e) {
      assert.ok(e.message.includes('bad-id'));
    }
  });

  it('ignores fields not in the allowlist (SQL injection prevention)', () => {
    updateCard(cardId, { title: 'Safe', malicious: 'DROP TABLE cards' });
    const cards = getCards();
    assert.ok(cards.some(c => c.id === cardId));
  });
});

// ---------------------------------------------------------------------------
// deleteCard
// ---------------------------------------------------------------------------
describe('deleteCard', () => {
  let cardId;
  beforeEach(() => {
    initDb(':memory:');
    cardId = createCard({ title: 'Delete me' }).id;
  });
  afterEach(() => closeDb());

  it('returns true on successful deletion', () => {
    assert.equal(deleteCard(cardId), true);
  });

  it('card no longer appears in getCards() after deletion', () => {
    deleteCard(cardId);
    const cards = getCards();
    assert.ok(cards.every(c => c.id !== cardId));
  });

  it('throws NotFoundError for a non-existent id', () => {
    try {
      deleteCard('no-such-id');
      assert.fail('Expected NotFoundError');
    } catch (e) {
      assert.ok(e instanceof NotFoundError);
    }
  });

  it('throws NotFoundError if card was already deleted', () => {
    deleteCard(cardId);
    try {
      deleteCard(cardId);
      assert.fail('Expected NotFoundError');
    } catch (e) {
      assert.ok(e instanceof NotFoundError);
    }
  });

  it('cascade-deletes associated comments when card is deleted', () => {
    createComment(cardId, { author: 'A', content: 'B' });
    createComment(cardId, { author: 'C', content: 'D' });
    deleteCard(cardId);
    const remaining = getDb().prepare('SELECT * FROM comments WHERE card_id = ?').all(cardId);
    assert.deepEqual(remaining, []);
  });
});

// ---------------------------------------------------------------------------
// moveCard
// ---------------------------------------------------------------------------
describe('moveCard', () => {
  beforeEach(() => initDb(':memory:'));
  afterEach(() => closeDb());

  it('moves card to empty column', () => {
    const A = createCard({ title: 'A', column: 'ready' });
    const result = moveCard(A.id, 'done', 0);
    assert.equal(result.column, 'done');
    assert.equal(result.position, 1.0);
  });

  it('moves card to first position in populated column', () => {
    const B = createCard({ title: 'B', column: 'done' });
    const C = createCard({ title: 'C', column: 'done' });
    const A = createCard({ title: 'A', column: 'ready' });
    const result = moveCard(A.id, 'done', 0);
    assert.equal(result.id, A.id);
    assert.equal(result.column, 'done');
    assert.ok(result.position < B.position);
  });

  it('moves card to last position in populated column', () => {
    const B = createCard({ title: 'B', column: 'done' });
    const C = createCard({ title: 'C', column: 'done' });
    const A = createCard({ title: 'A', column: 'ready' });
    const result = moveCard(A.id, 'done', 2);
    assert.ok(result.position > C.position);
  });

  it('moves card to middle position in column', () => {
    const B = createCard({ title: 'B', column: 'done' });
    const C = createCard({ title: 'C', column: 'done' });
    const D = createCard({ title: 'D', column: 'done' });
    const A = createCard({ title: 'A', column: 'ready' });
    const result = moveCard(A.id, 'done', 1);
    assert.ok(B.position < result.position && result.position < C.position);
  });

  it('returned card reflects updated column and position', () => {
    const A = createCard({ title: 'A', column: 'ready' });
    const result = moveCard(A.id, 'done', 0);
    assert.equal(result.id, A.id);
    assert.equal(result.column, 'done');
    assert.equal(typeof result.position, 'number');
  });

  it('moves card within same column to later position', () => {
    const A = createCard({ title: 'A', column: 'ready' });
    const B = createCard({ title: 'B', column: 'ready' });
    const C = createCard({ title: 'C', column: 'ready' });
    moveCard(A.id, 'ready', 1);
    const sorted = getCards()
      .filter(c => c.column === 'ready')
      .sort((a, b) => a.position - b.position);
    assert.equal(sorted[0].id, B.id);
    assert.equal(sorted[1].id, A.id);
    assert.equal(sorted[2].id, C.id);
  });

  it('moves card within same column to earlier position', () => {
    const A = createCard({ title: 'A', column: 'ready' });
    const B = createCard({ title: 'B', column: 'ready' });
    const C = createCard({ title: 'C', column: 'ready' });
    moveCard(C.id, 'ready', 0);
    const sorted = getCards()
      .filter(c => c.column === 'ready')
      .sort((a, b) => a.position - b.position);
    assert.equal(sorted[0].id, C.id);
    assert.equal(sorted[1].id, A.id);
    assert.equal(sorted[2].id, B.id);
  });

  it('renormalizes column when position gap falls below 0.001', () => {
    const db = getDb();
    const insertCard = db.prepare(
      'INSERT INTO cards (id, title, "column", position, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    insertCard.run('renorm-1', 'Card One', 'renorm_test', 1.0,    1000);
    insertCard.run('renorm-2', 'Card Two', 'renorm_test', 1.0004, 2000);
    const A = createCard({ title: 'A', column: 'ready' });
    moveCard(A.id, 'renorm_test', 1);
    const cards = getCards()
      .filter(c => c.column === 'renorm_test')
      .sort((a, b) => a.position - b.position);
    for (const c of cards) assert.ok(c.position % 1 === 0, `position ${c.position} is not whole`);
    const r1 = cards.find(c => c.id === 'renorm-1');
    const r2 = cards.find(c => c.id === 'renorm-2');
    assert.ok(r1.position < r2.position);
  });

  it('throws NotFoundError for a non-existent card id', () => {
    try {
      moveCard('no-such-id', 'ready', 0);
      assert.fail('Expected NotFoundError');
    } catch (e) {
      assert.ok(e instanceof NotFoundError);
    }
  });

  it('negative position value treated as first position', () => {
    const B = createCard({ title: 'B', column: 'done' });
    const A = createCard({ title: 'A', column: 'ready' });
    const result = moveCard(A.id, 'done', -5);
    assert.ok(result.position < B.position);
  });

  it('position beyond end treated as last position', () => {
    const B = createCard({ title: 'B', column: 'done' });
    const C = createCard({ title: 'C', column: 'done' });
    const A = createCard({ title: 'A', column: 'ready' });
    const result = moveCard(A.id, 'done', 999);
    assert.ok(result.position > C.position);
  });

  it('renormalizes when moving to first position creates a gap below 0.001', () => {
    const db = getDb();
    const ins = db.prepare(
      'INSERT INTO cards (id, title, "column", position, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    ins.run('fp-1', 'First', 'col_fp', 0.0016, 1000);
    ins.run('fp-2', 'Second', 'col_fp', 1.0, 2000);
    const A = createCard({ title: 'A', column: 'ready' });

    moveCard(A.id, 'col_fp', 0); // move to first position

    const cards = getCards()
      .filter(c => c.column === 'col_fp')
      .sort((a, b) => a.position - b.position);

    for (const c of cards)
      assert.ok(c.position % 1 === 0, `position ${c.position} is not whole`);
    assert.equal(cards[0].id, A.id);   // A is now first
    assert.equal(cards[1].id, 'fp-1');
    assert.equal(cards[2].id, 'fp-2');
  });

  it('does not renormalize when moving to first position with sufficient gap', () => {
    const B = createCard({ title: 'B', column: 'done' }); // position 1.0
    const A = createCard({ title: 'A', column: 'ready' });
    const result = moveCard(A.id, 'done', 0);
    // 1.0 / 2 = 0.5, gap = 0.5 >= 0.001 → no renorm, position should be fractional
    assert.ok(result.position < B.position);
    assert.ok(result.position % 1 !== 0);
  });

  it('maintains stable ordered positions after 50 rapid reorder operations', () => {
    for (let i = 0; i < 10; i++) {
      createCard({ title: `Stress ${i}`, column: 'stress_col' });
    }
    for (let i = 0; i < 50; i++) {
      const ordered = getCards()
        .filter(c => c.column === 'stress_col')
        .sort((a, b) => a.position - b.position);
      moveCard(ordered[0].id, 'stress_col', 1); // always move first to second slot
    }
    const final = getCards()
      .filter(c => c.column === 'stress_col')
      .sort((a, b) => a.position - b.position);
    assert.equal(final.length, 10);
    for (let i = 1; i < final.length; i++) {
      assert.ok(
        final[i].position > final[i - 1].position,
        `positions out of order at index ${i}`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// renormalizeColumn
// ---------------------------------------------------------------------------
describe('renormalizeColumn', () => {
  beforeEach(() => initDb(':memory:'));
  afterEach(() => closeDb());

  // --- Subtask 2 tests ---

  it('assigns integer positions 1,2,3... to all cards in column', () => {
    const db = getDb();
    const ins = db.prepare(
      'INSERT INTO cards (id, title, "column", position, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    ins.run('a', 'A', 'tc', 1.25, 1000);
    ins.run('b', 'B', 'tc', 1.5,  2000);
    ins.run('c', 'C', 'tc', 1.75, 3000);

    renormalizeColumn('tc');

    const cards = getCards().filter(c => c.column === 'tc').sort((a,b) => a.position - b.position);
    assert.equal(cards[0].position, 1.0);
    assert.equal(cards[1].position, 2.0);
    assert.equal(cards[2].position, 3.0);
  });

  it('preserves original card order when renormalizing', () => {
    const db = getDb();
    const ins = db.prepare(
      'INSERT INTO cards (id, title, "column", position, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    ins.run('x', 'X', 'tc2', 0.0004, 1000);
    ins.run('y', 'Y', 'tc2', 0.0008, 2000);
    ins.run('z', 'Z', 'tc2', 0.0012, 3000);

    renormalizeColumn('tc2');

    const cards = getCards().filter(c => c.column === 'tc2').sort((a,b) => a.position - b.position);
    assert.equal(cards[0].id, 'x');
    assert.equal(cards[1].id, 'y');
    assert.equal(cards[2].id, 'z');
  });

  it('accepts explicit orderedIds array to override current DB order', () => {
    const db = getDb();
    const ins = db.prepare(
      'INSERT INTO cards (id, title, "column", position, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    ins.run('p', 'P', 'tc3', 1.0, 1000);
    ins.run('q', 'Q', 'tc3', 2.0, 2000);
    ins.run('r', 'R', 'tc3', 3.0, 3000);

    renormalizeColumn('tc3', ['r', 'p', 'q']); // reverse first two

    const cards = getCards().filter(c => c.column === 'tc3').sort((a,b) => a.position - b.position);
    assert.equal(cards[0].id, 'r');
    assert.equal(cards[1].id, 'p');
    assert.equal(cards[2].id, 'q');
  });

  it('returns the count of cards renormalized', () => {
    createCard({ title: 'A', column: 'tc4' });
    createCard({ title: 'B', column: 'tc4' });
    const count = renormalizeColumn('tc4');
    assert.equal(count, 2);
  });

  it('handles an empty column without error', () => {
    assert.doesNotThrow(() => renormalizeColumn('nonexistent_col'));
    assert.equal(renormalizeColumn('nonexistent_col'), 0);
  });

  it('handles a single-card column', () => {
    createCard({ title: 'Solo', column: 'solo' });
    renormalizeColumn('solo');
    const cards = getCards().filter(c => c.column === 'solo');
    assert.equal(cards[0].position, 1.0);
  });

  // --- Subtask 3 tests ---

  it('logs renormalization event with column name, card count, and duration', () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => { logs.push(args.join(' ')); origLog(...args); };
    try {
      createCard({ title: 'X', column: 'log_col' });
      createCard({ title: 'Y', column: 'log_col' });
      renormalizeColumn('log_col');
    } finally {
      console.log = origLog;
    }
    const line = logs.find(m => m.includes('[renormalize]'));
    assert.ok(line, 'Expected a [renormalize] log line');
    assert.ok(line.includes('log_col'), 'Expected column name in log');
    assert.ok(line.includes('cards=2'), 'Expected card count in log');
    assert.match(line, /duration=\d+ms/);
  });

  it('renormalizes 1000 cards in under 1000ms', () => {
    const db = getDb();
    const ins = db.prepare(
      'INSERT INTO cards (id, title, "column", position, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    for (let i = 0; i < 1000; i++) {
      ins.run(`perf-${i}`, `Card ${i}`, 'perf_col', i * 0.0001, i);
    }
    const start = Date.now();
    const count = renormalizeColumn('perf_col');
    const elapsed = Date.now() - start;
    assert.equal(count, 1000);
    assert.ok(elapsed < 1000, `Renormalization of 1000 cards took ${elapsed}ms, expected < 1000ms`);
  });

}); // end describe('renormalizeColumn')

// ---------------------------------------------------------------------------
// createComment
// ---------------------------------------------------------------------------
describe('createComment', () => {
  let cardId;
  beforeEach(() => {
    initDb(':memory:');
    cardId = createCard({ title: 'Parent card' }).id;
  });
  afterEach(() => closeDb());

  it('returns comment with all fields', () => {
    const comment = createComment(cardId, { author: 'Alice', content: 'Hello' });
    assert.ok(comment.id);
    assert.equal(comment.card_id, cardId);
    assert.equal(comment.author, 'Alice');
    assert.equal(comment.content, 'Hello');
    assert.equal(typeof comment.created_at, 'number');
  });

  it('generates a valid UUID v4 for comment id', () => {
    const comment = createComment(cardId, { author: 'Alice', content: 'Hello' });
    assert.match(comment.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('sets created_at to a recent timestamp', () => {
    const t0 = Date.now();
    const comment = createComment(cardId, { author: 'Alice', content: 'Hello' });
    const t1 = Date.now();
    assert.ok(comment.created_at >= t0 && comment.created_at <= t1);
  });

  it('comment appears nested under the card in getCards()', () => {
    createComment(cardId, { author: 'Alice', content: 'Hello' });
    const cards = getCards();
    const card = cards.find(c => c.id === cardId);
    assert.equal(card.comments.length, 1);
    assert.equal(card.comments[0].content, 'Hello');
  });

  it('multiple comments accumulate under the card', () => {
    createComment(cardId, { author: 'A', content: '1' });
    createComment(cardId, { author: 'B', content: '2' });
    createComment(cardId, { author: 'C', content: '3' });
    const cards = getCards();
    const card = cards.find(c => c.id === cardId);
    assert.equal(card.comments.length, 3);
  });

  it('throws ForeignKeyError for a non-existent cardId', () => {
    try {
      createComment('no-such-card', { author: 'X', content: 'Y' });
      assert.fail('Expected ForeignKeyError');
    } catch (e) {
      assert.ok(e instanceof ForeignKeyError);
    }
  });

  it('ForeignKeyError is also an instance of DatabaseError', () => {
    try {
      createComment('no-such-card', { author: 'X', content: 'Y' });
      assert.fail('Expected ForeignKeyError');
    } catch (e) {
      assert.ok(e instanceof DatabaseError);
    }
  });
});

// ---------------------------------------------------------------------------
// Error Classes
// ---------------------------------------------------------------------------
describe('Error Classes', () => {
  it('NotFoundError is instanceof Error with correct name and message', () => {
    const e = new NotFoundError('test msg');
    assert.ok(e instanceof Error);
    assert.equal(e.name, 'NotFoundError');
    assert.equal(e.message, 'test msg');
  });

  it('ForeignKeyError is instanceof DatabaseError and Error', () => {
    const e = new ForeignKeyError('fk');
    assert.ok(e instanceof ForeignKeyError);
    assert.ok(e instanceof DatabaseError);
    assert.ok(e instanceof Error);
    assert.equal(e.name, 'ForeignKeyError');
  });
});
