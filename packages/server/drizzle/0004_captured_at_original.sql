ALTER TABLE "assets" ADD COLUMN "captured_at_original" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "captured_at_original_is_exact" boolean;