# Testing: approval-setup (SA revision 1, 2026-11-10, approved with ADR-0048)

Follows [automated-testing](../../../../workflow/automated-testing.md). Integration tests use the disposable PostgreSQL (`PARTNER_TEST_DATABASE_URL`). ADR-0046 tests (UT-AP-B*, IT-AP-B*) are updated where this bundle changes them (Pending locked, `submit` instead of `resubmit`).

## Unit (master)

| ID | Check |
|---|---|
| UT-AS-B01 | `saveStatus`: ON create → DRAFT; ON update keeps DRAFT / REVISION_REQUESTED; OFF create/update of DRAFT → APPROVED auto |
| UT-AS-B02 | `assertEditable` / delete matrix for every status × auto_approved × isUsed |
| UT-AS-B03 | `submit` allowed from DRAFT, REVISION_REQUESTED only; ADD or EDIT grant |
| UT-AS-B04 | Revise limit: second Revise → `_REVISE_LIMIT`; Approve / Reject still allowed |
| UT-AS-B05 | Revise / Reject reason trim 1–500 required |
| UT-AS-B06 | `canApprove` delegates to `<menu>:APPROVE` |
| UT-AS-B07 | `approvalSetting.update` input validation, no-op on same value |
| UT-AS-B08 | Flow flags (`canEdit`, `canDelete`, `canSubmit`, `usedBy`) per state and grants |

## Integration (master + DB)

| ID | Check |
|---|---|
| IT-AS-B01 | Migration: 11 seed rows; constraints reject DRAFT with `submitted_at`, REVISION_REQUESTED with count 0, deleting a Pending row |
| IT-AS-B02 | Each of the 8 types, ON: Save → DRAFT (no stock change) → edit → submit → update refused → Approve moves stock exactly as today |
| IT-AS-B03 | Revise → edit → submit → second Revise refused → Reject → read-only |
| IT-AS-B04 | Each type, OFF: Save → APPROVED auto with today's effects; effect shortage refuses the whole Save, nothing written |
| IT-AS-B05 | OFF edit of an unused document: reverse + re-apply leaves Memo Stock / PO lines equal to a fresh Save of the new content (per type, incl. Purchase MERGED / sold parts) |
| IT-AS-B06 | OFF delete of an unused document: stock back to before the Save; Memo Receive's Memo Stock rows removed |
| IT-AS-B07 | `isUsed`: Memo Receive with a Memo Return draft / Memo Out / Purchase picking its item; Memo Out with a Memo Out Return; PO with a Purchase; Memo Out Return whose returned stock was taken again → `_IN_USE` with `usedBy` |
| IT-AS-B08 | Turn OFF refused with pending / revision documents (counts), allowed with drafts; next Save of a draft approves it |
| IT-AS-B09 | Race: concurrent `update(OFF)` and `submit` — either submit wins and OFF is refused, or OFF wins and submit gets `_APPROVAL_OFF`; never OFF with a Pending document |
| IT-AS-B10 | `approval.summary` / `pending` exclude OFF types; Quotation appears when ON; rows carry `revisionCount` |
| IT-AS-B11 | `approvalSetting.list` counts only with `approval-setup:VIEW`; `update` needs EDIT + CSRF |
| IT-AS-B12 | Go-live command: dry run changes nothing and predicts each document alone against the pre-run state (INV-20261111-002 H2); apply approves in dependency order, soft-deletes a short-stock document, second run is a no-op |
| IT-AS-B15 | INV-20261111-002 F1, two sessions with a controlled interleaving: Memo Out Return auto-approve vs `memoOut.delete` (pooled Reserve) → return refused `MEMO_OUT_RETURN_REFERENCE_INVALID`, stock = serial result; Purchase auto-approve vs `purchaseOrder.delete` → delete refused `PURCHASE_ORDER_IN_USE`, never an approved Purchase on a deleted PO (`approval-source-lock.db.integration.test.ts`; unit UT-AS-B15 `source-lock.test.ts`) |
| IT-AS-B13 | Quotation: existing approved rows editable while OFF; ON flow incl. Reject; CANCELLED unchanged |
| IT-AS-B14 | `<doc>.list` returns `status`, `autoApproved`, `review` for the Daybook; DRAFT filter |

## Auth

| ID | Check |
|---|---|
| UT-AS-B20 | Catalog has `approval-setup` (VIEW/EDIT) after `decimal-setup`; leaf count 43; existing grants unaffected |

## Measurements

M-AS-01…03 in [architecture](architecture.md#capacity-4-gb-ram--2-vcpu).

### Results (backend stage 3, 2026-11-10)

Same environment and data set as [approve-center M-AP results](../approve-center/testing.md#results-backend-stage-3-2026-11-10) (disposable PostgreSQL 512 MB / 1 vCPU; 4 types × 5 001 headers, 500 pending each, 5 lines each; 200 Memo Stock items).

| ID | Result | Target | Verdict |
|---|---|---|---|
| M-AS-01 | Setting read `FOR SHARE` in its own transaction p95 5.5 ms (includes BEGIN/COMMIT; inside a Save it is one indexed single-row statement on the same connection). Save p95: Reserve DRAFT with 5 From Stock lines 36.5 ms, Purchase Order DRAFT with 5 lines 35.3 ms | +≤ 5 ms per Save | pass (one extra round trip) |
| M-AS-02 | Approval OFF Purchase with 200 STOCK lines: create (apply) 266 ms; edit (reverse + re-apply) ×6: 259–280 ms, p95 280 ms; delete (reverse) 40 ms | < 1 s | pass |
| M-AS-03 | Go-live command on 2 004 pending documents (4 types): dry run 15.9 s (measured with the earlier design: one rolled-back transaction, savepoint per document — replaced 2026-11-12 by one rolled-back transaction per document, INV-20261111-002 H2; predicted 1 013 approve / 991 delete), apply 22.5 s (same 1 013 approved / 991 soft-deleted, one transaction per document), rerun 15 ms (no-op). Dev data set: 0 pending documents (dry-run output in the stage 3 report) | runs once, sequentially | pass |

The 991 refusals come from the synthetic clones sharing a handful of Memo Stock items (stock short / over-return), not from the command.

## Security review

Both `sec-auditor` and `security-auditor` once on the final backend revision (authorization of `submit`/`update` settings, reversal integrity, go-live command not exposed).
