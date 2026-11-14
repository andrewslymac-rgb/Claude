CREATE TABLE "ar_followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"invoice_id" text NOT NULL,
	"note" text NOT NULL,
	"follow_up_on" date,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_cache" (
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_cache_workspace_id_key_pk" PRIMARY KEY("workspace_id","key")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "unlocked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "unlock_code_hash" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "unlock_code_expires" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "unlock_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ar_followups" ADD CONSTRAINT "ar_followups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_followups" ADD CONSTRAINT "ar_followups_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_cache" ADD CONSTRAINT "data_cache_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ar_followups_invoice_idx" ON "ar_followups" USING btree ("workspace_id","invoice_id");