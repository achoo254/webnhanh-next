CREATE TABLE "site_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"widths" jsonb NOT NULL,
	"bytes" integer NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_name_holds" (
	"name" text PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"held_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "template" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "draft" jsonb;--> statement-breakpoint
ALTER TABLE "site_images" ADD CONSTRAINT "site_images_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_name_holds" ADD CONSTRAINT "site_name_holds_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_images_site_idx" ON "site_images" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE INDEX "site_name_holds_site_idx" ON "site_name_holds" USING btree ("site_id");