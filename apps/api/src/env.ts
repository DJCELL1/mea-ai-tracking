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
  port: Number(process.env.PORT ?? 3000),
  tzDefault: process.env.TZ_DEFAULT ?? 'Australia/Sydney',
};
