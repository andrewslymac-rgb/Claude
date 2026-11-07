ALTER TYPE "public"."widget_type" ADD VALUE 'tools';--> statement-breakpoint
ALTER TYPE "public"."widget_type" ADD VALUE 'stats';--> statement-breakpoint
ALTER TYPE "public"."widget_type" ADD VALUE 'jobber';--> statement-breakpoint
ALTER TYPE "public"."widget_type" ADD VALUE 'collections';--> statement-breakpoint
ALTER TYPE "public"."widget_type" ADD VALUE 'flags';--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"account_name" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"connected_by_id" uuid,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drive_connections" DROP CONSTRAINT "drive_connections_pkey";--> statement-breakpoint
ALTER TABLE "drive_connections" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "drive_connections" ADD COLUMN "label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "drive_connections" ADD COLUMN "icon" text DEFAULT '📁' NOT NULL;--> statement-breakpoint
ALTER TABLE "drive_connections" ADD COLUMN "kind" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "drive_connections" ADD COLUMN "folder_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "drive_connections" ADD COLUMN "folder_names" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "drive_connections" ADD COLUMN "position" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "drive_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_connected_by_id_users_id_fk" FOREIGN KEY ("connected_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_ws_provider_idx" ON "integrations" USING btree ("workspace_id","provider");--> statement-breakpoint
CREATE INDEX "drive_connections_ws_idx" ON "drive_connections" USING btree ("workspace_id");--> statement-breakpoint
UPDATE "drive_connections" SET "label" = COALESCE(NULLIF("folder_name", ''), 'Google Drive'), "kind" = 'sop', "folder_ids" = to_jsonb(ARRAY["folder_id"]), "folder_names" = to_jsonb(ARRAY["folder_name"]);--> statement-breakpoint
UPDATE "pages" p SET "drive_connection_id" = c."id" FROM "drive_connections" c WHERE p."workspace_id" = c."workspace_id" AND p."source" = 'gdrive';--> statement-breakpoint
ALTER TABLE "drive_connections" DROP COLUMN "folder_id";--> statement-breakpoint
ALTER TABLE "drive_connections" DROP COLUMN "folder_name";