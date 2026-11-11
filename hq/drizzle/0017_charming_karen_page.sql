ALTER TYPE "public"."widget_type" ADD VALUE 'calendar';--> statement-breakpoint
ALTER TYPE "public"."widget_type" ADD VALUE 'team';--> statement-breakpoint
ALTER TYPE "public"."widget_type" ADD VALUE 'changelog';--> statement-breakpoint
ALTER TYPE "public"."widget_type" ADD VALUE 'followups';--> statement-breakpoint
ALTER TYPE "public"."widget_type" ADD VALUE 'notes';--> statement-breakpoint
ALTER TYPE "public"."widget_type" ADD VALUE 'feedback';--> statement-breakpoint
ALTER TYPE "public"."widget_type" ADD VALUE 'ai';--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"ical_url" text,
	"calendar_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"color" text,
	"last_error" text,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_task_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_digest" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_connections_user_idx" ON "calendar_connections" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "widgets_ws_user_idx" ON "dashboard_widgets" USING btree ("workspace_id","user_id");