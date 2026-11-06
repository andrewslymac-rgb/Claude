CREATE TABLE "drive_connections" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"folder_id" text NOT NULL,
	"folder_name" text DEFAULT '' NOT NULL,
	"root_page_id" uuid,
	"exclude_folder_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" text,
	"last_sync_counts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drive_connections" ADD CONSTRAINT "drive_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_connections" ADD CONSTRAINT "drive_connections_root_page_id_pages_id_fk" FOREIGN KEY ("root_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;