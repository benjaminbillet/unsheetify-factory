import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Custom Errors ---
export class NotFoundError extends Error {
  constructor(msg) { super(msg); this.name = 'NotFoundError'; }
}
export class DatabaseError extends Error {
  constructor(msg) { super(msg); this.name = 'DatabaseError'; }
}
export class ForeignKeyError extends DatabaseError {
  constructor(msg) { super(msg); this.name = 'ForeignKeyError'; }
}

// --- Module-level singletons ---
let db = null;
let stmts = {};

export function getDb() { return db; }

// --- initDb ---
export function initDb(dbPath = 'data/kanban.db') {
  const resolvedPath = dbPath === ':memory:' ? ':memory:' : resolve(process.cwd(), dbPath);
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(resolvedPath), { recursive: true });
  }
  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const sql = readFileSync(resolve(__dirname, 'migrations', '001_init.sql'), 'utf8');
  db.exec(sql);
  _prepareStatements();
  return db;
}

function _prepareStatements() {
  stmts.getAllCards     = db.prepare('SELECT * FROM cards ORDER BY "column", position');
  stmts.getAllComments  = db.prepare('SELECT * FROM comments ORDER BY created_at');
  stmts.insertCard     = db.prepare(
    'INSERT INTO cards (id, title, assignee, "column", position, description, created_at) VALUES (@id, @title, @assignee, @column, @position, @description, @created_at)'
  );
  stmts.getCardById    = db.prepare('SELECT * FROM cards WHERE id = ?');
  stmts.maxPosInCol    = db.prepare('SELECT MAX(position) AS maxPos FROM cards WHERE "column" = ?');
  stmts.deleteCard     = db.prepare('DELETE FROM cards WHERE id = ?');
  stmts.insertComment  = db.prepare(
    'INSERT INTO comments (id, card_id, author, content, created_at) VALUES (@id, @card_id, @author, @content, @created_at)'
  );
  stmts.getCommentById = db.prepare('SELECT * FROM comments WHERE id = ?');
  stmts.getSiblings    = db.prepare(
    'SELECT id, position FROM cards WHERE "column" = ? AND id != ? ORDER BY position'
  );
  stmts.updateCardPos  = db.prepare(
    'UPDATE cards SET "column" = @column, position = @position WHERE id = @id'
  );
}

export function closeDb() {
  if (db) { db.close(); db = null; stmts = {}; }
}

// --- getCards ---
export function getCards() {
  const cards = stmts.getAllCards.all();
  const comments = stmts.getAllComments.all();
  const byCard = {};
  for (const c of comments) {
    (byCard[c.card_id] ??= []).push(c);
  }
  return cards.map(card => ({ ...card, comments: byCard[card.id] ?? [] }));
}

// --- createCard ---
export function createCard(data) {
  const { title, assignee = null, column = 'ready', description = null } = data;
  const id = uuidv4();
  const created_at = Date.now();
  const { maxPos } = stmts.maxPosInCol.get(column);
  const position = maxPos === null ? 1.0 : maxPos + 1.0;
  stmts.insertCard.run({ id, title, assignee, column, position, description, created_at });
  return stmts.getCardById.get(id);
}

// --- updateCard ---
export function updateCard(id, data) {
  const allowed = ['title', 'assignee', 'column', 'description', 'position'];
  const fields = Object.keys(data).filter(k => allowed.includes(k));
  if (fields.length === 0) {
    const card = stmts.getCardById.get(id);
    if (!card) throw new NotFoundError(`Card not found: ${id}`);
    return card;
  }
  const setClause = fields.map(f => `"${f}" = @${f}`).join(', ');
  const result = db.prepare(`UPDATE cards SET ${setClause} WHERE id = @id`).run({ ...data, id });
  if (result.changes === 0) throw new NotFoundError(`Card not found: ${id}`);
  return stmts.getCardById.get(id);
}

// --- deleteCard ---
export function deleteCard(id) {
  const result = stmts.deleteCard.run(id);
  if (result.changes === 0) throw new NotFoundError(`Card not found: ${id}`);
  return true;
}

// --- renormalizeColumn ---
export function renormalizeColumn(column, orderedIds = null) {
  const doRenorm = db.transaction(() => {
    const startTime = Date.now();
    const ids = orderedIds ??
      db.prepare('SELECT id FROM cards WHERE "column" = ? ORDER BY position')
        .all(column)
        .map(c => c.id);
    if (ids.length === 0) return 0;
    const stmt = db.prepare('UPDATE cards SET "column" = ?, position = ? WHERE id = ?');
    ids.forEach((cardId, i) => stmt.run(column, i + 1.0, cardId));
    const duration = Date.now() - startTime;
    console.log(`[renormalize] column="${column}" cards=${ids.length} duration=${duration}ms`);
    return ids.length;
  });
  return doRenorm();
}

// --- moveCard ---
export function moveCard(id, column, position) {
  const card = stmts.getCardById.get(id);
  if (!card) throw new NotFoundError(`Card not found: ${id}`);

  const doMove = db.transaction(() => {
    const siblings = stmts.getSiblings.all(column, id);
    // siblings: sorted by position, excludes the moved card itself

    if (siblings.length === 0) {
      stmts.updateCardPos.run({ column, position: 1.0, id });
    } else if (position <= 0) {
      const newPos = siblings[0].position / 2;
      if (newPos < 0.001) {
        renormalizeColumn(column, [id, ...siblings.map(s => s.id)]);
      } else {
        stmts.updateCardPos.run({ column, position: newPos, id });
      }
    } else if (position >= siblings.length) {
      stmts.updateCardPos.run({ column, position: siblings[siblings.length - 1].position + 1.0, id });
    } else {
      const before = siblings[position - 1].position;
      const after  = siblings[position].position;
      const gap    = after - before;

      if (gap >= 0.001) {
        stmts.updateCardPos.run({ column, position: (before + after) / 2, id });
      } else {
        const newOrder = [
          ...siblings.slice(0, position).map(s => s.id),
          id,
          ...siblings.slice(position).map(s => s.id),
        ];
        renormalizeColumn(column, newOrder);
      }
    }

    return stmts.getCardById.get(id);
  });

  return doMove();
}

// --- createComment ---
export function createComment(cardId, data) {
  const { author, content } = data;
  const id = uuidv4();
  const created_at = Date.now();
  try {
    stmts.insertComment.run({ id, card_id: cardId, author, content, created_at });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      throw new ForeignKeyError(`Card not found: ${cardId}`);
    }
    throw new DatabaseError(err.message);
  }
  return stmts.getCommentById.get(id);
}
