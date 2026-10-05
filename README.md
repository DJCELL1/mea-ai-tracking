# Mea AI Tracking

Personal kilojoule/calorie and macro tracker, built as an installable Progressive Web App.
Node + Express + TypeScript API, React (Vite) front end, PostgreSQL. Deployed on Railway.

> **Status:** All 6 phases done: food database import, login, search and logging, custom foods and
> recipes, targets and alerts, fasting window, history and charts, CSV export, push notifications,
> and Railway deployment. **To deploy, follow [DEPLOY.md](DEPLOY.md).**

## Project layout

```
packages/shared   types and nutrition helpers shared by API and web (kJ↔kcal, scaling)
apps/api          Express API, Drizzle schema + migrations, food import CLI
apps/web          React PWA (Vite), served by the API in production
data/             drop food database files here (gitignored)
```

## Local setup

Requirements: Node 20+, PostgreSQL 14+ (needs the `pg_trgm` extension, included with standard Postgres and Railway).

```bash
npm install
cp .env.example .env          # then set DATABASE_URL
npm run build -w @mea/shared  # build the shared package once
npm run db:migrate            # create the tables
npm run import:foods -- --source afcd --file "data/AFCD Release 3 - Nutrient profiles.xlsx"
npm run create-user -- --email you@example.com   # prompts for a password (10+ characters)
```

### Running it

```bash
npm run dev      # API on :3000 (auto-reload) + web on http://localhost:5173 (proxies /api)
```

Production-style (what Railway runs):

```bash
npm run build    # shared → web → api
npm start        # runs migrations, then serves the API and the built PWA on $PORT
```

## Deploying

Railway setup, step by step (project, Postgres, variables, domain, loading the food database and
creating your login), is in **[DEPLOY.md](DEPLOY.md)**. In short: the repo's `Dockerfile` and
`railway.json` build one service that runs migrations on start, serves the API and the PWA, and
sends push notifications; health check at `/api/health`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. On Railway use `${{Postgres.DATABASE_URL}}`. |
| `PORT` | no | API port, default 3000. Railway sets it automatically. |
| `SESSION_SECRET` | yes | Long random string used to protect login sessions: `openssl rand -hex 32`. |
| `NODE_ENV` | prod | Set to `production` on Railway (secure cookies, stricter checks). |
| `TZ_DEFAULT` | no | Timezone for new users' day boundaries, default `Australia/Sydney`. |
| `VAPID_PUBLIC_KEY` | for push | Web push public key. Generate a pair with `npm run vapid`. Push is off when unset. |
| `VAPID_PRIVATE_KEY` | for push | Web push private key (keep secret). |
| `VAPID_SUBJECT` | for push | Contact for push services, e.g. `mailto:you@example.com`. |
| `SETUP_TOKEN` | no | Private code that lets you create the first login from the in-app setup screen. The screen only works while no account exists. |
| `CREATE_USER_PASSWORD` | no | Lets `create-user` run without a prompt (e.g. in a Railway shell). |

## Food import

Foods are stored per 100 g with energy in both kJ and kcal (kcal = kJ ÷ 4.184).
Blank values in the source stay empty (not measured) rather than becoming 0.

### AFCD (Food Standards Australia New Zealand)

1. Download the AFCD Excel files from
   <https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd>.
2. Save **Nutrient profiles** in `data/`, e.g. `data/AFCD Release 3 - Nutrient profiles.xlsx`.
   Optionally also save **Food Details** in the same folder; its food descriptions are picked up automatically.
   (The Recipes and Nutrient details files aren't needed.)
3. Check how the file will be read. This prints the sheets, header row, column mapping and sample rows, and writes nothing:

   ```bash
   npm run import:foods -- --source afcd --file "data/AFCD Release 3 - Nutrient profiles.xlsx" --inspect
   ```

4. Optionally validate every row without writing:

   ```bash
   npm run import:foods -- --source afcd --file "data/AFCD Release 3 - Nutrient profiles.xlsx" --dry-run
   ```

5. Import:

   ```bash
   npm run import:foods -- --source afcd --file "data/AFCD Release 3 - Nutrient profiles.xlsx"
   ```

**Re-running the import** (e.g. for a new AFCD release) is safe. Foods are matched on the AFCD
Public Food Key and updated in place, so there are no duplicates. Foods missing from the new file
are kept, so past log entries still work. Each run is recorded in the `import_runs` table.

Column mapping used for AFCD, confirmed against Release 3 (sheet "All solids & liquids per 100 g", 1,588 foods):

| foods column | AFCD column |
|---|---|
| `source_food_id` | Public Food Key |
| `name` | Food Name |
| `description` | Food Description (from the Food Details file, if present) |
| `energy_kj` | Energy with dietary fibre, equated (kJ) |
| `energy_kcal` | calculated from `energy_kj` ÷ 4.184 |
| `protein_g` | Protein (g) |
| `fat_g` | Fat, total (g) |
| `carbs_g` | Available carbohydrate, with sugar alcohols (g) |
| `sugars_g` | Total sugars (g) |
| `fibre_g` | Total dietary fibre (g) |
| `sodium_mg` | Sodium (Na) (mg) |

### MyFoodData (US foods, optional)

The MyFoodData spreadsheet adds about 14,000 US foods (USDA SR Legacy and FNDDS), including
US brands, with serving sizes.

```bash
npm run import:foods -- --source myfooddata --file "data/MyFoodData Nutrition Facts Release 1.4.xlsx" --inspect
npm run import:foods -- --source myfooddata --file "data/MyFoodData Nutrition Facts Release 1.4.xlsx"
```

| foods column | MyFoodData column |
|---|---|
| `source_food_id` | ID |
| `name` | name |
| `description` | Food Group |
| `energy_kcal` | Calories |
| `energy_kj` | calculated from `energy_kcal` × 4.184 |
| `protein_g` | Protein (g) |
| `fat_g` | Fat (g) |
| `carbs_g` | Net-Carbs (g), i.e. carbohydrate − fibre (falls back to calculating it) |
| `sugars_g` | Sugars (g) |
| `fibre_g` | Fiber (g) |
| `sodium_mg` | Sodium (mg) |
| `food_servings` | Serving Weight / Serving Description 1–9 |

US "carbohydrate" includes fibre while Australian "available carbohydrate" doesn't, so net carbs
are stored to keep carbs comparable between sources. Re-importing replaces imported serving sizes
but never ones you've added yourself.

### Uploading from the app

Once logged in, **Settings → Food database** lets you upload the AFCD Nutrient profiles file
(plus Food Details for descriptions) from your phone. It runs the same import as the command above.
On a brand-new install, the app offers this straight after you create your login.

### Adding another data source

Each source is an adapter in `apps/api/src/import/sources/`. To add, say, the NZ food database:

1. Create `sources/nzfcd.ts` exporting a `FoodSourceAdapter` (see `adapter.ts`). For a spreadsheet,
   copy `afcd.ts` and change the sheet choice and column patterns.
2. Register it in `sources/index.ts`.
3. Run `npm run import:foods -- --source nzfcd --file data/<file> --inspect`.

If a source gives kcal but not kJ, kJ is calculated automatically, and vice versa.

## What's in the app so far

- **Login:** email and password, 90-day sessions that refresh while you use the app. Repeated
  failed logins are temporarily blocked.
- **Today:** day totals (kcal and kJ, protein, carbs, fat), entries grouped by meal, previous/next day.
  Tap an entry to change the amount, serving or meal, or delete it.
- **Add food:** fuzzy search that copes with typos, with your recent and most-logged foods shown
  before you type. Log by grams or by serving. Also **Quick add** (kcal or kJ plus optional macros)
  and **Meals** (log a saved meal in one tap, or a portion of a recipe).
- **Copy a day:** the whole day or single meals, from any date.
- **Targets and alerts:** set daily kcal, protein, carbs and fat targets in Settings. Today shows
  progress rings with the amount left (kJ alongside kcal). Banners warn at 90% of your energy
  target (configurable), flag any target you go over, and nudge you after 3 pm (configurable) if
  you're under 50% of your protein target, suggesting high-protein foods you often eat with your
  usual amounts (or everyday Australian staples until you have history). Banners can be
  dismissed for the day.
- **Fasting window:** set your everyday eating window in Settings (e.g. 12 pm–8 pm) and change any
  single day, or make it a fast day, on the Fasting screen. Today shows **FASTING** or **EATING** with
  a countdown to when the window opens or closes, and warns when it's about to close (30 min by
  default). Food logged outside the window is allowed but flagged. The Fasting screen shows hours
  fasted per day (last food → first food the next day) against your goal (16 h by default), your
  current and longest streak, and your average. Windows run within one day (opening before closing).
- **History:** week view (energy per day against your target, macro averages) and 30/90-day trends
  for energy, protein, carbs, fat and hours fasted, each with a 7-day average. Tap a bar or slide
  along a line to read values; every number is also in the daily table (tap a day to open it).
  Past days are compared with your current targets.
- **CSV export:** every entry, or daily totals with targets and hours fasted, for the selected range
  or the last 12 months. Opens in Excel, Numbers or Google Sheets.
- **Push notifications:** eating window opens, closing soon, and closed; the protein nudge (with a
  food idea); and getting close to / going over targets. Each is sent at most once a day and can be
  switched off in Settings. Turn them on per device in Settings → Notifications.
  - **iPhone:** works only from the installed app on iOS 16.4 or later (Safari → Share → Add to Home
    Screen, then open Mea from the home screen and turn notifications on there).
  - **Android:** works in Chrome, installed or not.
  - The server checks once a minute, so notifications can arrive up to about a minute late.
- **My foods:** add foods from a nutrition label (per serve or per 100 g, kJ or kcal); build
  **recipes** (logged by portion, searchable like any food) and **saved meals** (logged as
  separate items in one tap).
- **PWA:** installable from Safari ("Add to Home Screen") or Chrome ("Install app"). The app opens
  offline and shows the last-loaded data for today and recently viewed days; logging needs a connection.

## Development

```bash
npm run typecheck
npm test                                                  # unit tests
TEST_DATABASE_URL=postgres://… npm test -w @mea/api       # also run DB and API tests (wipes that database!)
npm run db:generate                                       # create a migration after editing apps/api/src/db/schema.ts
npm run vapid                                             # print a new pair of web push keys
```
