CREATE TABLE "album_assets" (
	"album_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_assets_album_id_asset_id_pk" PRIMARY KEY("album_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"cover_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"variant" text NOT NULL,
	"path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"checksum" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"original_path" text NOT NULL,
	"width" integer,
	"height" integer,
	"duration" real,
	"captured_at" timestamp with time zone NOT NULL,
	"captured_at_is_exact" boolean DEFAULT false NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"description" text,
	"exif" jsonb,
	"latitude" double precision,
	"longitude" double precision,
	"altitude" double precision,
	"place" text,
	"placeholder_color" text,
	"live_photo_video_id" uuid,
	"device_asset_id" text,
	"embedding" vector(512),
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', translate(coalesce(original_filename, ''), '._-/\', '     ')), 'A') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'A') ||
          setweight(to_tsvector('simple', coalesce(place, '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(exif->>'make', '') || ' ' || coalesce(exif->>'model', '')), 'C')) STORED,
	"processing_error" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"last_error" text,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_auth_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text NOT NULL,
	"family_id" uuid NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"secret_hash" text,
	"name" text NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"grant_types" jsonb NOT NULL,
	"scopes" jsonb NOT NULL,
	"token_endpoint_auth_method" text DEFAULT 'none' NOT NULL,
	"client_uri" text,
	"logo_uri" text,
	"dynamically_registered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"kind" text NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"scopes" jsonb NOT NULL,
	"family_id" uuid NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"album_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"password_hash" text,
	"allow_download" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"received_bytes" bigint DEFAULT 0 NOT NULL,
	"temp_path" text NOT NULL,
	"metadata" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"password_hash" text,
	"oidc_subject" text,
	"avatar_url" text,
	"quota_bytes" bigint,
	"used_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "album_assets" ADD CONSTRAINT "album_assets_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_assets" ADD CONSTRAINT "album_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_cover_asset_id_assets_id_fk" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_files" ADD CONSTRAINT "asset_files_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_auth_codes" ADD CONSTRAINT "oauth_auth_codes_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_auth_codes" ADD CONSTRAINT "oauth_auth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "album_assets_asset_idx" ON "album_assets" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "album_assets_order_idx" ON "album_assets" USING btree ("album_id","position");--> statement-breakpoint
CREATE INDEX "albums_owner_idx" ON "albums" USING btree ("owner_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "asset_files_asset_variant_key" ON "asset_files" USING btree ("asset_id","variant");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_owner_checksum_key" ON "assets" USING btree ("owner_id","checksum");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_owner_device_asset_key" ON "assets" USING btree ("owner_id","device_asset_id") WHERE "assets"."device_asset_id" is not null;--> statement-breakpoint
CREATE INDEX "assets_timeline_idx" ON "assets" USING btree ("owner_id","captured_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "assets"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "assets_owner_status_idx" ON "assets" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "assets_deleted_at_idx" ON "assets" USING btree ("deleted_at") WHERE "assets"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "assets_search_idx" ON "assets" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "assets_location_idx" ON "assets" USING btree ("owner_id","latitude","longitude") WHERE "assets"."latitude" is not null;--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("status","run_at") WHERE "jobs"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "oauth_auth_codes_expires_idx" ON "oauth_auth_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_clients_created_idx" ON "oauth_clients" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_tokens_hash_key" ON "oauth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "oauth_tokens_family_idx" ON "oauth_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "oauth_tokens_user_client_idx" ON "oauth_tokens" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "oauth_tokens_expires_idx" ON "oauth_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_slug_key" ON "share_links" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "share_links_album_idx" ON "share_links" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "upload_sessions_user_idx" ON "upload_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "upload_sessions_expires_idx" ON "upload_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_oidc_subject_key" ON "users" USING btree ("oidc_subject") WHERE "users"."oidc_subject" is not null;