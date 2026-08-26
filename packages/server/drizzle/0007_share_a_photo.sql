ALTER TABLE "share_links" ALTER COLUMN "album_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN "asset_id" uuid;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_links_asset_idx" ON "share_links" USING btree ("asset_id");--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_one_target" CHECK ((album_id is null) <> (asset_id is null));