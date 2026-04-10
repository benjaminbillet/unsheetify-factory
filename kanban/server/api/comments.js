import { Router } from 'express';
import { createComment, ForeignKeyError } from '../db/queries.js';

const router = Router();

router.post('/cards/:id/comments', (req, res, next) => {
  const { author, content } = req.body ?? {};

  if (!author || !content) {
    return res.status(400).json({ error: 'author and content are required' });
  }

  try {
    const comment = createComment(req.params.id, { author, content });
    return res.status(201).json(comment);
  } catch (err) {
    if (err instanceof ForeignKeyError) {
      return res.status(404).json({ error: err.message });
    }
    next(err); // passes to Express error handler → 500
  }
});

export default router;
