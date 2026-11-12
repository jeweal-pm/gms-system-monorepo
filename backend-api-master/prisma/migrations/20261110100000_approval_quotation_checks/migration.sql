-- approval-setup SA revision 1 / ADR-0048, clarification G4 (backend stage 2, 2026-11-10): the Quotation CHECKs deferred by
-- 20261110090000_approval_setting, now that the quotation paths write the review / submitted / auto-approved columns.
--   1. Backfill: REJECTED quotations get their review from status_reason (review_action REJECT, note = trimmed reason or
--      'Rejected', reviewed_at / by = updated_at / by). Auto-approved APPROVED rows that still carry a submitted stamp (a
--      PENDING row approved by its first Save between stage 1 and stage 2) lose it (submitted_* = NULL).
--   2. quotation_submitted_check: submitted_at / submitted_by paired, by_name only with them; a live row other than
--      auto-approved / CANCELLED is DRAFT exactly when it was never submitted.
--   3. quotation_auto_approved_check: auto-approved = APPROVED, never submitted, never reviewed; CANCELLED exempt (G4,
--      cancel keeps the auto / review fields as history).
--   4. quotation_review_status_check (ADR-0046 review-status rule, NULL-safe per G1); CANCELLED exempt (G4).
-- quotation_deleted_check keeps PENDING_APPROVAL for legacy soft-deleted rows (G3); it is not changed here.
-- The seven engine headers need no change: their CHECKs were final in 20261110090000 (G2 submitted exemption, G3).
--
-- Rollback: ALTER TABLE "partner"."quotation" DROP CONSTRAINT "quotation_submitted_check",
--   DROP CONSTRAINT "quotation_auto_approved_check", DROP CONSTRAINT "quotation_review_status_check";
--   the backfilled review columns may stay (quotation_review_check accepts them).

UPDATE "partner"."quotation"
SET "review_action" = 'REJECT',
    "review_note" = left(COALESCE(NULLIF(btrim("status_reason"), ''), 'Rejected'), 500),
    "reviewed_at" = "updated_at",
    "reviewed_by" = "updated_by"
WHERE "status" = 'REJECTED' AND "review_action" IS NULL;

UPDATE "partner"."quotation"
SET "submitted_at" = NULL, "submitted_by" = NULL, "submitted_by_name" = NULL
WHERE "auto_approved" AND "status" = 'APPROVED' AND "submitted_at" IS NOT NULL;

ALTER TABLE "partner"."quotation"
  ADD CONSTRAINT "quotation_submitted_check" CHECK ((("submitted_at" IS NULL) = ("submitted_by" IS NULL))
    AND ("submitted_at" IS NOT NULL OR "submitted_by_name" IS NULL)
    AND ("deleted_at" IS NOT NULL OR "auto_approved" OR "status" = 'CANCELLED' OR (("status" = 'DRAFT') = ("submitted_at" IS NULL)))),
  ADD CONSTRAINT "quotation_auto_approved_check" CHECK (NOT "auto_approved" OR "status" = 'CANCELLED'
    OR ("status" = 'APPROVED' AND "submitted_at" IS NULL AND "review_action" IS NULL)),
  ADD CONSTRAINT "quotation_review_status_check" CHECK ("status" = 'CANCELLED'
    OR (("status" <> 'REJECTED' OR "review_action" IS NOT DISTINCT FROM 'REJECT')
      AND ("status" <> 'REVISION_REQUESTED' OR "review_action" IS NOT DISTINCT FROM 'REVISE')
      AND ("review_action" IS DISTINCT FROM 'REJECT' OR "status" = 'REJECTED')));
