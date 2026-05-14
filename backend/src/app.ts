import express from 'express';
import cors from 'cors';
import { meRouter } from './routes/me';
import { quranRouter } from './routes/quran';
import { assignmentsRouter } from './routes/assignments';
import { submissionsRouter } from './routes/submissions';
import { annotationsRouter } from './routes/annotations';
import { mediaRouter } from './routes/media';
import { progressRouter } from './routes/progress';
import { notificationsRouter } from './routes/notifications';
import { adminRouter } from './routes/admin';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// ---- Global middleware ---------------------------------------------------

app.use(cors());
app.use(express.json());

// ---- Health check (no auth) ---------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ---- API routes ---------------------------------------------------------
// All routes are mounted under /api. Route files declare their own full paths
// (e.g. /me, /quran/pages/:n) relative to this prefix.

app.use('/api', meRouter);
app.use('/api', quranRouter);
app.use('/api', assignmentsRouter);
app.use('/api', submissionsRouter);
app.use('/api', annotationsRouter);
app.use('/api', mediaRouter);
app.use('/api', progressRouter);
app.use('/api', notificationsRouter);
app.use('/api', adminRouter);

// ---- 404 ----------------------------------------------------------------

app.use((_req, res) => {
  res.status(404).json({ error: { message: 'Not found' } });
});

// ---- Error handler (must be last) ---------------------------------------

app.use(errorHandler);

export { app };
