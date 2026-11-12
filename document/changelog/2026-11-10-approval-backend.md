# 2026-11-10 — Approval backend (ADR-0046 as amended by ADR-0050), stage 3

Branch `feat/10-11-26-approval-api`; owner "เริ่ม backend approval" (2026-11-10). Stages 1–2 (migrations, auth view, settings, document flow) are in the TODO evidence of [approval-setup](../task/todo/approval-setup.md) and [approve-center](../task/todo/approve-center.md).

## Added

- Approve Center API (`backend-api-master/src/approval/**`): registry of the 8 document types, `approval.summary` (capped counts for types the caller can approve whose setting is ON, plus each approvable type's setting) and `approval.pending` (5 sorts × direction, keyset cursor, search incl. stone / Stock ID, `APPROVAL_TYPE_OFF` 409).
- `permittedApprovalTypes` (`approval-flow.ts`).
- Go-live command `src/scripts/approve-pending.ts` (`node dist/scripts/approve-pending.js [--apply]`, package script `go-live:approve-pending`): dry run by default; approves every pending document in dependency order regardless of the current setting; refusals are soft-deleted; idempotent.

## Changed

- `<doc>.get` on all 8 routers accepts `<menu>:VIEW` or `canApprove` for a live PENDING_APPROVAL document (clarification G11).
- Line photo reads (Quotation, Memo Receive, Purchase Order) accept `<menu>:VIEW` or `canApprove` for a photo of a live PENDING_APPROVAL document (G14).
- `usedBy` names a soft-deleted user document with " (deleted)" (G9).
- Engine / Quotation: `approveWithin(tx, …)` shares the approve body with `approve` (used by the go-live command).

## Verification

Master 683 passed / 15 skipped, auth 107 passed / 6 skipped on disposable PostgreSQL 18.6; tsc and eslint clean. Measurements in the approval-setup and approve-center `testing.md`. Security reviews pending (parent). `--apply` not run on dev.

## Fixed (2026-11-12, INV-20261111-002 pass 1)

- A dependent document that applies effects (Memo Out Return → Memo Out, Purchase → Purchase Order) locks the source headers `FOR SHARE` and re-checks them live (`trade-document/source-lock.ts`, engine `lockSources` hook), so an auto-approved source's soft delete / edit serializes with it (no double release, no approved Purchase on a deleted PO).
- `approvalSetting.update` refuses the three future types with `VALIDATION_ERROR` `type` / `not_available` (G6).
- `approval.pending` party-sort cursor must name a live PENDING_APPROVAL row of the type (else `VALIDATION_ERROR cursor`).
- Go-live dry run: one rolled-back transaction per document (4 s) instead of one 120 s transaction; documents are predicted against the pre-run state.
- Docs: ADR-0046 / approve-center D5 wording on reader-visible display names (risk accepted).
- Verification: master 694 passed / 15 skipped, auth 107 / 6, tsc and eslint clean.
