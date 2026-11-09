CREATE TABLE "member_roles" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "member_roles_workspace_id_user_id_role_id_pk" PRIMARY KEY("workspace_id","user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"emoji" text DEFAULT '🧑‍💼' NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "role_id" uuid;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_role_id_workspace_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."workspace_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_roles" ADD CONSTRAINT "workspace_roles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_roles_name_idx" ON "workspace_roles" USING btree ("workspace_id","name");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_role_id_workspace_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."workspace_roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "workspace_roles" ("workspace_id","name","emoji","position")
SELECT DISTINCT t."workspace_id", trim(t."owner_role"), '🧑‍💼', 1 FROM "tasks" t WHERE t."owner_role" IS NOT NULL AND trim(t."owner_role") <> '' ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "tasks" t SET "role_id" = r."id" FROM "workspace_roles" r WHERE t."role_id" IS NULL AND t."owner_role" IS NOT NULL AND r."workspace_id" = t."workspace_id" AND lower(r."name") = lower(trim(t."owner_role"));
