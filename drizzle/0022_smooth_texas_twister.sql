CREATE TABLE "dash_unlocks" (
	"session_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"unlocked_until" timestamp with time zone NOT NULL,
	CONSTRAINT "dash_unlocks_session_id_workspace_id_pk" PRIMARY KEY("session_id","workspace_id")
);
--> statement-breakpoint
CREATE TABLE "task_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"mime_type" text,
	"size" integer DEFAULT 0 NOT NULL,
	"data" "bytea",
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dash_unlocks" ADD CONSTRAINT "dash_unlocks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dash_unlocks" ADD CONSTRAINT "dash_unlocks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_files" ADD CONSTRAINT "task_files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_files" ADD CONSTRAINT "task_files_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_files" ADD CONSTRAINT "task_files_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_files_task_idx" ON "task_files" USING btree ("task_id");