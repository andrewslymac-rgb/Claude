CREATE TABLE "meeting_people" (
	"workspace_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"user_id" uuid,
	CONSTRAINT "meeting_people_workspace_id_alias_pk" PRIMARY KEY("workspace_id","alias")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "source_meeting_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "source_label" text;--> statement-breakpoint
ALTER TABLE "meeting_people" ADD CONSTRAINT "meeting_people_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_people" ADD CONSTRAINT "meeting_people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_meeting_id_meetings_id_fk" FOREIGN KEY ("source_meeting_id") REFERENCES "public"."meetings"("id") ON DELETE set null ON UPDATE no action;