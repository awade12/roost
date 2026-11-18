CREATE TABLE "ai_speech" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"model" text NOT NULL,
	"voices" jsonb NOT NULL,
	"format" text DEFAULT 'mp3' NOT NULL,
	"max_chars" integer DEFAULT 500 NOT NULL,
	"instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_speech_game_id_name_unique" UNIQUE("game_id","name")
);
--> statement-breakpoint
ALTER TABLE "ai_speech" ADD CONSTRAINT "ai_speech_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;