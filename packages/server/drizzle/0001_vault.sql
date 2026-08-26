DROP INDEX "assets_timeline_idx";--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "vaulted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "vault_passphrase_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "vault_failed_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "vault_locked_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "assets_vault_idx" ON "assets" USING btree ("owner_id","captured_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "assets"."vaulted_at" is not null;--> statement-breakpoint
CREATE INDEX "assets_timeline_idx" ON "assets" USING btree ("owner_id","captured_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "assets"."deleted_at" is null and "assets"."vaulted_at" is null;