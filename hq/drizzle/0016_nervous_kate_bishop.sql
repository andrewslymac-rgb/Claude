ALTER TABLE "drive_connections" ADD COLUMN "two_way" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "drive_mime_type" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "drive_push_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "drive_conflict" boolean DEFAULT false NOT NULL;