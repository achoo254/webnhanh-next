ALTER TABLE "submissions" DROP CONSTRAINT "submissions_kind_check";--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "live_page" jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_kind_check" CHECK ("submissions"."kind" in ('order', 'rsvp'));