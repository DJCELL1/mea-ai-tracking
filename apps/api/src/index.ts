import { createApp } from './app.js';
import { createDb, createPool } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { env } from './env.js';

const pool = createPool();
const db = createDb(pool);

await runMigrations(db);

const app = createApp({ db, session: { secret: env.sessionSecret, secureCookies: env.isProd }, webDist: env.webDist });
const server = app.listen(env.port, () => console.log(`Mea AI Tracking listening on :${env.port}`));

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => void pool.end().then(() => process.exit(0)));
  });
}
