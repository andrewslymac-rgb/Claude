ALTER TYPE "public"."widget_type" ADD VALUE 'tracker';--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "due_override" date;
