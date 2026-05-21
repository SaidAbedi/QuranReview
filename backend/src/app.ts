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

// ---- Auth callback (Supabase email confirmation redirect) ---------------
// Supabase redirects here after the user clicks the confirmation link.
// Tokens are in the URL fragment (#access_token=...) — not accessible
// server-side — so we serve a page that deep-links into the app via JS.

app.get('/auth/callback', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QuranReview — Email Confirmed</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         background:#F8F9FA;display:flex;align-items:center;
         justify-content:center;min-height:100vh;padding:20px}
    .card{background:#fff;border-radius:16px;padding:32px;max-width:380px;
          width:100%;text-align:center;border:1px solid #E5E7EB}
    h1{font-size:22px;font-weight:700;color:#1B4F72;margin-bottom:12px}
    p{font-size:15px;color:#6B7280;line-height:1.6;margin-bottom:24px}
    .btn{display:inline-block;background:#1B4F72;color:#fff;padding:14px 28px;
         border-radius:10px;text-decoration:none;font-weight:600;font-size:16px}
    .note{font-size:12px;color:#9CA3AF;margin-top:16px}
  </style>
</head>
<body>
  <div class="card">
    <h1>Email Confirmed</h1>
    <p>Your QuranReview account is now active.<br>
       Open the app and sign in with your email and password.</p>
    <a class="btn" id="openBtn" href="quran-review://">Open QuranReview</a>
    <p class="note">If the button does not open the app, open QuranReview manually and tap Sign In.</p>
  </div>
  <script>
    // If Supabase passed tokens in the URL fragment, forward them into the app
    // so the session can be established without a second sign-in.
    var hash = window.location.hash;
    if (hash && hash.length > 1) {
      document.getElementById('openBtn').href = 'quran-review://auth/callback' + hash;
      window.location.href = 'quran-review://auth/callback' + hash;
    }
  </script>
</body>
</html>`);
});

// ---- 404 ----------------------------------------------------------------

app.use((_req, res) => {
  res.status(404).json({ error: { message: 'Not found' } });
});

// ---- Error handler (must be last) ---------------------------------------

app.use(errorHandler);

export { app };
