CREATE TYPE "public"."issue_kind" AS ENUM('crash', 'error');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('unresolved', 'resolved', 'ignored');--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"fingerprint" text NOT NULL,
	"kind" "issue_kind" NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"culprit" text,
	"status" "issue_status" DEFAULT 'unresolved' NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"first_build" text NOT NULL,
	"last_build" text NOT NULL,
	"regressed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "issues_environment_id_fingerprint_unique" UNIQUE("environment_id","fingerprint"),
	CONSTRAINT "issues_environment_id_number_unique" UNIQUE("environment_id","number")
);
--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issues_env_status_seen_idx" ON "issues" USING btree ("environment_id","status","last_seen_at");