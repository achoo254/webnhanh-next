CREATE TABLE "abuse_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid,
	"site_name" text NOT NULL,
	"category" text NOT NULL,
	"details" text NOT NULL,
	"contact" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"handled_at" timestamp with time zone,
	CONSTRAINT "abuse_reports_category_check" CHECK ("abuse_reports"."category" in ('scam', 'malware', 'illegal', 'spam', 'copyright', 'other')),
	CONSTRAINT "abuse_reports_status_check" CHECK ("abuse_reports"."status" in ('open', 'resolved', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "admin_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_account_id" uuid,
	"action" text NOT NULL,
	"site_id" uuid,
	"site_name" text,
	"account_id" uuid,
	"report_id" uuid,
	"note" text,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "admin_actions_action_check" CHECK ("admin_actions"."action" in ('takedown', 'restore', 'approve', 'reject', 'lock', 'unlock', 'resolve', 'dismiss')),
	CONSTRAINT "admin_actions_status_check" CHECK ("admin_actions"."status" in ('queued', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP CONSTRAINT "notification_deliveries_subject_check";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "report_id" uuid;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "review_site_id" uuid;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "pending_release_id" uuid;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "pending_review" jsonb;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "taken_down_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "takedown_release_id" uuid;--> statement-breakpoint
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_account_id_accounts_id_fk" FOREIGN KEY ("admin_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_report_id_abuse_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."abuse_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abuse_reports_status_idx" ON "abuse_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "abuse_reports_site_idx" ON "abuse_reports" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "admin_actions_created_idx" ON "admin_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_actions_queue_idx" ON "admin_actions" USING btree ("created_at") WHERE "admin_actions"."status" = 'queued';--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_report_id_abuse_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."abuse_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_review_site_id_sites_id_fk" FOREIGN KEY ("review_site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sites_pending_review_idx" ON "sites" USING btree ("status") WHERE "sites"."status" = 'pending-review';--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_subject_check" CHECK (num_nonnulls("notification_deliveries"."submission_id", "notification_deliveries"."job_id", "notification_deliveries"."report_id", "notification_deliveries"."review_site_id") = 1);