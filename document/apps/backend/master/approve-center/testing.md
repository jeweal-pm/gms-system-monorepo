# Testing: approve-center (SA revision 1, 2026-11-07, approved 2026-11-07)

Follow [automated-testing](../../../../workflow/automated-testing.md). Backend tests live in `backend-api-master/test/` (fake-delegate unit style of `test/trade-document/*.test.ts`; DB tests `*.db.integration.test.ts` on the suite's disposable PostgreSQL). New files: `test/approval/approval.service.test.ts`, `test/approval/approval.db.integration.test.ts`, `test/trade-document/review.test.ts`, `test/trade-document/review.db.integration.test.ts`; extend `test/master/router.test.ts` and the master auth-context tests. Auth view: an auth-side migration test in `backend-api-auth/test/**` (auth owner).

## Unit (UT-AP-B)

| ID | Check |
|---|---|
| UT-AP-B01 | Engine `review(REJECT)`: `updateMany` where `{id, version, status: PENDING, deletedAt: null}`, data `{status: REJECTED, reviewAction: REJECT, reviewNote, reviewedAt, reviewedBy, reviewedByName, version +1, updatedAt/By}`; returns `{id, version+1, status}`; calls no stock function |
| UT-AP-B02 | `review(REVISE)` same with `REVISION_REQUESTED` / `REVISE` |
| UT-AP-B03 | review miss order: missing → NOT_FOUND; deleted → DELETED; APPROVED / REJECTED / REVISION_REQUESTED → STATUS_INVALID; else CHANGED |
| UT-AP-B04 | `resubmit`: guard status REVISION_REQUESTED; sets PENDING + `submittedAt/By/ByName`; keeps `review_*`; miss order as B03 |
| UT-AP-B05 | `update` accepted in PENDING and REVISION_REQUESTED (status unchanged), refused in REJECTED/APPROVED → STATUS_INVALID; `delete` same set |
| UT-AP-B06 | `create` writes `submittedAt = createdAt`, `submittedBy`, `submittedByName`; create/update write `lineCount`, `totalPcs`, `totalWeightCt` from the prepared lines (Memo Out Return: return qty; Purchase: line pcs/weight) |
| UT-AP-B07 | All seven `approve` still guard `status: PENDING`; a REVISION_REQUESTED / REJECTED row → STATUS_INVALID and no stock function call |
| UT-AP-B08 | `get` returns `submittedAt/By/ByName` and `review` (null; REJECT; REVISE); `purchase.get` keeps `limit*`/`min*` in REVISION_REQUESTED and nulls them in REJECTED/APPROVED |
| UT-AP-B09 | Schemas: `reason`/`note` trimmed 1–500 (blank, 501 chars → field error); strict (unknown keys refused); list status enums accept the 4 statuses |
| UT-AP-B10 | Auth context: `user_name` string → `displayName` trimmed ≤ 200; null/blank/non-string → null and auth still succeeds; `ctx.userName` reaches the services |
| UT-AP-B11 | `approval.summary`: SQL built only from registry identifiers for the permitted types; omits types missing APPROVE or VIEW; Super Admin = 7; empty grants → `{items: [], countCap: 100}` without a query |
| UT-AP-B12 | `approval.pending`: sort/dir → ORDER BY + keyset tuple per D16; cursor bound to sort/dir/q (mismatch → VALIDATION_ERROR cursor); limit 1–50; q LIKE-escaped (`%`, `_`, `\`); `moreStoneCount = max(distinct − 3, 0)` |
| UT-AP-B13 | Logs `<event>.rejected` / `.revision_requested` / `.resubmitted` contain `{actorId, id, docNo, version, noteLength}` and never the note |

## Router / grants (GP-AP)

| ID | Check |
|---|---|
| GP-AP-01 | For each of the 7 routers: `reject`/`requestRevision` need `<menu>:APPROVE` (VIEW/EDIT only → PERMISSION_DENIED) and CSRF (missing → CSRF_INVALID before any service call); `resubmit` needs `<menu>:EDIT` + CSRF |
| GP-AP-02 | `approval.pending` with APPROVE only, or VIEW only → PERMISSION_DENIED before the service; both → served; Super Admin served |
| GP-AP-03 | `approval.summary` needs a live session (UNAUTHENTICATED / AUTHORIZATION_UNAVAILABLE / LICENSE_REQUIRED as `signedIn()`), no CSRF; unknown input keys refused |
| GP-AP-04 | The actor id/name in written rows always equal the context's, never input |

## DB integration (IT-AP-B, disposable PostgreSQL)

| ID | Check |
|---|---|
| IT-AP-B01 | `migrate deploy` on a fresh DB and on a dev copy applies `…_approval_review`; `migrate diff` shows no drift; CHECKs and 7 partial indexes exist; backfill: `submitted_* = created_*`, totals equal the line sums, `version` unchanged |
| IT-AP-B02 | CHECKs: REJECTED without review → fails; REVISE action with REJECTED status → fails; blank note → fails; deleted REJECTED / APPROVED → fails; deleted REVISION_REQUESTED → ok |
| IT-AP-B03 | Reject a pending Reserve / Memo Out / Memo Return / Memo Out Return / Memo Receive / PO / Purchase with From Stock and PO lines: `memo_stock`, `purchase_order_line.purchased_*`, `memo_out_line.returned_*`, the Stock ID counter and line Stock IDs are byte-identical before/after |
| IT-AP-B04 | Revise → update (lines changed, totals recomputed) → resubmit → approve: stock moves exactly as for a never-revised document; `review_*` still holds the Revise note |
| IT-AP-B05 | Rejected / revised documents never appear in `memoStock.list`, `purchase.memoStock`, `purchase.purchaseOrderLines`, `memoOutReturn.outstanding`, `memoOutstanding.*`, Purchase Outstanding |
| IT-AP-B06 | Race: concurrent approve and reject with the same version → one succeeds, the other STATUS_INVALID/CHANGED; CHECKs hold |
| IT-AP-B07 | Soft delete: delete REVISION_REQUESTED → ok; restore → REVISION_REQUESTED; delete REJECTED → STATUS_INVALID; reject a deleted pending → DELETED |
| IT-AP-B08 | `approval.summary` counts only pending, not deleted; caps at 100 with 101 pending rows; one statement (query log) |
| IT-AP-B09 | `approval.pending`: oldest first by `submitted_at`; resubmitted document moves to the end; every sort × dir pages > 50 rows with no duplicate/missing row; ties broken by id |
| IT-AP-B10 | Search: doc no., party, ref, stone name, Stock ID (incl. Memo Out Return via Memo Out line; PO by stone only); `%`/`_` literal; deleted/non-pending excluded |
| IT-AP-B11 | `EXPLAIN` of `summary` and default `pending` uses `<t>_pending_idx` |
| IT-AP-B12 | Auth view (auth suite): `user_name` appended; `gms_master_authz_reader` can select it and still cannot select `auth."User"` or any table (ADR-0031 negative privileges) |

## Measurements before release (M-AP)

| ID | Measure | Threshold / action |
|---|---|---|
| M-AP-01 | `approval.pending` p95 per type, each sort, with and without `q`, on a copy of production data | > 150 ms or > 2 000 pending in a type → add per-sort partial indexes (new SA note) |
| M-AP-02 | Header/line row counts before the migration; migration duration on the copy | > 100 000 rows in a header → split index creation to `CONCURRENTLY` |
| M-AP-03 | `approval.summary` p95; api-master RSS under the approve-center flow | p95 > 50 ms → investigate; RSS within the existing container limit |

## Acceptance

All UT/GP/IT above pass, plus the existing suites (`test/trade-document/**`, `test/purchase/**`, `test/purchase-order/**`, soft-delete tests); typecheck and lint pass; both security reviewers review the final diff (master + auth view) once on the same revision.
