# TODO: transaction-soft-delete

- feature-id: `transaction-soft-delete`
- revision: 1
- status: **approved** 2026-11-06 (SA revision 1 + frontend items); backend BE-SD-002…005 **done** 2026-11-06 (tests pass; both security reviews pending, routed by the parent); FE-SD-001…003 **done** 2026-11-06 (frontend); FE-SD-004 open (security reviews, manual test: parent)
- request: owner 2026-11-06 "อยากทำ soft delete Quotation, Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase Order (PO), Purchase, Load to Stock, Merge/Split, Stock Transfer Location, Stock Adjustment, Sale". Owner answers the same day: (1) only drafts can be deleted, as today, with no stock effect; (2) deleted documents hidden, a "Deleted" filter, read-only when opened, Restore back to draft; (3) no reason, record who and when.
- source: owner messages above (no Figma or screenshot)
- ui-spec: none. The frontend behaviour is specified in FE-SD-001…003 below. It reuses the existing daybook rail, form and confirm patterns, and no new component library is needed.
- dependencies: none new ([dependencies](../../apps/backend/master/transaction-soft-delete/dependencies.md), [tech-stack](../../adr/tech-stack.md) unchanged)
- backend-bundles: [master/transaction-soft-delete SA rev 1](../../apps/backend/master/transaction-soft-delete/decisions.md): [api-contract](../../apps/backend/master/transaction-soft-delete/api-contract.md), [architecture](../../apps/backend/master/transaction-soft-delete/architecture.md), [authorization](../../apps/backend/master/transaction-soft-delete/authorization.md), [database-diagram](../../apps/backend/master/transaction-soft-delete/database-diagram.md), [sequence-diagram](../../apps/backend/master/transaction-soft-delete/sequence-diagram.md), [error-handling](../../apps/backend/master/transaction-soft-delete/error-handling.md), [testing](../../apps/backend/master/transaction-soft-delete/testing.md), [ADR-0044](../../adr/0044-transaction-document-soft-delete.md) (Accepted 2026-11-06)
- source-ui-revision: none (owner behaviour request)
- sa-revision: 1; sa-approval: owner 2026-11-06
- approved-revision: 1 (SA revision 1, D1…D18 with D2 changed by OQ-1; frontend items FE-SD-001…004 as amended by OQ-3)
- approved-by: owner
- approved-at: 2026-11-06
- approval-evidence: owner answer in chat 2026-11-06, "อนุมัติ เริ่มทำเลย" (with OQ-1: Quotation deletable only before approval; OQ-3: after Delete return to Create New; OQ-2/4/5: defaults kept). OQ-1: Quotation deletable only before approval (DRAFT, PENDING_APPROVAL). OQ-2: Restore uses DELETE. OQ-3: after a confirmed Delete, return to Create New as today. OQ-4: no audit table. OQ-5: unclear answer, default kept (Deleted filter for VIEW, Restore for DELETE).
- review-bundle: everything in backend-bundles, the [main flow](../../diagram/transaction-soft-delete-flow.md), this TODO, and the [SA handoff](../../coordination/handoffs/transaction-soft-delete-sa.md). Infra/devops: not routed (no container, image input, variable or workflow change).

## Implementation items

Revision 1 is approved (2026-11-06). Backend first; the frontend wires FE-SD-001…003 after BE-SD-005 verifies the contract. FE work that only needs typed fixtures may start after approval, in parallel.

| Done | ID | Owner | Task | Allowed files | Depends on | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|
| [x] approved 2026-11-06 | BE-SD-001 | SA | SA revision 1 bundle and ADR-0044 | `document/apps/backend/master/transaction-soft-delete/**`, `document/adr/0044-*`, `document/diagram/transaction-soft-delete-flow.md`, this TODO | — | Owner approved; OQ-1…5 answered | owner message recorded in the header |
| [x] done 2026-11-06 | BE-SD-002 | backend | **Schema**: `deletedAt` / `deletedBy` on the 8 header models, the partial `@@index … where: raw("(deleted_at IS NOT NULL)")`; migration `20261106090000_transaction_soft_delete` (or the next timestamp after the newest one present) with the columns, `<table>_deleted_check` (quotation variant per D2/OQ-1), partial indexes, and the rollback text in the header | `backend-api-master/prisma/schema.prisma`, `backend-api-master/prisma/migrations/<ts>_transaction_soft_delete/**` | BE-SD-001 approved | as [database-diagram](../../apps/backend/master/transaction-soft-delete/database-diagram.md); existing migrations untouched | IT-SD-01, IT-SD-02 |
| [x] done 2026-11-06 | BE-SD-003 | backend | **Engine + engine documents**: `list` `deleted` filter and `deletedAt`; `get` `deletedAt/deletedBy`; `update` DELETED check + guard; soft `delete` → `{ok, version}`; new `restore`; shared miss explanation; `errors.deleted()`; messages; approve guards `deletedAt: null` in memo out, reserve, memo receive, memo return, memo out return, PO, purchase; `restore` passthrough on each service; logs `.deleted` / `.restored` | `backend-api-master/src/trade-document/**`, `src/purchase/**`, `src/purchase-order/**`, `src/common/errors.ts`, tests | BE-SD-002 | api-contract; D4, D6, D8–D11, D13 | UT-SD-01…07, UT-SD-10…12, IT-SD-03…10 |
| [x] done 2026-11-06 | BE-SD-004 | backend | **Quotation**: new `DELETABLE = ["DRAFT", "PENDING_APPROVAL"]` for delete (OQ-1: APPROVED / REJECTED / CANCELLED → `QUOTATION_STATUS_INVALID`; a Quotation created APPROVED can't be deleted); otherwise the same as the engine for list/get/update/delete/restore; `transition()` (submit/approve/reject/cancel) guard and `explainMiss` order; `quotationDeleted()`; list schema `deleted` | `backend-api-master/src/quotation/**`, tests | BE-SD-002 | D2, D8 | UT-SD-08, UT-SD-09, IT-SD-03…06 (quotation) |
| [x] done 2026-11-06 (security reviews: parent) | BE-SD-005 | backend | **Router**: `restore` on 8 routers with `permitted(<menu>, "DELETE", true)` and the document's versioned id schema (purchase with `withFieldErrors`); then the full suites (default + disposable DB), `tsc --noEmit`, ESLint, fill in testing results; both security reviews once on the final backend revision; completion handoff to the parent/frontend | `backend-api-master/src/master/router.ts`, `test/master/router.test.ts`, `document/apps/backend/master/transaction-soft-delete/testing.md` | BE-SD-003, BE-SD-004 | all pass; `backend-api-auth/**` untouched | GP-SD-01, full regression |
| [x] done 2026-11-06 | FE-SD-001 | frontend | **Deleted filter in every list rail**: `DocumentDaybook` (Memo Out, Memo Out Return, Memo Return, Purchase, Reserve) and the Memo Receive, Purchase Order and Quotation rails get a two-option control "Active / Deleted" (default Active, kept per page in the tab state, not in `localStorage`). Deleted passes `deleted: true` to `<doc>.list`, resets the cursor, uses a grey dot with the label "Deleted", and shows the empty text "No deleted {plural}." | `frontend/src/features/trade-document/document-api.tsx`, `frontend/src/features/quotation/components/rail/**`, `frontend/src/features/{quotation,reserve,memo-receive,memo-return,memo-out,memo-out-return,purchase-order,purchase}/{api.ts,components/*Page.tsx}`, `frontend/test/**` | BE-SD-005 (typed fixtures earlier) | The normal list no longer shows deleted documents; the Deleted view lists them newest first with Load more; switching the view keeps the search text | UT-SD-F01, UT-SD-F02, TC-SD-01 |
| [x] done 2026-11-06 | FE-SD-002 | frontend | **Read-only deleted document**: when `get` returns `deletedAt`, show a banner "Deleted by {user} on {date time}" above the form; every input, row editor, picker, Save, Approve, Submit/Reject/Cancel and Delete is disabled or hidden; a **Restore** button only with `access.delete`, confirm "Restore {Doc No.}? It goes back to {status label} and can be edited again." **After a confirmed Delete, the page returns to Create New (a blank new document), as today (owner OQ-3)**; the deleted document is reached only through the Deleted filter. After Restore, refetch, and the form becomes editable. Quotation shows Delete only for DRAFT / PENDING_APPROVAL (OQ-1). | `frontend/src/features/trade-document/document-form.tsx`, `frontend/src/features/quotation/components/**` (QuotationForm/QuotationPage, use-confirm), the per-page forms if they bypass the shared form, `frontend/test/**` | FE-SD-001 | No write control can be used on a deleted document; Restore is hidden without DELETE; keyboard and screen reader can reach the banner and Restore | UT-SD-F03, UT-SD-F04, TC-SD-02, TC-SD-03, TC-SD-04 |
| [x] done 2026-11-06 | FE-SD-003 | frontend | **API and errors**: `restore` mutation hooks on the 8 APIs; `delete` result `version`; invalidate `<doc>.list` (both views) and `<doc>.get` after delete and restore; map `<CODE>_DELETED` → "This {noun} was deleted. Restore it to edit." + refetch; restore `STATUS_INVALID` → "This {noun} is no longer deleted." + refetch; CHANGED unchanged. **The delete confirm text stays exactly as today** (`deleteDocumentConfirm`). | `frontend/src/features/*/api.ts`, `frontend/src/features/trade-document/document-api.tsx`, error mappers, `frontend/test/**` | BE-SD-005 | Stale-tab save on a deleted document shows the message and the read-only view; no unhandled error | UT-SD-F05, UT-SD-F06, TC-SD-05, TC-SD-06 |
| [ ] frontend part done 2026-11-06 (tests, tsc, lint pass); security reviews + manual-tester: parent | FE-SD-004 | frontend + parent | Tests, typecheck, lint, the full frontend suite; both security reviews once on the final diff; manual-tester for TC-SD-01…06 | — | FE-SD-001…003 | all pass | frontend testing record |

### Frontend tests

| ID | Check |
|---|---|
| UT-SD-F01 | Daybook filter control: default Active; Deleted sends `deleted: true` and resets the cursor |
| UT-SD-F02 | Deleted item rendering (grey dot, "Deleted" label, empty text) |
| UT-SD-F03 | Form in deleted mode: banner text, all write controls disabled/hidden |
| UT-SD-F04 | Restore button visibility by `access.delete`; confirm text; success refetch; after Delete the page navigates to Create New; Quotation Delete hidden for APPROVED / REJECTED / CANCELLED |
| UT-SD-F05 | Error mapping of `<CODE>_DELETED` and restore `STATUS_INVALID` for all 8 codes |
| UT-SD-F06 | Delete confirm text unchanged (snapshot of `deleteDocumentConfirm`) |
| TC-SD-01 | Delete a draft on each page → the page returns to Create New; the document is gone from the list and present under Deleted |
| TC-SD-02 | Open a deleted document → read-only with the banner |
| TC-SD-03 | Restore → back in the list, editable, can save and approve |
| TC-SD-04 | User without Delete sees the Deleted list but no Restore |
| TC-SD-05 | Two tabs: delete in one, save in the other → "was deleted" message, read-only |
| TC-SD-06 | Approved document has no Delete; a deleted Memo Receive never appears in the Memo Stock pickers |

## Future documents (convention only, no item now)

When Load to Stock, Merge/Split, Stock Transfer Location, Stock Adjustment or Sale gets its own SA bundle, it adopts ADR-0044 D16: the same columns, CHECK, partial index, `deleted` filter, `restore`, `<CODE>_DELETED`, and readers that exclude deleted drafts.

## Approval and revisions

- Revision 1 (2026-11-06): SA bundle + frontend items drafted from the owner's request and answers.
- Revision 1 **approved** 2026-11-06 (owner answer in chat 2026-11-06, "อนุมัติ เริ่มทำเลย" (with OQ-1: Quotation deletable only before approval; OQ-3: after Delete return to Create New; OQ-2/4/5: defaults kept)). Answers recorded in place, with no new revision: D2 changed (Quotation deletable only before approval) and FE-SD-002 amended (return to Create New after Delete); OQ-2, OQ-4 and OQ-5 keep their defaults ([decisions](../../apps/backend/master/transaction-soft-delete/decisions.md#open-questions-for-the-owner-answered-2026-11-06)).

## Handoffs, evidence, and completion

- SA handoff: [transaction-soft-delete-sa.md](../../coordination/handoffs/transaction-soft-delete-sa.md)
- Backend completion: [transaction-soft-delete-backend.md](../../coordination/handoffs/transaction-soft-delete-backend.md) (BE-SD-002…005, 2026-11-06); results in [testing](../../apps/backend/master/transaction-soft-delete/testing.md#results-2026-11-06-backend-be-sd-002005); changelog [2026-11-06-transaction-soft-delete-backend](../../changelog/2026-11-06-transaction-soft-delete-backend.md). Security reviews (`sec-auditor`, `security-auditor`) on the final backend revision: routed by the parent, results pending.
- Frontend completion: FE-SD-001…003 done 2026-11-06; [changelog 2026-11-06-transaction-soft-delete-frontend](../../changelog/2026-11-06-transaction-soft-delete-frontend.md). `tsc` exit 0, ESLint 0 errors, `vitest run` 76 files / 749 tests passed; UT-SD-F01…F06 in `frontend/test/trade-document/soft-delete.test.ts`, IT-SD-F01/F02 in `frontend/test/purchase/purchase-page.integration.test.ts`. Open (FE-SD-004): signed-in smoke of each daybook and detail, manual-tester TC-SD-01…06, both security reviews on the final frontend revision (parent).

> **Owner change 2026-11-06 (after rev 1 approval):** there is no Active/Deleted toggle and deleted documents show nowhere in the UI. FE-SD-001's Deleted view and Restore entry point are withdrawn; see changelog 2026-11-06-transaction-soft-delete-frontend.md.
