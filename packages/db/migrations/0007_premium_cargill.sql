CREATE TYPE "public"."report_category" AS ENUM('bug', 'feedback', 'crash', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "player_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"environment_id" uuid NOT NULL,
	"player_id" text NOT NULL,
	"session_id" text,
	"category" "report_category" NOT NULL,
	"message" text NOT NULL,
	"email" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"build" text NOT NULL,
	"platform" text NOT NULL,
	"os_version" text,
	"device_model" text,
	"tags" jsonb NOT NULL,
	"contexts" jsonb NOT NULL,
	"extra" jsonb NOT NULL,
	"breadcrumbs" jsonb NOT NULL,
	"attachment_count" integer DEFAULT 0 NOT NULL,
	"issue_id" uuid,
	"reported_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_reports" ADD CONSTRAINT "player_reports_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_reports" ADD CONSTRAINT "player_reports_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_reports_env_status_idx" ON "player_reports" USING btree ("environment_id","status","received_at");