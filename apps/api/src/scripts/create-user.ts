/**
 * Create (or reset the password of) the app's login.
 *   npm run create-user -- --email you@example.com
 * The password is prompted for, or read from CREATE_USER_PASSWORD (handy on Railway).
 */
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { createDb, createPool } from '../db/client.js';
import { settings, users } from '../db/schema.js';
import { env } from '../env.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../auth/password.js';

function promptHidden(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

const { values } = parseArgs({ options: { email: { type: 'string' } } });
if (!values.email) {
  console.error('Usage: npm run create-user -- --email you@example.com');
  process.exit(1);
}
const email = values.email.trim().toLowerCase();
const password = process.env.CREATE_USER_PASSWORD ?? (await promptHidden('Password: '));
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}

const pool = createPool();
try {
  const db = createDb(pool);
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash } })
    .returning({ id: users.id, createdAt: users.createdAt });
  await db.insert(settings).values({ userId: user.id, timezone: env.tzDefault }).onConflictDoNothing();
  console.log(`Saved login for ${email} (user ${user.id}).`);
} finally {
  await pool.end();
}
