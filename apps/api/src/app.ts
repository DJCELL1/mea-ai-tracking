import cookieParser from 'cookie-parser';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Db } from './db/client.js';
import { errorHandler, notFound } from './http.js';
import { loadSession, requireAuth, requireCustomHeader, type SessionConfig } from './auth/session.js';
import { authRouter } from './routes/auth.js';
import { fastingRouter } from './routes/fasting.js';
import { foodsRouter } from './routes/foods.js';
import { logRouter } from './routes/log.js';
import { recipesRouter } from './routes/recipes.js';
import { settingsRouter } from './routes/settings.js';

export interface AppOptions {
  db: Db;
  session: SessionConfig;
  /** Directory of the built PWA to serve; skipped if missing. */
  webDist?: string;
}

export function createApp({ db, session, webDist }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Railway terminates TLS in front of the app

  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
    });
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));
  api.use(cookieParser());
  api.use(requireCustomHeader);
  api.use(loadSession(db, session));
  api.use('/auth', authRouter(db, session));
  api.use(requireAuth);
  api.use(foodsRouter(db));
  api.use(logRouter(db));
  api.use(recipesRouter(db));
  api.use(settingsRouter(db));
  api.use(fastingRouter(db));
  api.use((_req, _res, next) => next(notFound()));
  app.use('/api', api);

  if (webDist && existsSync(webDist)) {
    app.use(
      express.static(webDist, {
        index: false,
        setHeaders: (res, file) => {
          // The service worker and manifest must update promptly; hashed assets can cache forever
          if (/sw\.js$|manifest\.webmanifest$|index\.html$/.test(file)) res.set('Cache-Control', 'no-cache');
          else if (file.includes(`${path.sep}assets${path.sep}`)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    // SPA fallback
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.set('Cache-Control', 'no-cache').sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
