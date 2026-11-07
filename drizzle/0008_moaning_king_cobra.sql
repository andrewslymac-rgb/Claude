ALTER TABLE "login_tokens" ADD COLUMN "requester_hash" text;--> statement-breakpoint
ALTER TABLE "login_tokens" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "login_tokens_requester_idx" ON "login_tokens" USING btree ("requester_hash");