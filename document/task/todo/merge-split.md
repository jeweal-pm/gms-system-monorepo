# TODO: merge-split

- feature-id: `merge-split`
- revision: 1 (UI rev 1); SA revision 1 (**approved**)
- source-ui-revision (backend items): 1 with the Q-MS-01…16 defaults
- status: **approved** 2026-11-27; frontend FE-MS-001…008 implemented 2026-11-27 against the SA rev 1 contract with typed fixtures (live-contract check pending backend BE-MS-004/005); backend in progress
- request: owner 2026-11-27 (Thai text verbatim in the [ui-spec](../../apps/frontend/merge-split/ui-spec.md)): page like Load to Stock that merges or splits our own stock; one source button **From Stock** listing our own stock only
- source: no Merge/Split design; layout from the Load to Stock design (owner images 176–191) and `frontend/src/features/load-to-stock/**`
- ui-spec: [ui-spec.md](../../apps/frontend/merge-split/ui-spec.md)
- dependencies: [dependencies.md](../../apps/frontend/merge-split/dependencies.md): **no new package**
- backend-bundles: [inventory/merge-split SA rev 1](../../apps/backend/inventory/merge-split/decisions.md) (pending-review): [architecture](../../apps/backend/inventory/merge-split/architecture.md), [api-contract](../../apps/backend/inventory/merge-split/api-contract.md), [authorization](../../apps/backend/inventory/merge-split/authorization.md), [database-diagram](../../apps/backend/inventory/merge-split/database-diagram.md), [sequence-diagram](../../apps/backend/inventory/merge-split/sequence-diagram.md), [error-handling](../../apps/backend/inventory/merge-split/error-handling.md), [dependencies](../../apps/backend/inventory/merge-split/dependencies.md), [testing](../../apps/backend/inventory/merge-split/testing.md); [ADR-0060](../../adr/0060-merge-split-own-stock.md) (Proposed); SA questions SQ-MS-01…06 with defaults
- approved-revision: UI 1 + SA 1 + ADR-0060 (all Q-MS-01…16 and SQ-MS-01…06 defaults)
- approved-by: owner
- approved-at: 2026-11-27
- approval-evidence: owner 2026-11-27 "frontend backend เริ่มทำ Merge/Split เลย ไม่ต้องรัน sec กับ audit" (approves UI rev 1 + SA rev 1 + ADR-0060 with all Q-MS / SQ-MS defaults; security reviews waived)
- sa-approved-revision: 1
- review-bundle:
  - [ui-spec](../../apps/frontend/merge-split/ui-spec.md)
  - [open-questions](../../apps/frontend/merge-split/open-questions.md)
  - [conventions](../../apps/frontend/merge-split/conventions.md)
  - [data-fetching](../../apps/frontend/merge-split/data-fetching.md)
  - [design-system](../../apps/frontend/merge-split/design-system.md)
  - [error-handling](../../apps/frontend/merge-split/error-handling.md)
  - [form-guidelines](../../apps/frontend/merge-split/form-guidelines.md)
  - [testing](../../apps/frontend/merge-split/testing.md)
  - [dependencies](../../apps/frontend/merge-split/dependencies.md)
  - [flow](../../diagram/merge-split-flow.md)
- related ADRs: ADR-0045, ADR-0050, ADR-0052, ADR-0053, ADR-0055, ADR-0056, ADR-0057, ADR-0059, ADR-0060 (Proposed)

## Decisions needed from the owner

Approve UI rev 1 with the Q-MS-01…16 defaults (key ones: Stock ID shown on this page as an exception to Q-LOT-10; only Split and Merge, no None; Split must use the whole available on hand, no remainder; Merge cost = weighted average; merged/split results can be converted again later), and the SA revision/ADR when written.

## Implementation items

Nothing starts before approval. BE items follow SA rev 1 / ADR-0060 (pending-review); order BE-MS-001 → 002 → 003 → 004 → 005/006 → 007. FE items marked **requires-be** need the endpoint live. *Shared* files are serialized through the parent.

| Done | ID | Owner | Task / component | Allowed files | Depends on | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|
| [x] | BE-MS-001 | backend | Inventory migration `20261127100000_merge_split`: `merge_split`, `merge_split_source`, `merge_split_result`, `merge_split_result_photo`, indexes (incl. `merge_split_source_stock_idx`), kinds `SPLIT_OUT/IN/REVERSAL` + `MERGE_OUT/IN/REVERSAL`, grants, rollback SQL; Prisma models | `backend-api-inventory/prisma/schema.prisma`, `prisma/migrations/20261127100000_merge_split/`, `prisma/rollback/20261127100000_merge_split.down.sql` | SA approval | `migrate deploy` clean on dev; kind list is a superset of the latest; no `stock` column change | migration test, IT-MS-B01 |
| [x] | BE-MS-002 | backend | Master: numbering key `merge-split`; new `POST /internal/v1/inventory/stock-ids/issue` (service token, idempotent on documentType + documentId + applySeq, via `issueStockIds`), migration `20261127100000_inventory_stock_id_issue`; inventory client method + `NumberingKey` | master `src/inventory-internal/**` *shared*, `backend-api-master/prisma/**`; inventory `src/platform/master-api.ts` *shared* | BE-MS-001 | resolve returns `MS…`; replay returns the same IDs; other count → 409 | IT-MS-B11 + master unit test |
| [x] | BE-MS-003 | backend | `applyConversion()` / `reverseConversion()`: id-ordered lock, availability + SYNCING checks, set-based source UPDATE (on_hand → consumed), result stock + photo + ledger bulk inserts, cost SA-MS-05, untouched rule SA-MS-11 | `backend-api-inventory/src/modules/stock/convert.ts` (+ test); reuse `src/modules/load-to-stock/cost.ts` read-only | BE-MS-001 | ADR-0060 D3–D11; balance check never fails; Σ result = take; held buckets untouched | UT-MS-B02, IT-MS-B01…B05, IT-MS-B10 |
| [x] | BE-MS-004 | backend | Module routes/schemas/service/repository/read: options, next-number, list, get, create, update, submit, approve, revise, reject, delete, restore; mount | `backend-api-inventory/src/modules/merge-split/**`, `src/app.ts` *shared* | BE-MS-002, BE-MS-003 | matches [api-contract](../../apps/backend/inventory/merge-split/api-contract.md) and [error-handling](../../apps/backend/inventory/merge-split/error-handling.md); no HTTP inside a transaction | UT-MS-B01, IT-MS-B04, IT-MS-B09 |
| [x] | BE-MS-005 | backend | From Stock `GET /merge-split/stock` (own, on hand > 0, location/q, exclude, Pending exclusion, keyset ≤ 50) and photos (`/merge-split/stock/{uuid}/photos`, upload to `files/merge-split/`, download) | `src/modules/merge-split/{read,photos}.ts`, `src/modules/stock/lots.ts` (optional shared filter), `src/modules/load-to-stock/photos.ts` (parameterize module/source only) | BE-MS-004 | one statement per page; never Memo Stock, REVERSED or 0 on hand; download only for linked files | IT-MS-B06, IT-MS-B09 |
| [x] | BE-MS-006 | backend | Approval summary/pending/waiting count for `merge-split`; `CARD_KINDS` six kinds, `DOCUMENT_TYPES["merge-split"]` (source `MERGE_SPLIT`), `card.ts` join on `merge_split` (closes BE-SC-102 for Merge/Split) | `src/platform/approval/**` *shared*, `src/modules/stock/card-kinds.ts` *shared*, `src/modules/stock/card.ts` | BE-MS-003 | Approve Center lists pending; Stock Card OUT/IN with MS link; Stock Value total unchanged | UT-MS-B03, IT-MS-B07, IT-MS-B08 |
| [x] | BE-MS-007 | backend | Tests per [backend testing](../../apps/backend/inventory/merge-split/testing.md); inventory + affected master suites green; record the 200-row apply latency | tests beside sources | BE-MS-001…006 | all pass; commands recorded | vitest |
| [x] | FE-MS-001 | frontend | Route + page shell: header (MS number preview, status, actions, Print), Doc Date, Ref., Document Note, daybook, access states | `frontend/src/app/(app)/inventory/merge-split/**`, `frontend/src/features/merge-split/components/MergeSplitPage.tsx` | approval; data **requires-be** BE-MS-004 | ui-spec H-01…H-05, I-01/02, states | IT-MS-01 |
| [x] | FE-MS-002 | frontend | Form model: modes, Split balance, C-01/C-02/C-03, S-01…S-06, totals | `frontend/src/features/merge-split/form.ts` (+ test) | — | ui-spec Calculations + Validation | UT-MS-01…04 |
| [x] | FE-MS-003 | frontend | From Stock: `MemoStockModal` variant `source: "merge-split"` (Stock ID rows, available pcs/weight, location filter, cost, sale price) | `memo-stock-modal.tsx` *shared*, `features/merge-split/api.ts` (+ tests) | **requires-be** BE-MS-005 | P-01; other callers unchanged | IT-MS-02, REG |
| [x] | FE-MS-004 | frontend | Source table + mode dialog (Split / Merge only) | `features/merge-split/components/source-table.tsx`, `mode-dialog.tsx` (+ tests) | FE-MS-002 | T-04, P-02 | IT-MS-03 |
| [x] | FE-MS-005 | frontend | Result table: Split groups + "+ Split" + balance chip, Merge single row, Totals + mismatch banner, location portal select, photo card, row panel on `ItemEditorShell` | `features/merge-split/components/result-table.tsx`, `result-row-panel.tsx` (+ tests) | FE-MS-002 | R-01…R-08, M-01…M-11 | IT-MS-04 |
| [x] | FE-MS-006 | frontend | API adapter + wiring: save/submit/delete/restore, error mapping, query invalidation (stock picker, stock-card, stock-value) | `features/merge-split/api.ts` (+ test) | **requires-be** BE-MS-004 | approval OFF → Approved; ON → Draft/Pending; 409 keeps edits | UT-MS-05, IT-MS-05 |
| [x] | FE-MS-007 | frontend (parent-serialized) | Navigation Inventory › Merge/Split → `/inventory/merge-split`; Approval Setup type; Approve Center panel available; flow status | `features/home/navigation.ts`, `features/approval-setup/model.ts`, `features/approve-center/menus.ts`, `features/trade-document/flow-status.ts` *shared* | BE-MS-006 | sidebar opens the page; panel shows count; Approve/Revise/Reject work | IT-MS-06 |
| [x] | FE-MS-008 | frontend | Tests per [testing](../../apps/frontend/merge-split/testing.md); full frontend suite green | tests beside sources | FE-MS-001…007 | all pass | vitest |
| [ ] | FE-MS-009 | parent | Both security reviews on one source revision + manual-tester report | `document/task/investigation/`, `document/testing/user-check/` | BE-MS-007, FE-MS-008 | recorded once | review records |

Frontend implementation note (2026-11-27): FE-MS-001…008 done against the SA rev 1 [api-contract](../../apps/backend/inventory/merge-split/api-contract.md) with typed fixtures and an in-memory contract server (`frontend/test/merge-split/**`); the **live-contract check is pending** until BE-MS-004/005 run. FE-MS-009 security reviews are **waived** by the owner's instruction ("ไม่ต้องรัน sec กับ audit"); the manual-tester report is not run (owner rule: hand off on passing tests, no browser checks). Deviation: the SA rev 1 options carry no Stone Master lists, so the row panel edits stone / grading as text and keeps the source Stone Code.

Backend implementation note (2026-11-27): BE-MS-001…007 done (owner direct approval, no audits per owner). Contract as [api-contract](../../apps/backend/inventory/merge-split/api-contract.md) except the internal Stock ID issue, which reuses the existing master `PUT /internal/v1/inventory/stock-id-issues/merge-split/{documentId}` + `partner.stock_id_issue` (allow-list widened by `20261127100000_inventory_stock_id_issue`) instead of a new endpoint/table; additive response detail fields are listed in the backend [testing](../../apps/backend/inventory/merge-split/testing.md#implementation-result-2026-11-27). Results and commands are in that record.
