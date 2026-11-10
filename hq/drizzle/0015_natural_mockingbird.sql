ALTER TABLE "invites" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" text;--> statement-breakpoint
UPDATE "users" SET "first_name" = split_part(trim("name"), ' ', 1), "last_name" = nullif(trim(substr(trim("name"), strpos(trim("name"), ' ') + 1)), '') WHERE "first_name" IS NULL AND "name" IS NOT NULL AND trim("name") LIKE '% %';--> statement-breakpoint
UPDATE "users" SET "first_name" = trim("name") WHERE "first_name" IS NULL AND "name" IS NOT NULL AND trim("name") <> '' AND lower(trim("name")) <> lower(split_part("email", '@', 1));
