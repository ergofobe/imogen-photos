CREATE TABLE "faces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"person_id" uuid,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"score" real NOT NULL,
	"embedding" vector(512) NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text,
	"cover_face_id" uuid,
	"hidden" boolean DEFAULT false NOT NULL,
	"centroid" vector(512),
	"face_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "faces" ADD CONSTRAINT "faces_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faces" ADD CONSTRAINT "faces_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faces" ADD CONSTRAINT "faces_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faces_asset_idx" ON "faces" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "faces_person_idx" ON "faces" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "faces_owner_idx" ON "faces" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "faces_embedding_idx" ON "faces" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "people_owner_idx" ON "people" USING btree ("owner_id","hidden");--> statement-breakpoint
CREATE INDEX "people_centroid_idx" ON "people" USING hnsw ("centroid" vector_cosine_ops) WHERE "people"."centroid" is not null;