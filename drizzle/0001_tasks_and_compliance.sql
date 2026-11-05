CREATE TYPE "public"."doc_status" AS ENUM('active', 'needs_review', 'draft', 'outdated', 'archived');--> statement-breakpoint
CREATE TYPE "public"."flag_severity" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."flag_status" AS ENUM('open', 'in_progress', 'resolved', 'wont_fix');--> statement-breakpoint
CREATE TYPE "public"."flag_type" AS ENUM('contradiction', 'duplicate', 'missing_document', 'outdated', 'incomplete', 'open_decision', 'compliance_risk', 'naming_mismatch');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('once', 'daily', 'weekly', 'monthly', 'quarterly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."review_cycle" AS ENUM('quarterly', 'semiannual', 'annual');--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" "flag_type" DEFAULT 'open_decision' NOT NULL,
	"severity" "flag_severity" DEFAULT 'medium' NOT NULL,
	"status" "flag_status" DEFAULT 'open' NOT NULL,
	"who_decides" text,
	"what_we_found" text DEFAULT '' NOT NULL,
	"next_step" text DEFAULT '' NOT NULL,
	"page_id" uuid,
	"owner_id" uuid,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "task_assignees" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "task_assignees_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "task_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"done_on" date NOT NULL,
	"done_by_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"frequency" "frequency" DEFAULT 'once' NOT NULL,
	"when_text" text,
	"instructions" text DEFAULT '' NOT NULL,
	"owner_role" text,
	"sop_page_id" uuid,
	"due_on" date,
	"last_done_on" date,
	"next_due_on" date,
	"archived_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_versions" ADD COLUMN "why" text;--> statement-breakpoint
ALTER TABLE "page_versions" ADD COLUMN "team_told" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "doc_type" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "area" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "audience" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "doc_status" "doc_status";--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "review_cycle" "review_cycle";--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "last_reviewed_on" date;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "last_reviewed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "source_link" text;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "sensitive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "doc_version" text;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_done_by_id_users_id_fk" FOREIGN KEY ("done_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sop_page_id_pages_id_fk" FOREIGN KEY ("sop_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flags_ws_idx" ON "flags" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "task_completions_task_idx" ON "task_completions" USING btree ("task_id","done_on");--> statement-breakpoint
CREATE INDEX "tasks_ws_idx" ON "tasks" USING btree ("workspace_id","frequency");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("workspace_id","next_due_on");--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_last_reviewed_by_id_users_id_fk" FOREIGN KEY ("last_reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;