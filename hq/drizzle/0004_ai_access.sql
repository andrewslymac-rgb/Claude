CREATE TYPE "public"."ai_token_kind" AS ENUM('access', 'refresh');--> statement-breakpoint
CREATE TABLE "ai_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"grant_id" uuid,
	"tool" text NOT NULL,
	"summary" text NOT NULL,
	"page_id" uuid,
	"task_id" uuid,
	"undo_version_id" uuid,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_auth_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"grant_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"secret_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" text,
	"name" text NOT NULL,
	"scopes" jsonb DEFAULT '["read"]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"grant_id" uuid NOT NULL,
	"kind" "ai_token_kind" NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_activity" ADD CONSTRAINT "ai_activity_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_activity" ADD CONSTRAINT "ai_activity_grant_id_ai_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."ai_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_activity" ADD CONSTRAINT "ai_activity_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_activity" ADD CONSTRAINT "ai_activity_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_auth_codes" ADD CONSTRAINT "ai_auth_codes_grant_id_ai_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."ai_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_grants" ADD CONSTRAINT "ai_grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_grants" ADD CONSTRAINT "ai_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_grants" ADD CONSTRAINT "ai_grants_client_id_ai_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."ai_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tokens" ADD CONSTRAINT "ai_tokens_grant_id_ai_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."ai_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_activity_ws_idx" ON "ai_activity" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_grants_ws_idx" ON "ai_grants" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ai_tokens_grant_idx" ON "ai_tokens" USING btree ("grant_id");