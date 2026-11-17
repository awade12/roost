CREATE TYPE "public"."debug_file_kind" AS ENUM('breakpad', 'sourcemap');--> statement-breakpoint
CREATE TYPE "public"."pending_crash_kind" AS ENUM('native', 'js');--> statement-breakpoint
CREATE TYPE "public"."pending_crash_status" AS ENUM('waiting', 'ready', 'processing', 'failed');--> statement-breakpoint
CREATE TABLE "debug_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"kind" "debug_file_kind" NOT NULL,
	"name" text NOT NULL,
	"debug_id" text DEFAULT '' NOT NULL,
	"build" text DEFAULT '' NOT NULL,
	"storage_key" text NOT NULL,
	"size" bigint NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debug_files_game_id_kind_name_debug_id_build_unique" UNIQUE("game_id","kind","name","debug_id","build")
);
--> statement-breakpoint
CREATE TABLE "pending_crashes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"environment_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"kind" "pending_crash_kind" NOT NULL,
	"payload" jsonb NOT NULL,
	"dump_key" text,
	"status" "pending_crash_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debug_files" ADD CONSTRAINT "debug_files_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_crashes" ADD CONSTRAINT "pending_crashes_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debug_files_game_build_idx" ON "debug_files" USING btree ("game_id","kind","build");--> statement-breakpoint
CREATE INDEX "pending_crashes_status_idx" ON "pending_crashes" USING btree ("status","created_at");