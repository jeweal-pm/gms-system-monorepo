# ADR-0046: Reject / Revise review status and the Approve Center API

- Status: Accepted (2026-11-07)
- Amended by: [ADR-0050](0050-approval-setting-draft-send-to-approve.md) (accepted 2026-11-10): adds `DRAFT` and Send to approve (`submit` replaces `resubmit`), Pending becomes locked (replaces D7), Revise once, reason required for Revise and Reject, Quotation joins, Approve Center follows per-type settings. Both ship in one release.
- Date: 2026-11-07
- Feature / source UI revision: `approve-center` / UI revision 1 (approved by the owner 2026-11-07, as dispatched by the parent)
- SA revision: 1 (approved 2026-11-07)
- Deciders: project owner
- Approval evidence: owner chat reply "ได้" on 2026-11-07, given after the summary offering "ใช้ default" (D1–D22 as drafted; OQ-AP-1…8 resolved to their defaults). The owner also said "ยังไม่ต้องเริ่มทำ backend": backend is on hold until the owner says to start.
- Supersedes / related ADRs: extends [ADR-0033](0033-memo-documents-in-master-service.md), [ADR-0034](0034-memo-receive-approval-and-memo-stock.md), [ADR-0036](0036-reserve-document.md), [ADR-0041](0041-purchase-order-document.md), [ADR-0042](0042-purchase-document-and-stock-deduction.md) (status model); widens the deletable set of [ADR-0045](0045-transaction-document-soft-delete.md) D2; amends [ADR-0031](0031-private-master-authorization-boundary.md) item 5 for one view column; keeps [ADR-0016](0016-per-user-menu-action-permissions.md) (no new action), [ADR-0025](0025-gms-domain-routing-and-trpc.md), [ADR-0030](0030-permanent-retention-for-user-uploaded-files.md)

## Context

The owner wants one Approve page for Reserve, Purchase Order, Purchase, Memo Receive, Memo Return, Memo Out and Memo Out Return (and later Load to Stock, Merge/Split Stock, Transfer Location). Each row has Reject…, Revise… and Approve. On 2026-11-07 the owner decided: Reject closes the document as a final `REJECTED` status with a required reason (Q-AP-01); Revise sends it back to its creator with a note, and the creator resubmits (Q-AP-02).

Today the seven documents only go `PENDING_APPROVAL` → `APPROVED` (`document-engine.ts`, `customer-stock-document.ts` and the per-document services in `backend-api-master`). Stock moves only inside `approve()`. The list API has no `version`, totals, stone names or submitter, and counts need one call per document. Master stores user ids only; its auth reader may read only `auth.current_authorization`, which has no name. Auth users have no position field.

Bundle: [decisions](../apps/backend/master/approve-center/decisions.md), [api-contract](../apps/backend/master/approve-center/api-contract.md), [architecture](../apps/backend/master/approve-center/architecture.md), [authorization](../apps/backend/master/approve-center/authorization.md), [database-diagram](../apps/backend/master/approve-center/database-diagram.md), [sequence-diagram](../apps/backend/master/approve-center/sequence-diagram.md), [error-handling](../apps/backend/master/approve-center/error-handling.md), [dependencies](../apps/backend/master/approve-center/dependencies.md), [testing](../apps/backend/master/approve-center/testing.md), [status flow](../diagram/approve-center-review-flow.md), [UI flow](../diagram/approve-center-flow.md), [SA design handoff](../coordination/handoffs/approve-center-sa-design.md), frontend [TODO](../task/todo/approve-center.md).

## Decision

1. **Status model** for the seven documents: add `REJECTED` (final, read-only, not deletable) and `REVISION_REQUESTED` (editable and deletable, not approvable). Reject, Revise and Approve only from `PENDING_APPROVAL`; Resubmit only from `REVISION_REQUESTED` back to `PENDING_APPROVAL`. Status CHECKs and `<t>_deleted_check` are updated in the database.
2. **Review record** on each header: `review_action`, `review_note` (1–500), `reviewed_at`, `reviewed_by`, `reviewed_by_name` (latest review only, CHECK-backed). **Submitted** record: `submitted_at`, `submitted_by` (backfilled from created), `submitted_by_name`. **Header totals**: `line_count`, `total_pcs`, `total_weight_ct`, written on every save and backfilled.
3. **No stock effect**: Reject, Revise and Resubmit touch no stock, counter or line. Stock still moves only in the unchanged `approve()`.
4. **Procedures** per document router: `reject` and `requestRevision` (`<menu>` APPROVE + CSRF), `resubmit` (`<menu>` EDIT + CSRF). Errors reuse `<CODE>_NOT_FOUND/_DELETED/_STATUS_INVALID/_CHANGED` and `VALIDATION_ERROR`.
5. **Approve Center API** in `backend-api-master`: a read-only `approval` router. `approval.summary` returns capped (≤ 100) pending counts for the types the caller may APPROVE and VIEW, in one SQL statement. `approval.pending` returns ≤ 50 enriched rows of one type per page (version, party, value, line count, Σ pcs, Σ weight, ≤ 3 stone names, submitter, last Revise), sorted server-side (default oldest submitted first) with a keyset cursor, and searched by doc no., party, ref, line stone name and Stock ID. Approve/Reject/Revise stay per-document procedures. No polling, push, cache or worker.
6. **Indexes**: one partial index per table `(submitted_at, id) WHERE status='PENDING_APPROVAL' AND deleted_at IS NULL`.
7. **Display names**: `auth.current_authorization` gains `user_name` (the session owner's own `User.name`) through an auth migration; master snapshots the actor's name when it writes `submitted_*` / `reviewed_*`. This amends ADR-0031 item 5 ("no schema table/view change") for this one appended column; the reader role, grants and pool are unchanged. No role/position is returned (none exists). The view has no row filter: the reader role can read the display names of all users with a session row, as it already reads their ids and grants; master queries only its caller's row (wording corrected and risk accepted 2026-11-12, INV-20261111-002 H1).
8. **Convention** for Load to Stock, Merge/Split Stock and Transfer Location: adopt items 1–4 and 6 and register in the approval type registry when they are designed.

No package, service, container, network or storage change; [tech-stack.md](tech-stack.md) is unchanged.

## Alternatives

- **Revise as a flag on `PENDING_APPROVAL`**: rejected — every approve guard, count and index would need the flag, and "waiting for approval" would no longer be one status.
- **Revise back to a `DRAFT` status**: rejected — these documents have no draft status, and the note/"sent back" state would be lost.
- **Review history table** (`document_review` rows per round): deferred (OQ-AP-4); latest-on-row plus logs follows ADR-0045 D13.
- **One `approval.approve/reject` endpoint for all types**: rejected — it would duplicate per-menu grants and stock logic; per-document procedures already exist.
- **Count via `<doc>.list(limit 1).total` × 7** (phase 1): replaced — 7 calls and uncapped counts.
- **Names via a master-readable user directory view** (current names for every id): not chosen — exposes every user's name to master; the snapshot needs only the caller's own name. Kept as the OQ-AP-2 alternative.
- **Names via an auth HTTP lookup per page**: rejected — cross-service fan-out on every list, timeouts and a cache on a 2 vCPU host.
- **No names** ("—" only): fallback if the owner declines the view change.
- **Aggregate pcs/weight from lines at query time**: rejected for sorting (would aggregate all pending lines per call); stored totals are cheap and exact.
- **Push/SSE for live counts**: rejected without a capacity ADR; focus/mutation refetch is enough.

## Consequences and capacity

- Master migration `20261107090000_approval_review`: 11 columns, 3 new + 2 replaced CHECKs and 1 partial index on each of 7 small header tables; a one-time backfill rewrite of each header row (measure counts first, M-AP-02). Auth migration: `CREATE OR REPLACE VIEW` with one appended column. Deploy auth first, then master migration and code, then frontend; rollback in reverse with a documented mapping of rejected/revised rows (database-diagram).
- Behaviour: Approve Center counts drop from 7 calls to 1 per refresh; the frontend no longer calls `get` before approve. Document pages must show Rejected / Revise and offer Resubmit (FE-AP-010) before the Reject/Revise buttons are enabled.
- Capacity (4 GB / 2 vCPU): no new process, pool or cache; partner pool ≤ 5 and auth reader pool 1 unchanged. `summary` reads ≤ 700 partial-index entries; `pending` returns ≤ 51 rows and reads only those rows' lines plus the pending set of one type. Writes are single-row statements. Measurements M-AP-01…03 before release.
- Security: the master reader gains read access to the caller's own display name only; both security reviewers review the auth view and master changes on the same revision.
- No infra or devops routing (no container, image input, variable or workflow change).

## Acceptance and approval

- Backend: UT-AP-B01…B13, GP-AP-01…04, IT-AP-B01…B12 and measurements M-AP-01…03 in [testing](../apps/backend/master/approve-center/testing.md). Frontend: FE-AP-009/010 tests in the central TODO.
- Covers SA revision 1: decisions (D1…D22, OQ-AP-1…8), api-contract, architecture, authorization, database-diagram, sequence-diagram, error-handling, dependencies, testing, the status flow diagram, the SA design handoff (BE-AP-001…012) and this ADR. No packages.
- Accepted 2026-11-07 by the owner (evidence above), all defaults kept. Implementation is on hold until the owner says to start backend.
