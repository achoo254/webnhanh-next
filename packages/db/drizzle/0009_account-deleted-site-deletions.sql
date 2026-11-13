ALTER TABLE "site_deletions" DROP CONSTRAINT "site_deletions_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "site_deletions" ALTER COLUMN "account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "site_deletions" ADD CONSTRAINT "site_deletions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;