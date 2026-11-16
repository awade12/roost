CREATE TABLE "ai_settings" (
	"game_id" uuid PRIMARY KEY NOT NULL,
	"monthly_cap_cents" integer DEFAULT 5000 NOT NULL,
	"player_daily_tokens" integer DEFAULT 20000 NOT NULL,
	"player_per_minute" integer DEFAULT 10 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"model" text NOT NULL,
	"fallback_models" text[] DEFAULT '{}' NOT NULL,
	"system_prompt" text NOT NULL,
	"user_template" text NOT NULL,
	"max_tokens" integer DEFAULT 500 NOT NULL,
	"temperature" real DEFAULT 0.7 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_templates_game_id_name_unique" UNIQUE("game_id","name")
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_templates" ADD CONSTRAINT "ai_templates_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;