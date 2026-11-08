ALTER TABLE "workspaces" ADD COLUMN "field_tool" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
UPDATE "workspaces" SET "field_tool" = 'jobber' WHERE "slug" = 'lemon-and-lavender';--> statement-breakpoint
UPDATE "workspaces" SET "field_tool" = 'gorilladesk' WHERE "slug" = 'adapt-pest-pros';--> statement-breakpoint
DELETE FROM "dashboard_widgets" WHERE "type" = 'jobber' AND "workspace_id" IN (SELECT "id" FROM "workspaces" WHERE "field_tool" = 'none');
--> statement-breakpoint
UPDATE "dashboard_widgets" SET "title" = 'Today in the field' WHERE "type" = 'jobber' AND "title" = 'Jobber today';
