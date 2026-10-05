# Mea AI Tracking

Personal kilojoule/calorie and macro tracker, built as an installable Progressive Web App.
Node + Express + TypeScript API, React (Vite) front end, PostgreSQL. Deployed on Railway.

> **Status:** Phase 1 of 6 — database schema, migrations and the food importer.
> Logging, targets, fasting, history, notifications and the Railway deploy follow in later phases.

## Project layout

```
packages/shared   types and nutrition helpers shared by API and web (kJ↔kcal, scaling)
apps/api          Express API, Drizzle schema + migrations, food import CLI
apps/web          React PWA (phase 2)
data/             drop food database files here (gitignored)
```

## Local setup

Requirements: Node 20+, PostgreSQL 14+ (needs the `pg_trgm` extension, included with standard Postgres and Railway).

```bash
npm install
cp .env.example .env          # then set DATABASE_URL
npm run build -w @mea/shared  # build the shared package once
npm run db:migrate            # create the tables
npm run create-user -- --email you@example.com   # prompts for a password (10+ characters)
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. On Railway use `${{Postgres.DATABASE_URL}}`. |
| `PORT` | no | API port, default 3000. Railway sets it automatically. |
| `SESSION_SECRET` | yes (from phase 2) | Long random string: `openssl rand -hex 32`. |
| `TZ_DEFAULT` | no | Timezone for new users' day boundaries, default `Australia/Sydney`. |
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

### Adding another data source

Each source is an adapter in `apps/api/src/import/sources/`. To add, say, the NZ food database:

1. Create `sources/nzfcd.ts` exporting a `FoodSourceAdapter` (see `adapter.ts`). For a spreadsheet,
   copy `afcd.ts` and change the sheet choice and column patterns.
2. Register it in `sources/index.ts`.
3. Run `npm run import:foods -- --source nzfcd --file data/<file> --inspect`.

If a source gives kcal but not kJ, kJ is calculated automatically, and vice versa.

## Development

```bash
npm run typecheck
npm test                                                  # unit tests
TEST_DATABASE_URL=postgres://… npm test -w @mea/api       # also run DB tests (wipes that database!)
npm run db:generate                                       # create a migration after editing apps/api/src/db/schema.ts
```
