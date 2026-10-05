import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

// Load the repo-root .env when running locally; Railway injects real env vars.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
config({ quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return value;
}

export const env = {
  get databaseUrl() {
    return required('DATABASE_URL');
  },
  get sessionSecret() {
    const s = required('SESSION_SECRET');
    if (env.isProd && (s.length < 32 || s === 'change-me')) throw new Error('SESSION_SECRET must be at least 32 random characters');
    return s;
  },
  port: Number(process.env.PORT ?? 3000),
  tzDefault: process.env.TZ_DEFAULT ?? 'Australia/Sydney',
  isProd: process.env.NODE_ENV === 'production',
  /** Web push (VAPID) keys: generate with `npm run vapid`. Push is off when unset. */
  get vapidPublicKey() {
    return process.env.VAPID_PUBLIC_KEY ?? '';
  },
  get vapidPrivateKey() {
    return process.env.VAPID_PRIVATE_KEY ?? '';
  },
  get vapidSubject() {
    return process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com';
  },
  /** Private code needed to create the first login from the setup screen. */
  get setupToken() {
    return process.env.SETUP_TOKEN?.trim() ?? '';
  },
  /** Built PWA to serve; defaults to apps/web/dist. */
  webDist: process.env.WEB_DIST ?? fileURLToPath(new URL('../../web/dist', import.meta.url)),
};
