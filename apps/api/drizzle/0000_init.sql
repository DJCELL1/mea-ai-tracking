-- Trigram matching for fuzzy food search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TYPE "public"."entry_type" AS ENUM('food', 'quick_add', 'copied');--> statement-breakpoint
CREATE TYPE "public"."meal" AS ENUM('breakfast', 'lunch', 'dinner', 'snack');--> statement-breakpoint
CREATE TYPE "public"."recipe_kind" AS ENUM('recipe', 'meal');--> statement-breakpoint
CREATE TABLE "fasting_days" (
	"user_id" integer NOT NULL,
	"date" date NOT NULL,
	"fast_start" timestamp with time zone,
	"fast_end" timestamp with time zone,
	"hours_fasted" double precision,
	"met_goal" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fasting_days_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "food_servings" (
	"id" serial PRIMARY KEY NOT NULL,
	"food_id" integer NOT NULL,
	"label" text NOT NULL,
	"grams" double precision NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"imported" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_sources_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"source_food_id" text,
	"user_id" integer,
	"recipe_id" integer,
	"name" text NOT NULL,
	"description" text,
	"energy_kj" double precision,
	"energy_kcal" double precision,
	"protein_g" double precision,
	"fat_g" double precision,
	"carbs_g" double precision,
	"sugars_g" double precision,
	"fibre_g" double precision,
	"sodium_mg" double precision,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"rows_read" integer DEFAULT 0 NOT NULL,
	"inserted" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "log_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"log_date" date NOT NULL,
	"meal" "meal" NOT NULL,
	"eaten_at" timestamp with time zone DEFAULT now() NOT NULL,
	"food_id" integer,
	"name" text NOT NULL,
	"grams" double precision,
	"serving_id" integer,
	"serving_qty" double precision,
	"energy_kj" double precision,
	"energy_kcal" double precision,
	"protein_g" double precision,
	"fat_g" double precision,
	"carbs_g" double precision,
	"sugars_g" double precision,
	"fibre_g" double precision,
	"sodium_mg" double precision,
	"entry_type" "entry_type" DEFAULT 'food' NOT NULL,
	"outside_window" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications_sent" (
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"date" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_sent_user_id_kind_date_pk" PRIMARY KEY("user_id","kind","date")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "recipe_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" integer NOT NULL,
	"food_id" integer NOT NULL,
	"grams" double precision NOT NULL,
	"meal" "meal"
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" "recipe_kind" NOT NULL,
	"name" text NOT NULL,
	"cooked_weight_g" double precision,
	"servings" double precision DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'Australia/Sydney' NOT NULL,
	"kcal_target" integer DEFAULT 2000 NOT NULL,
	"protein_g_target" integer DEFAULT 150 NOT NULL,
	"carbs_g_target" integer DEFAULT 200 NOT NULL,
	"fat_g_target" integer DEFAULT 65 NOT NULL,
	"close_alert_pct" integer DEFAULT 90 NOT NULL,
	"protein_nudge_time" time DEFAULT '15:00' NOT NULL,
	"protein_nudge_pct" integer DEFAULT 50 NOT NULL,
	"window_start" time DEFAULT '12:00' NOT NULL,
	"window_end" time DEFAULT '20:00' NOT NULL,
	"window_close_warning_min" integer DEFAULT 30 NOT NULL,
	"fasting_goal_hours" double precision DEFAULT 16 NOT NULL,
	"notify_window_open" boolean DEFAULT true NOT NULL,
	"notify_window_closing" boolean DEFAULT true NOT NULL,
	"notify_window_closed" boolean DEFAULT true NOT NULL,
	"notify_protein" boolean DEFAULT true NOT NULL,
	"notify_targets" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "window_overrides" (
	"user_id" integer NOT NULL,
	"date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"is_fast_day" boolean DEFAULT false NOT NULL,
	CONSTRAINT "window_overrides_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
ALTER TABLE "fasting_days" ADD CONSTRAINT "fasting_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_servings" ADD CONSTRAINT "food_servings_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_source_id_food_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."food_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_source_id_food_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."food_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_serving_id_food_servings_id_fk" FOREIGN KEY ("serving_id") REFERENCES "public"."food_servings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications_sent" ADD CONSTRAINT "notifications_sent_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "window_overrides" ADD CONSTRAINT "window_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_servings_food_idx" ON "food_servings" USING btree ("food_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foods_source_food_uq" ON "foods" USING btree ("source_id","source_food_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foods_recipe_uq" ON "foods" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "foods_name_trgm_idx" ON "foods" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "foods_user_idx" ON "foods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "log_entries_user_date_idx" ON "log_entries" USING btree ("user_id","log_date");--> statement-breakpoint
CREATE INDEX "log_entries_user_food_idx" ON "log_entries" USING btree ("user_id","food_id");--> statement-breakpoint
CREATE INDEX "recipe_items_recipe_idx" ON "recipe_items" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");