# Deploying Mea AI Tracking to Railway

You end up with two services in one Railway project:

- **Postgres:** the database.
- **mea-ai-tracking:** the app. One service runs the API, serves the PWA and sends push
  notifications.

The app runs its database migrations every time it starts, so there's no separate migrate step.
You load the food database and create your login from your own computer, against the live
database.

Allow about 20 minutes. Railway's dashboard changes from time to time, so button names may differ
slightly from the ones below.

---

## 0. Before you start

On your computer:

- [Node.js](https://nodejs.org) 22 or newer.
- This repo cloned, with dependencies installed:
  ```bash
  git clone https://github.com/DJCELL1/mea-ai-tracking.git
  cd mea-ai-tracking
  npm install
  npm run build -w @mea/shared
  ```
- The AFCD file saved as `data/AFCD Release 3 - Nutrient profiles.xlsx`. Optionally also save
  `data/AFCD Release 3 - Food Details.xlsx`, which adds food descriptions.

You also need a Railway account at <https://railway.com> with GitHub connected. Push notifications
and an always-on server need a paid plan (Hobby is enough); check Railway's pricing page for the
current cost.

### Generate your secrets

Run these on your computer and keep the output handy for step 3:

```bash
openssl rand -hex 32        # → SESSION_SECRET
npm run vapid               # → VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
```

On Windows without `openssl`, this does the same job:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## 1. Create the project from GitHub

1. In Railway, click **New Project**, then **Deploy from GitHub repo**.
2. Choose **DJCELL1/mea-ai-tracking**. If it isn't listed, use **Configure GitHub App** to give
   Railway access to the repo.
3. Railway finds `railway.json` and builds with the repo's `Dockerfile`.

The first deploy **will fail**. That's expected, because the database and settings aren't there yet.

## 2. Add Postgres

1. In the project, click **+ Create** (or right-click the canvas), then **Database**, then
   **PostgreSQL**.
2. Wait for it to show as running. The service is called **Postgres**. If you rename it, use the new
   name in step 3.

## 3. Set the app's variables

1. Click the **mea-ai-tracking** service, then **Variables**, then **Raw Editor**.
2. Paste this, filling in the values from step 0:

   ```env
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   NODE_ENV=production
   SESSION_SECRET=paste-the-64-character-hex-string
   TZ_DEFAULT=Australia/Sydney
   VAPID_PUBLIC_KEY=paste-public-key
   VAPID_PRIVATE_KEY=paste-private-key
   VAPID_SUBJECT=mailto:you@example.com
   ```

3. Click **Update Variables**, then **Deploy**.

| Variable | What it's for |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` is a reference to the database's *private* address inside Railway: fast, and never exposed to the internet. Leave it exactly as written. |
| `NODE_ENV` | `production` turns on secure cookies and checks that `SESSION_SECRET` is strong. |
| `SESSION_SECRET` | Protects your login sessions. Changing it logs you out everywhere. |
| `TZ_DEFAULT` | Timezone given to your login when it's first created; you can change it later in Settings. |
| `SETUP_TOKEN` | Optional. Private code for creating your login from the setup screen (step 6, option A). |
| `VAPID_*` | Push notification keys. Without them the app works but sends no notifications. Don't change them later, or every device has to turn notifications on again. |

You don't need to set `PORT`. Railway sets it automatically.

## 4. Give it a web address

1. Open the **mea-ai-tracking** service, then **Settings**, then **Networking**, and click
   **Generate Domain**.
2. If Railway asks which port, enter the number from the deploy log line
   `Mea AI Tracking listening on :NNNN`. That's normally the `PORT` Railway assigned, for example
   8080.
3. You get an address like `https://mea-ai-tracking-production.up.railway.app`. HTTPS is
   automatic, which installing the PWA and push notifications both need.

You can add your own domain in the same place later.

## 5. Check the deploy

Open **Deployments**, then the latest deploy, then **View logs**. You should see:

```
Database migrations up to date.
Mea AI Tracking listening on :8080
Push notification scheduler running.
```

The health check (`/api/health`) should pass and the deploy should show **Active**. Opening the
address shows the login screen.

## 6. Create your login and load the food database

### Option A: from your phone (no installs)

1. On the app service, open **Variables** and add `SETUP_TOKEN`. Give it any long, private value,
   for example the output of `openssl rand -hex 16`. Let it redeploy.
2. Open your Railway address. While no account exists you'll see **Set up Mea**. Enter the setup code
   (your `SETUP_TOKEN` value), your email and a password (10+ characters).
3. Next, **Load the food database**: choose the AFCD **Nutrient profiles** `.xlsx`, and optionally
   the **Food Details** `.xlsx` for descriptions, then tap **Upload and import**. It takes about
   10–30 seconds.

The setup screen closes for good once your account exists, so nobody else can use it. Keep
`SETUP_TOKEN` set if you want **Forgot password?** on the login screen to work: it resets your
password (and email) with the setup code. To load a newer AFCD release later, use **Settings → Food
database → Upload a newer AFCD file**.

### Option B: from your computer

Run these from your computer, against the live database.

1. In Railway, click the **Postgres** service, then **Variables**, and copy
   **`DATABASE_PUBLIC_URL`**. It looks like
   `postgresql://postgres:…@….proxy.rlwy.net:12345/railway`. This is the *public* address, used
   only from your computer. The app itself uses the private one.
2. In the repo folder on your computer:

   **macOS / Linux**
   ```bash
   export DATABASE_URL="paste-DATABASE_PUBLIC_URL-here"

   # Check how the file will be read (writes nothing)
   npm run import:foods -- --source afcd --file "data/AFCD Release 3 - Nutrient profiles.xlsx" --inspect

   # Import (about 1,600 foods, a few seconds)
   npm run import:foods -- --source afcd --file "data/AFCD Release 3 - Nutrient profiles.xlsx"

   # Create your login (asks for a password, at least 10 characters)
   npm run create-user -- --email you@example.com

   unset DATABASE_URL
   ```

   **Windows (PowerShell)**
   ```powershell
   $env:DATABASE_URL = "paste-DATABASE_PUBLIC_URL-here"
   npm run import:foods -- --source afcd --file "data/AFCD Release 3 - Nutrient profiles.xlsx" --inspect
   npm run import:foods -- --source afcd --file "data/AFCD Release 3 - Nutrient profiles.xlsx"
   npm run create-user -- --email you@example.com
   Remove-Item Env:DATABASE_URL
   ```

The app connects to the public address over TLS automatically. If you have a local `.env`, the
`DATABASE_URL` you set in the terminal takes priority over it.

## 7. Put it on your phone

1. Open your Railway address on your phone and log in.
2. Install it:
   - **iPhone (Safari):** tap Share, then **Add to Home Screen**.
   - **Android (Chrome):** tap ⋮, then **Install app**.
3. Open **Mea** from your home screen and go to **Settings**:
   - Set your daily targets, alerts and eating window, then tap **Save settings**.
   - Under **Notifications**, tap **Turn on notifications on this device**. You should get a test
     notification within a few seconds. On iPhone this only works in the home-screen app, on
     iOS 16.4 or later.

---

## Everyday running

- **Updating the app:** push or merge to `main` and Railway rebuilds and redeploys automatically.
  Database changes apply on start.
- **Re-running the food import** (for example a new AFCD release): repeat step 6 with the new file.
  Foods are updated in place, never duplicated, and past log entries are untouched.
- **Forgot or changing your password:** on the login screen tap **Forgot password?** and use your
  `SETUP_TOKEN` code. Or run `npm run create-user` again with the same email (step 6, option B).
- **Keep one replica.** The notification scheduler and the failed-login limiter run inside the app,
  so don't scale the service above one instance. Duplicate notifications are prevented regardless.
- **Backups:**
  - Check the **Backups** tab on the Postgres service; availability depends on your plan.
  - The app's **History, then Export** gives CSVs of your log.
  - For a full copy, run this from your computer:
    `pg_dump "DATABASE_PUBLIC_URL" > mea-backup.sql` (needs the Postgres client tools).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Deploy log: `Missing required env var DATABASE_URL` or `SESSION_SECRET` | Step 3: check the variables are on the **app** service (not Postgres), then redeploy. |
| Deploy log: `SESSION_SECRET must be at least 32 random characters` | Use the 64-character string from `openssl rand -hex 32`. |
| `getaddrinfo ENOTFOUND postgres.railway.internal` | `DATABASE_URL` must be `${{Postgres.DATABASE_URL}}`, and both services must be in the same project. If you renamed the database service, use its new name. Restarting the app after a Postgres restart can also help. |
| Health check fails / deploy never goes Active | Open the deploy logs. The app prints the reason before exiting. |
| Import or create-user: `connection refused` / timeout | Use **`DATABASE_PUBLIC_URL`** (the `proxy.rlwy.net` one), not the internal URL. |
| Login works but you get logged out | Make sure `NODE_ENV=production` and you're using the `https://` address. |
| No notifications | Check the `VAPID_*` variables are set (Settings shows a message if they aren't). On iPhone, use the home-screen app on iOS 16.4+. Check the switches under Settings → Notifications. Use **Send a test**. |
| `Push notifications off: set VAPID_PUBLIC_KEY…` in the logs | Add the `VAPID_*` variables (step 3) and redeploy. |
| `Push notifications off: Vapid …` in the logs | A `VAPID_*` value is wrong: check the keys were pasted whole, and `VAPID_SUBJECT` starts with `mailto:`. The rest of the app keeps working. |
