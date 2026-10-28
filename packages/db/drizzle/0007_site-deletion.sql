CREATE TABLE "site_deletions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"names" jsonb NOT NULL,
	"build_ms" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "site_deletions_status_check" CHECK ("site_deletions"."status" in ('queued', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "site_name_holds" DROP CONSTRAINT "site_name_holds_site_id_sites_id_fk";
--> statement-breakpoint
ALTER TABLE "site_name_holds" ALTER COLUMN "site_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "site_deletions" ADD CONSTRAINT "site_deletions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_deletions_queue_idx" ON "site_deletions" USING btree ("created_at") WHERE "site_deletions"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "site_deletions_account_idx" ON "site_deletions" USING btree ("account_id","created_at");--> statement-breakpoint
ALTER TABLE "site_name_holds" ADD CONSTRAINT "site_name_holds_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;