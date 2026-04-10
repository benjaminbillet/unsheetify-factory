import { Router } from 'express';
import { getCards, createCard, updateCard, deleteCard, moveCard, NotFoundError } from '../db/queries.js';
import { broadcast } from '../ws/broadcaster.js';

const router = Router();

// GET /api/cards
router.get('/cards', (_req, res, next) => {
  try {
    const cards = getCards();
    return res.status(200).json(cards);
  } catch (err) {
    next(err);
  }
});

// POST /api/cards
router.post('/cards', (req, res, next) => {
  const { title, assignee, column, description } = req.body ?? {};
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }
  try {
    const card = createCard({ title, assignee, column, description });
    try { broadcast('card:created', card); } catch { /* isolate broadcast errors */ }
    return res.status(201).json(card);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/cards/:id
const CARD_UPDATE_ALLOWED = ['title', 'assignee', 'column', 'description', 'position'];
router.patch('/cards/:id', (req, res, next) => {
  const updateData = req.body ?? {};
  try {
    const card = updateCard(req.params.id, updateData);
    // Only broadcast when at least one recognized field was in the request body,
    // meaning updateCard actually performed a DB write. An empty or unrecognized-only
    // body causes updateCard to return the card unchanged (no DB write), so no broadcast.
    if (Object.keys(updateData).some(k => CARD_UPDATE_ALLOWED.includes(k))) {
      try { broadcast('card:updated', card); } catch { /* isolate broadcast errors */ }
    }
    return res.status(200).json(card);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

// DELETE /api/cards/:id
router.delete('/cards/:id', (req, res, next) => {
  try {
    deleteCard(req.params.id);
    try { broadcast('card:deleted', { id: req.params.id }); } catch { /* isolate */ }
    return res.status(204).send();
  } catch (err) {
    if (err instanceof NotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

// PATCH /api/cards/:id/move
router.patch('/cards/:id/move', (req, res, next) => {
  const { column, position } = req.body ?? {};
  if (!column || position === undefined || position === null) {
    return res.status(400).json({ error: 'column and position are required' });
  }
  try {
    const card = moveCard(req.params.id, column, position);
    try { broadcast('card:moved', card); } catch { /* isolate */ }
    return res.status(200).json(card);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

export default router;
