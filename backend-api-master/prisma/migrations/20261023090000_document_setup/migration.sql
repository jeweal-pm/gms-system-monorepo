-- document-setup SA revision 1 (owner 2026-10-23): document header name, code and numbering periods per
-- transaction type. Expand-only; no existing table changes.
CREATE TABLE "partner"."document_setup" (
  "transaction_key" VARCHAR(40) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "code" VARCHAR(10) NOT NULL,
  "start_from" INTEGER NOT NULL,
  "declaration" VARCHAR(2000) NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_by" VARCHAR(64) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_setup_pkey" PRIMARY KEY ("transaction_key"),
  CONSTRAINT "document_setup_key_check" CHECK ("transaction_key" ~ '^[a-z0-9-]{1,40}$'),
  CONSTRAINT "document_setup_name_check" CHECK (length(btrim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "document_setup_code_check" CHECK ("code" ~ '^[A-Z0-9/-]{1,10}$'),
  CONSTRAINT "document_setup_start_from_check" CHECK ("start_from" BETWEEN 1 AND 999999999),
  CONSTRAINT "document_setup_version_check" CHECK ("version" >= 1)
);

CREATE UNIQUE INDEX "document_setup_code_key" ON "partner"."document_setup"("code");

CREATE TABLE "partner"."document_numbering" (
  "id" UUID NOT NULL,
  "transaction_key" VARCHAR(40) NOT NULL,
  "effective_date" DATE NOT NULL,
  "prefix" VARCHAR(10) NOT NULL DEFAULT '',
  "separator" VARCHAR(3) NOT NULL DEFAULT '',
  "start_no" INTEGER NOT NULL,
  CONSTRAINT "document_numbering_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_numbering_prefix_check" CHECK ("prefix" ~ '^[A-Z0-9./-]{0,10}$'),
  CONSTRAINT "document_numbering_separator_check" CHECK ("separator" ~ '^[-/._]{0,3}$'),
  CONSTRAINT "document_numbering_start_no_check" CHECK ("start_no" BETWEEN 1 AND 999999999),
  CONSTRAINT "document_numbering_transaction_key_fkey" FOREIGN KEY ("transaction_key")
    REFERENCES "partner"."document_setup"("transaction_key") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "document_numbering_transaction_key_effective_date_key"
  ON "partner"."document_numbering"("transaction_key", "effective_date");
