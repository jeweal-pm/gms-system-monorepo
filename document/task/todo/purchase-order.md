# TODO: purchase-order

- feature-id: `purchase-order`
- revision: 1 (UI rev 1 + SA rev 1)
- status: **in-progress** 2026-11-04 (approved 2026-11-04; owner answers Q-PO-01/06/09/12 recorded the same day)
- request: owner 2026-11-04 "designยังไม่เสร็จเเต่ หน้าเหมือน quotation เลยเเต่ในหน้า purchase order มี approve approveเพื่อส่งรายการสินค้าไปซื้อเข้าในหน้าpuchase หน้า purchase order ไม่สามารถดึงมาจากปุ่ม form stock หรือ memo stock ได้ต้องสร้างเองเท่านั้น"
- branch: `feat/04-11-26-purchase-order` (from `change-to-nginx-with-new-skill-agent`)
- source: no Figma yet; layout of the Quotation page, vendor header and Approve of Memo Receive (Q-PO-13)
- ui-spec: [ui-spec](../../apps/frontend/purchase-order/ui-spec.md)
- review-bundle:
  - [ui-spec](../../apps/frontend/purchase-order/ui-spec.md), [open questions Q-PO-01…13](../../apps/frontend/purchase-order/open-questions.md), [testing](../../apps/frontend/purchase-order/testing.md)
  - [SA decisions](../../apps/backend/master/purchase-order/decisions.md), [API contract](../../apps/backend/master/purchase-order/api-contract.md), [database diagram](../../apps/backend/master/purchase-order/database-diagram.md), [sequence diagram](../../apps/backend/master/purchase-order/sequence-diagram.md)
  - [main flow](../../diagram/purchase-order-flow.md), [ADR-0041](../../adr/0041-purchase-order-document.md) (Accepted)
- backend-bundles: [apps/backend/master/purchase-order/](../../apps/backend/master/purchase-order/)
- dependencies: none new
- infra: one nginx location `/api/v1/purchase-order/photos` (SA-PO-12); no container, image or volume change
- approved-revision: UI rev 1 + SA rev 1 (with the Q-PO defaults and the owner answers)
- approved-by: owner
- approved-at: 2026-11-04
- approval-evidence: owner 2026-11-04: "อนุมัติ purchase-order revision 1"

| Done | ID | Owner | Task | Allowed files | Depends on | Verification |
|---|---|---|---|---|---|---|
| [x] | BE-PO-001 | backend | Migration `20261104090000_purchase_order` + Prisma models (SA-PO-01) | `backend-api-master/prisma/**` | approval | migrate deploy (fresh + dev); no drift |
| [x] | BE-PO-002 | backend | `purchase-order.schemas.ts` (MANUAL only), `PurchaseOrderService` on the engine (vendor adapter, PENDING_APPROVAL, photos hook, approve), numbering `purchaseOrder` + Document Setup `used`, errors, router procedures with `purchase-order` grants, `MasterMenu`, `currency.options` grant (SA-PO-02…10, 13, 14) | `backend-api-master/src/purchase-order/**`, `src/trade-document/**`, `src/document-setup/**`, `src/master/**`, `src/currency/**`, tests | BE-PO-001 | UT-PO-B01, GP-MT-PO, IT-PO-01…03, existing memo / quotation / document-setup tests |
| [x] | BE-PO-003 | backend + parent | Photo routes on the Quotation photo code and shared limiter (SA-PO-11); nginx location in `docker/nginx/gms-dev.conf` and the production profile (parent, SA-PO-12) | `backend-api-master/src/purchase-order/**`, `src/quotation/quotation-photo*.ts` (shared only), `docker/nginx/**` (parent) | BE-PO-002 | IT-PO-03; upload / read through :8080 |
| [x] | FE-PO-001 | frontend | `features/purchase-order`: api.ts (typed `masterTrpc.purchaseOrder.*`, mapping, errors), schema, defaults with `PURCHASE_ORDER_KIND` (no From Stock, no Stock ID; Location kept), form with the vendor header, Save / Edit / Delete / Approve, daybook | `frontend/src/features/purchase-order/**`, `src/features/quotation/**` and `src/features/trade-document/**` (shared flags only), tests | BE-PO-002 | UT-PO-02…04 |
| [x] | FE-PO-002 | frontend | Route `/purchase/purchase-order`; navigation `REAL_PAGE_HREFS["purchase-order"]` | `frontend/src/app/(app)/purchase/**`, `src/features/home/navigation.ts`, tests | FE-PO-001 | UT-PO-01, menu-access tests |
| [~] | FE-PO-003 | frontend + parent | Tests, typecheck, lint; live TC-PO-01; sec-auditor + security-auditor on the final code | — | all | all suites pass |

## Evidence (2026-11-04)

- **backend-api-master**: typecheck and lint clean. Full suite against a disposable PostgreSQL 18.6 (127.0.0.1:55439, `prisma migrate deploy`, removed afterwards): 489 passed, 18 skipped, on two consecutive runs.
  - New: GP-MT-PO + UT-PO-B01 (`test/master/router.test.ts`: exact grant per procedure, CSRF, MANUAL-only lines, location ≤ 40, photos ≤ 5, discount bounds, status enum, `currency.options` with `purchase-order:VIEW`), IT-PO-01…03 (`test/purchase-order/purchase-order.db.integration.test.ts`), UT-PO-B02 (Document Setup `used` counts purchase orders).
  - The first full run had one failure in IT-MOC-02 (memo outstanding customer) while the DB files ran in parallel; it passed alone and on both later full runs, and no PO code touches Memo Out data.
  - `prisma migrate diff` shows only the pre-existing `stored_files (source_type, source_id)` index difference, not from this migration.
- **Migration `20261104090000_purchase_order`**: applied on a fresh database and on the dev database; api-master restarted.
- **nginx**: `location ^~ /api/v1/purchase-order/photos` (6m) added to `docker/nginx/gms-dev.conf` (the only nginx profile in the repo).
- **frontend**: typecheck clean (apart from stale generated `.next/types`), lint 0 errors (2 old warnings), 626 tests.
  - New: UT-PO-01…04 (`test/purchase-order/purchase-order.test.ts`).
  - Shared: `DocumentKind.stockId` gains `"none"` and `locations` gains `"text"` (typed Location); `itemColumns` drops "Stock ID" from the first column's subtitle when there is none. Quotation, Memo Receive and the other documents are unchanged and their tests pass.
- **Not done**: live TC-PO-01 through :8080.
- **Security review** (2026-11-04, same uncommitted revision on base f542171): sec-auditor and security-auditor are both clear, with no INV records. Notes, not findings: a production ingress outside the repo needs the same photo location; the auth catalog already has the `purchase-order` leaf, so roles only need the grants assigned.
