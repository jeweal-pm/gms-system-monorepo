-- GMS file-storage migration SA revision 3 / ADR-0029 and ADR-0030.
-- This expand-only migration does not copy or delete bytes and is not a production cutover.
ALTER TABLE "partner"."company_profile"
  ADD COLUMN "logo_storage_key" VARCHAR(512);

CREATE TABLE "partner"."stored_files" (
  "id" UUID NOT NULL,
  "kind" VARCHAR(32) NOT NULL,
  "bucket" VARCHAR(16) NOT NULL,
  "object_key" VARCHAR(512) NOT NULL,
  "filename" VARCHAR(255) NOT NULL,
  "content_type" VARCHAR(255) NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "source_type" VARCHAR(64) NOT NULL,
  "source_id" VARCHAR(128) NOT NULL,
  "created_by" VARCHAR(64),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ready_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6),
  "deleted_at" TIMESTAMPTZ(6),
  "purge_after" TIMESTAMPTZ(6),
  CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stored_files_bucket_check" CHECK ("bucket" IN ('files', 'public', 'documents', 'exports')),
  CONSTRAINT "stored_files_status_check" CHECK ("status" IN ('pending', 'ready', 'deleted', 'expired')),
  CONSTRAINT "stored_files_size_check" CHECK ("size_bytes" > 0),
  CONSTRAINT "stored_files_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "stored_files_user_upload_retention_check" CHECK (
    "bucket" NOT IN ('files', 'public') OR "purge_after" IS NULL
  )
);

CREATE UNIQUE INDEX "stored_files_bucket_object_key_key"
  ON "partner"."stored_files"("bucket", "object_key");
CREATE INDEX "stored_files_source_idx"
  ON "partner"."stored_files"("source_type", "source_id");
CREATE UNIQUE INDEX "stored_files_one_ready_source_key"
  ON "partner"."stored_files"("source_type", "source_id") WHERE "status" = 'ready';
CREATE INDEX "stored_files_user_idx"
  ON "partner"."stored_files"("created_by", "created_at" DESC);
