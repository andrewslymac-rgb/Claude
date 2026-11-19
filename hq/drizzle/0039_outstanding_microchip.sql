ALTER TABLE "meetings" ADD COLUMN "platform" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "transcript" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "added_by_id" uuid;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;