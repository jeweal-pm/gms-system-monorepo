# TODO: load-to-stock

- feature-id: `load-to-stock`
- revision: 1 (UI rev 1); SA revision 1 (**approved** 2026-11-17)
- source-ui-revision (backend items): 1 + owner answers 2026-11-16
- status: **approved** 2026-11-17 — owner 2026-11-17 "อนุมัติ UI rev 1 + ADR-0052 + SA rev 1" (open questions take the recorded owner answers; unanswered rows take their defaults; Q-LS-32 notifications as explained: approvers on Send to approve, creator on Approve/Revise/Reject); in progress
- request: owner 2026-11-16 (Thai text recorded verbatim in [ui-spec](../../apps/frontend/load-to-stock/ui-spec.md))
- source: [source/01…05](../../apps/frontend/load-to-stock/source/) (Add From Purchase picker, load-mode dialog, page in None / Split / Merge; desktop ≈1400 x 795 px each)
- ui-spec: [ui-spec.md](../../apps/frontend/load-to-stock/ui-spec.md)
- dependencies: [dependencies.md](../../apps/frontend/load-to-stock/dependencies.md): **no new package**; backend **new service** (owner) → SA + infra
- backend-bundles: [inventory/load-to-stock SA rev 1](../../apps/backend/inventory/load-to-stock/architecture.md) (pending-review; [decisions](../../apps/backend/inventory/load-to-stock/decisions.md), [ADR-0052](../../adr/0052-load-to-stock-in-backend-api-inventory.md) Proposed, open questions Q-LS-23…36; owner answers 2026-11-16 to Q-LS-23/26/28/29/30/33 applied, Q-LS-34…36 new); infra/devops requirement [load-to-stock-infra-devops](../../coordination/handoffs/load-to-stock-infra-devops.md)
- sa-approved-revision: SA revision 1 (2026-11-17, ADR-0052 Accepted)
- sa-approved-by: none
- sa-approved-at: none
- sa-approval-evidence: none
- approved-revision: none
- approved-by: none
- approved-at: none
- approval-evidence: none
- review-bundle: [ui-spec](../../apps/frontend/load-to-stock/ui-spec.md), [open-questions](../../apps/frontend/load-to-stock/open-questions.md) (Q-LS-01…22), [conventions](../../apps/frontend/load-to-stock/conventions.md), [data-fetching](../../apps/frontend/load-to-stock/data-fetching.md), [dependencies](../../apps/frontend/load-to-stock/dependencies.md), [design-system](../../apps/frontend/load-to-stock/design-system.md), [error-handling](../../apps/frontend/load-to-stock/error-handling.md), [form-guidelines](../../apps/frontend/load-to-stock/form-guidelines.md), [testing](../../apps/frontend/load-to-stock/testing.md), [flow](../../diagram/load-to-stock-flow.md), [SA handoff](../../coordination/handoffs/load-to-stock-sa.md)
- related ADRs: [ADR-0050](../../adr/0050-approval-setting-draft-send-to-approve.md) (approval / edit-until-used), [ADR-0051](../../adr/0051-purchase-lines-without-stock-id.md) (Stock ID at Load to Stock), [ADR-0048](../../adr/0048-line-photos-on-stock-documents.md) (line photos), [ADR-0045](../../adr/0045-transaction-document-soft-delete.md) (soft delete)

## Implementation items

All items wait for owner approval of UI rev 1. Items marked **requires-sa** also wait for the SA bundle and its separate approval (new service).

| Done | ID | Owner | Task / component | Allowed files | Depends on / requires-sa | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|
| [x] | FE-LS-001 | frontend | Pure form model: header `mode` (one per document, owner Q-LS-07) and rows with `sources[]` (no per-row batch or mode). Merge calc (mixed units, highest-priced line, Q-LS-08/27), Split allocation, partial-load cost by price unit (owner Q-LS-12), validation schema (Stock Price and Sale Price required) | `frontend/src/features/load-to-stock/form.ts`, `form.test.ts` | UI approval | UT-LS-01…04 pass with design numbers (1,387,835.60 / 29.30 = 47,366.40; max THB/pc → PU2610-038) | vitest |
| [x] | FE-LS-002 | frontend | Route + page shell: header (H-01…05), header card (I-01…04), access, loading / not found | `frontend/src/app/**/inventory/load-to-stock/**`, `features/load-to-stock/components/LoadToStockPage.tsx` | FE-LS-001; data **requires-sa** | Breadcrumb Home › Inventory › Load to Stock; no-VIEW message; preview No. grey; Duplicate disabled (Q-LS-17) | IT-LS-05 |
| [x] | FE-LS-003 | frontend | Item table (T-01, T-04; IT-1…10) | `features/load-to-stock/components/load-source-table.tsx` (+ test) | FE-LS-001 | Shows picked PU lines with "From {PU} · date", remaining pcs, PU price + THB amount; DV-03/04 handled by server data | IT |
| [x] | FE-LS-004 | frontend | Add From Purchase picker P-01 | `features/load-to-stock/components/purchase-line-picker.tsx` (+ test) | **requires-sa** (`purchaseLines`) | Columns per spec; search/date range; excludes lines on the document; only remaining > 0; OK disabled until ticked; Esc/✕ focus return | IT-LS-01, TC-LS-01/06/08 |
| [x] | FE-LS-005 | frontend | Load-mode dialog P-02 | `features/load-to-stock/components/load-mode-dialog.tsx` (+ test) | FE-LS-001/004 | Picked-line summary; None/Split/Merge cards with computed texts; Merge disabled with reason (Q-LS-08); Back to list keeps ticks; button "Create N load rows" / "Create 1 load row" | IT-LS-02 |
| [x] | FE-LS-006 | frontend | Load table — None (L-03, LT-1…13, L-07/08) | `features/load-to-stock/components/load-table.tsx` (+ test) | FE-LS-005 | One row per line; pcs/weight ≤ remaining; remove returns qty; Totals computed (DV-05); no empty rows (Q-LS-15) | IT-LS-04, TC-LS-02 |
| [x] | FE-LS-007 | frontend | Load table — Split groups (S-01, + Split, group trash) | `features/load-to-stock/components/split-group-row.tsx`, `load-table.tsx` | FE-LS-006 | + Split adds child with unallocated remainder; Σ ≤ remaining; group texts per spec; trash confirm | IT-LS-03, TC-LS-03 |
| [x] | FE-LS-008 | frontend | Merge row + More panel (L-05, L-09 M-01…12, L-02 photos/note) | `features/load-to-stock/components/*`; additive Load `DocumentKind` option in `features/quotation/components/items/ItemEditorPanel.tsx` (parent-serialized) | FE-LS-006; photos **requires-sa** | Merge pcs/weight locked; details editable; panel has no discount; Price read-only; **Stock Price and Sale Price both required, start empty** (owner Q-LS-13); PU line photos copied as initial photos, changeable, ≤ 5 (Merge: the highest-priced source) (owner Q-LS-14) | IT, TC-LS-04 |
| [ ] implemented-pending-live | FE-LS-009 | frontend | Approval flow + Daybook + edit-until-used (H-05, R-01) | `LoadToStockPage.tsx` using `trade-document/approval-flow.tsx` | **requires-sa** (`submit`, `inUse`, list status) | ADR-0050 buttons/chips/dots; Pending locked; OFF + `inUse` disables Edit/Delete | IT-LS-05, TC-LS-05/07 |
| [ ] implemented-pending-live | FE-LS-010 | frontend | API hooks + Save/Send/Delete wiring, error mapping | `features/load-to-stock/api.ts` (+ test) | **requires-sa** (contract) | Payload per contract; row errors "Row n: …"; conflict keeps edits; invalidates picker | UT-LS-05, IT-LS-06 |
| [ ] implemented-pending-live | FE-LS-011 | frontend | Approve Center: enable Load to Stock (preview, approve/revise/reject) | `frontend/src/features/approve-center/**` (parent-serialized) | **requires-sa** | Menu availability "available"; read-only preview | approve-center tests |
| [x] | FE-LS-012 | frontend | Navigation: real page href + activePrefix | `frontend/src/features/home/navigation.ts` (parent-serialized) | FE-LS-002 | Sidebar Load to Stock opens the page; active state correct (DV-10) | navigation tests |
| [ ] | FE-LS-013 | frontend | Verification: tests, both security roles once, manual-tester | `document/apps/frontend/load-to-stock/testing.md` | all | Suites pass; reviews recorded; TC-LS-01…08 | testing.md |
| [x] | SA-LS-01…16 | sa | New-service design (see handoff) | `document/apps/backend/inventory/load-to-stock/`, `document/adr/0052-*` | — | SA rev 1 bundle written 2026-11-16, **pending-review** | owner approval (none yet) |
| [ ] implemented-pending-live | FE-LS-014 | frontend | Approval Setup page + `useApprovalSetting("load-to-stock")` read the three inventory types from `GET/PUT /api/inventory/v1/approval-settings` (Q-LS-25 default) | `frontend/src/features/approval-setup/**`, `features/trade-document/approval-flow.tsx` (parent-serialized) | **requires-sa** approval; BE-LS-008 | Same switches/counts as today; master list no longer has those keys | approval-setup tests |
| [ ] implemented-pending-live | FE-LS-015 | frontend | Notification bell: second feed + SSE from inventory, unread counts added (ADR-0049 D10, Q-LS-32) | `frontend/src/features/notifications/**` (parent-serialized) | **requires-sa**; BE-LS-010 | Two EventSources, refetch per feed, sign-out closes both | notification tests |
| [x] | FE-LS-016 | frontend | Inventory REST client: same-origin fetch to `/api/inventory/v1`, error envelope mapping, token renew on 401, response Zod schemas | `frontend/src/features/load-to-stock/api.ts`, shared `lib/inventory-client.ts` | **requires-sa** | No direct service URL; codes mapped per backend error-handling | UT |

### Backend, infra and devops items (SA revision 1, pending-review: start only after owner approval of the SA bundle)

Bundle: [inventory/load-to-stock](../../apps/backend/inventory/load-to-stock/architecture.md). Every item: tests per [testing](../../apps/backend/inventory/load-to-stock/testing.md) incl. the N+1 budgets; capacity per ADR-0052 D14.

| Done | ID | Owner | Task | Allowed files | Depends on | Acceptance | Verification |
|---|---|---|---|---|---|---|---|
| [x] | BE-LS-001 | backend (auth) | Reader role `gms_inventory_authz_reader` grants (SELECT `auth.current_authorization`, `auth.permission_holders`); accept `INVENTORY_AUTH_SERVICE_TOKEN` on the license endpoint | `backend-api-auth/prisma/**` (parent-serialized), `backend-api-auth/src/**` license guard | SA approval; INF-LS-001 secret names | Role has no other privilege; existing tokens unchanged | auth tests + privilege query |
| [x] | BE-LS-002 | backend (master) | Migration: `purchase_line.loaded_*` + CHECK + loadable index, `load_allocation`, `load_allocation_line`, `load_stock_id`, `document_numbering.external_used_at`, delete 3 inventory approval rows + narrow CHECK; down script | `backend-api-master/prisma/**` | SA approval | IT-LS-B01 | disposable PG |
| [x] | BE-LS-003 | backend (master) | `issueStockIds` fixed advisory lock + clock read after the lock (Memo Receive + Load) | `backend-api-master/src/trade-document/memo-receive.service.ts` | BE-LS-002 | IT-LS-B08; Memo Receive suite unchanged | master suite |
| [x] | BE-LS-004 | backend (master) | Internal module `/internal/v1/inventory/*` (reference, vendors, search, batch, stone-codes, numbering resolve, allocation PUT/GET, PU photos/content) + `InventoryServiceTokenGuard` | `backend-api-master/src/inventory-internal/**`; `app.module.ts`/`main.ts` parent-serialized | BE-LS-002/003 | UT-LS-B07/B08, IT-LS-B02/B06/B10/B11, NP-LS-01/02/05 | master suite |
| [x] | BE-LS-005 | backend (master) | Purchase update/delete `PURCHASE_IN_USE`; Document Setup "used" includes `external_used_at`; approval types narrowed | `backend-api-master/src/{purchase,document-setup,approval-setting}/**` | BE-LS-002 | IT-LS-B10/B11; approval-setup suite | master suite |
| [x] | BE-LS-006 | backend (inventory) | Scaffold `backend-api-inventory` (Hono, node-server, Prisma schema `inventory`, config, pino, health, ported auth, CSRF, error envelope, master client, storage scope); Dockerfile requirements for infra | `backend-api-inventory/**` (package.json/Dockerfile parent-serialized) | SA approval; packages approved | UT-LS-B05/B06, IT-LS-B15 | vitest, tsc, eslint |
| [x] | BE-LS-007 | backend (inventory) | Inventory migration: tables of database-diagram part A, grants (`stock_movement` INSERT/SELECT only), seeds (approval settings only; no locations) | `backend-api-inventory/prisma/**` | BE-LS-006 | IT-LS-B01 | disposable PG |
| [x] | BE-LS-008 | backend (inventory) | Approval platform: settings GET/PUT with guard, Approve Center summary/pending | `backend-api-inventory/src/platform/approval/**` | BE-LS-007 | IT-LS-B14/B17, NP-LS-03 | vitest |
| [x] | BE-LS-009 | backend (inventory) | Load to Stock module: options (Company Profile currency), vendors, next-number, search (remaining pcs > 0 only), list, get, create, update, submit, approve, revise, reject, delete (no restore, Q-LS-33); stock component; saga + sweep + re-drive command | `backend-api-inventory/src/modules/{load-to-stock,stock,location}/**`, `src/platform/sync/**` | BE-LS-004/007/008 | UT-LS-B01…B04, IT-LS-B03…B07/B09/B12, NP-LS-02/04/05 | vitest + measurement |
| [x] | BE-LS-013 | backend (inventory + master) | **Consume Location Master** ([ADR-0053](../../adr/0053-location-master.md), merged): master `GET /internal/v1/inventory/reference` adds `locations: string[]` (active names, reuse the `options.locations` query); `POST /internal/v1/inventory/master-data/resolve {stoneCodeIds, locationNames}` (case-insensitive, returns master spelling); inventory stores `location varchar(40)` on rows and stock (no id). Also stock phase-1 schema (buckets + CHECK, `stock_hold`, in-use rule, ADR-0052 D15) | `backend-api-master/src/inventory-internal/**`, `backend-api-inventory/src/modules/stock/**`, `prisma/**` | BE-LS-004/007 | IT-LS-B18/B19 | vitest |
| [x] | BE-LS-010 | backend (inventory) | Notifications feed + SSE (`streamSSE`), recipients from `auth.permission_holders`, 90-day bounded cleanup (+ DONE sync ops after 30 days) | `backend-api-inventory/src/platform/notification/**` | BE-LS-007 | IT-LS-B16, NP-LS-07 | vitest |
| [x] | BE-LS-011 | backend (inventory) | Photos: upload/get/from-purchase-line via `@gms/storage` (`files/load-to-stock/`), limiter, dedupe, permanent retention | `backend-api-inventory/src/modules/load-to-stock/photos/**` | BE-LS-004/006 | IT-LS-B13, NP-LS-06 | vitest |
| [ ] | BE-LS-012 | backend | Verification: full master + inventory suites, N+1 evidence in testing.md, both security reviews once on the final revision, hand the verified contract to frontend | `document/apps/backend/inventory/load-to-stock/testing.md` | all BE-LS | all pass | report |
| [x] | FE-LS-017 | frontend | Load-row Location select with the existing PO/Purchase location dropdown pattern (ADR-0053, `string[]` options), required, **starts empty** (not defaulted from the PU line; the PU location stays visible in the Item table IT-3); options from `GET /load-to-stock/options.locations`; a saved row's stored name stays selectable when it is no longer active | `frontend/src/features/load-to-stock/**` | BE-LS-013 | Required select empty at start; inactive names not offered except a row's stored value | IT |
| [ ] | INF-LS-001 | infra | Container/network/secret/storage/nginx bundle and config per the [infra/devops requirement](../../coordination/handoffs/load-to-stock-infra-devops.md) | `document/infra/services/backend-api-inventory/1/**`; Compose/nginx parent-serialized | research may start on the draft; config after SA approval | security bundle + applied config checks | infra checks |
| [ ] | DO-LS-001 | devops | CI + service image target for `backend-api-inventory` | `.github/**` (parent-serialized), `document/devops/**` | INF-LS-001, BE-LS-006 | CI builds/typechecks/tests the new workspace; no publication | devops checks |

## Approval and revisions

| Revision | Date | Change | Status |
|---|---|---|---|
| 1 | 2026-11-16 | Initial UI spec from source 01–05 + owner text; Q-LS-01…22 | draft, awaiting owner |
| SA 1 (ADR-0053 alignment) | 2026-11-17 | Location Master merged as ADR-0053: rows/stock store the location **name** (varchar(40)), `reference.locations: string[]`, `master-data/resolve` by name; load row location starts empty, PU location shown in the Item table; BE-LS-013/FE-LS-017 updated | pending-review |
| SA 1 (owner follow-ups) | 2026-11-16 | Location Master owned by master (other branch); inventory stores id + snapshot, validates via `master-data/resolve`; BE-LS-013/FE-LS-017 re-scoped; Q-LS-34/36 answers recorded; D15 two-stock picker behaviour | pending-review |
| SA 1 (owner answers) | 2026-11-16 | Applied owner answers Q-LS-23/26/28/29/30/33: company-profile currency, pcs-0 lines hidden, Location Master list (no seed), no Restore, own stock in From Stock phased (ADR-0052 D15); added BE-LS-013, FE-LS-017; new Q-LS-34…36. Phases 2a/2b/3 of D15 are future revisions, not scheduled here | pending-review |
| SA 1 | 2026-11-16 | SA revision 1: new service `backend-api-inventory`, ADR-0052, BE-LS-001…012, INF-LS-001, DO-LS-001, FE-LS-014…016; Q-LS-23…33 | pending-review |

Owner review needed: approve UI revision 1 with the Q-LS defaults (or answer specific IDs). UI approval does not approve the later SA bundle.

## Handoffs, evidence, and completion

- SA handoff: [load-to-stock-sa.md](../../coordination/handoffs/load-to-stock-sa.md) (SA rev 1 delivered, pending-review). Infra/devops: [load-to-stock-infra-devops.md](../../coordination/handoffs/load-to-stock-infra-devops.md).
- UI text aligned with the owner answers by ui-spec on 2026-11-16:
  - M-09/M-10 and FE-LS-008: Stock Price and Sale Price required, start empty.
  - L-02 and M-12: PU photos copied, ≤ 5; Merge uses the highest-priced source.
  - FE-LS-001 and data-fetching: one header `mode`, no `batchId`.
  - P-02 and error-handling: later picks reuse the mode; Merge allows mixed units.
  - Q-LS-03: one vendor per document. Q-LS-12: cost follows the price unit.
  - data-fetching uses the names in the SA api-contract.
- Still for ui-spec after the 2026-11-16 ADR-0052 answers: Location select starts empty (Q-LS-28); header Currency read-only = Company Profile currency (Q-LS-23); no Restore (Q-LS-33); Merge button text "Merge · create 1 load row" (source 06); Location Master page belongs to the other branch (master).
- Backend evidence (2026-11-17, backend role): BE-LS-001…011 and BE-LS-013 implemented and verified — results, case mapping, N+1 evidence and implementation notes in [inventory testing](../../apps/backend/inventory/load-to-stock/testing.md#results--backend-implementation-be-ls-001013-2026-11-17): auth 121 passed, master 776 passed, inventory 43 passed (disposable PostgreSQL 18.6 with the provisioned roles), tsc + ESLint clean, `pnpm audit --prod` without Hono advisories (hono 4.13.18, @hono/node-server 2.1.7; INV-20261117-001). BE-LS-012 open only for the two security reviews (parent-routed) and the production measurement (idle RSS / 200-row apply on the 4 GB host). Changelog: [2026-11-17-load-to-stock-backend](../../changelog/2026-11-17-load-to-stock-backend.md).

## Frontend implementation 2026-11-17 (UI rev 1 + SA rev 1)

- Done (unit + integration tests pass against contract fixtures; no live backend): FE-LS-001…008, 012, 016, 017.
- Implemented, pending live verification once `backend-api-inventory` runs behind nginx: FE-LS-009 (approval flow / Send to approve / in-use), FE-LS-010 (Save / Send / Delete wiring and error codes), FE-LS-011 (Approve Center inventory menu), FE-LS-014 (Approval Setup + `useApprovalSetting` from inventory), FE-LS-015 (second notification feed + inventory EventSource).
- FE-LS-013 open: security reviews (parent, once) and manual-tester.
- Evidence: [testing](../../apps/frontend/load-to-stock/testing.md) (frontend `vitest run` 124 files / 1,098 tests pass; eslint 0 errors; `tsc` clean for frontend sources — the 42 remaining errors are the stale master Prisma client for Location Master and stale `.next/types`, outside this change). Changelog: [2026-11-17-load-to-stock-frontend](../../changelog/2026-11-17-load-to-stock-frontend.md).
- Deviations (recorded in testing.md): own row panel instead of a Load `DocumentKind` in `ItemEditorPanel`; Account must be chosen before From Purchase (public search has no vendor per line, so no auto-fill); later picks show P-02 with the document's mode locked (ADR-0052 D7) instead of skipping it; inventory pending rows carry no `version`, so approve/reject/revise read `GET /load-to-stock/{id}` first.

## Corrective work

None. Default pass limit 3 when corrective work starts; ledger to be linked here.
