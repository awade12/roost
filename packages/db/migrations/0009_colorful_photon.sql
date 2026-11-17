CREATE TYPE "public"."flag_type" AS ENUM('boolean', 'string', 'number', 'json');--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment_id" uuid NOT NULL,
	"key" text NOT NULL,
	"type" "flag_type" NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"value" jsonb NOT NULL,
	"rollout" jsonb,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flags_environment_id_key_unique" UNIQUE("environment_id","key")
);
--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;