CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "accounts_sub_unique" UNIQUE("sub")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"release_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "jobs_type_check" CHECK ("jobs"."type" in ('publish', 'build')),
	CONSTRAINT "jobs_status_check" CHECK ("jobs"."status" in ('queued', 'running', 'done', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"source" text NOT NULL,
	"commit_sha" text,
	"bytes" integer NOT NULL,
	"file_count" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "releases_source_check" CHECK ("releases"."source" in ('template', 'git', 'zip'))
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"current_release_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sites_name_unique" UNIQUE("name"),
	CONSTRAINT "sites_kind_check" CHECK ("sites"."kind" in ('template', 'developer')),
	CONSTRAINT "sites_status_check" CHECK ("sites"."status" in ('draft', 'published', 'pending-review', 'removed'))
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_queue_idx" ON "jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "jobs_site_idx" ON "jobs" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_one_active_per_account" ON "jobs" USING btree ("account_id") WHERE "jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "releases_site_idx" ON "releases" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE INDEX "sites_account_idx" ON "sites" USING btree ("account_id");