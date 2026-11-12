-- ADR-0049 (owner 2026-11-11): document notifications in api-master. Expand only: 2 new tables, no existing row changes.
-- Rollback: DROP notification_recipient, notification_event.

-- CreateTable
CREATE TABLE "partner"."notification_event" (
    "id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "document_type" VARCHAR(40) NOT NULL,
    "document_id" UUID NOT NULL,
    "doc_no" VARCHAR(40) NOT NULL,
    "actor_user_id" VARCHAR(64) NOT NULL,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."notification_recipient" (
    "event_id" UUID NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_recipient_pkey" PRIMARY KEY ("event_id","user_id")
);

-- CreateIndex
CREATE INDEX "notification_event_type_created_idx" ON "partner"."notification_event"("document_type", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "notification_event_created_idx" ON "partner"."notification_event"("created_at");

-- CreateIndex
CREATE INDEX "notification_recipient_user_created_idx" ON "partner"."notification_recipient"("user_id", "created_at" DESC, "event_id" DESC);

-- Unread count (ADR-0049 D2): only unread rows.
CREATE INDEX "notification_recipient_unread_idx" ON "partner"."notification_recipient"("user_id") WHERE "read_at" IS NULL;

-- AddForeignKey
ALTER TABLE "partner"."notification_recipient" ADD CONSTRAINT "notification_recipient_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "partner"."notification_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- summary is display only (ADR-0049 D2).
ALTER TABLE "partner"."notification_event" ADD CONSTRAINT "notification_event_summary_size_check" CHECK (octet_length("summary"::text) <= 1024);
