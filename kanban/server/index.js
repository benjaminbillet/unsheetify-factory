import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import commentsRouter from './api/comments.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createApp() {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';

  // ── Middleware ────────────────────────────────────────────────────────────
  // NOTE: origin:'*' + credentials:true is invalid per CORS spec (browsers reject it).
  // Use origin:true (reflect request Origin) in dev so credentials can coexist if needed.
  app.use(cors({
    origin: isProduction ? false : true, // 'true' reflects the request's Origin header
    credentials: true,
  }));
  app.use(express.json());

  // ── API Routes ────────────────────────────────────────────────────────────
  app.use('/api', commentsRouter);

  // ── Routes ────────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Dev/test-only routes (not in production)
  if (!isProduction) {
    app.post('/dev/echo', (req, res) => res.json(req.body));
    app.get('/dev/error', (req, res, next) => {
      const err = new Error('Test error');
      err.status = req.query.status ? parseInt(req.query.status, 10) : 500;
      next(err);
    });
  }

  // ── Static files (production) ─────────────────────────────────────────────
  if (isProduction) {
    const distPath = join(__dirname, '..', 'client', 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) =>
      res.sendFile(join(distPath, 'index.html'))
    );
  }

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.use((_req, res) => res.status(404).json({ error: 'Not Found' }));

  // ── Error handler ─────────────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ error: err.message || 'Internal Server Error' });
  });

  return app;
}

// Start when run as the entry point
// resolve() normalises relative paths before comparing
if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp();
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export { createApp };
