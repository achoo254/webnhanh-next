CREATE TABLE "developer_sites" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"repo_url" text,
	"branch" text,
	"settings" jsonb NOT NULL,
	"detection" jsonb,
	"webhook_secret" text,
	"last_build_key" text,
	"pending_push_at" timestamp with time zone,
	"pending_commit" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "developer_sites_source_check" CHECK ("developer_sites"."source" in ('git', 'zip'))
);
--> statement-breakpoint
CREATE TABLE "job_logs" (
	"job_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"line" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "job_logs_job_id_seq_pk" PRIMARY KEY("job_id","seq")
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ALTER COLUMN "submission_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "trigger" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "commit_sha" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "framework" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "notify" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "progress" jsonb;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "error_lines" jsonb;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "report" jsonb;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "developer_sites" ADD CONSTRAINT "developer_sites_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_logs" ADD CONSTRAINT "job_logs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "developer_sites_pending_idx" ON "developer_sites" USING btree ("pending_push_at") WHERE "developer_sites"."pending_push_at" is not null;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_job_idx" ON "notification_deliveries" USING btree ("job_id");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_trigger_check" CHECK ("jobs"."trigger" is null or "jobs"."trigger" in ('manual', 'push', 'rename'));--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_subject_check" CHECK (("notification_deliveries"."submission_id" is null) <> ("notification_deliveries"."job_id" is null));