DROP TABLE "ar_followups" CASCADE;--> statement-breakpoint
DROP TABLE "dash_unlocks" CASCADE;--> statement-breakpoint
DROP TABLE "data_cache" CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "unlocked_until";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "unlock_code_hash";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "unlock_code_expires";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "unlock_attempts";