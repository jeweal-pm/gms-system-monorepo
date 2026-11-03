# TODO: memo-outstanding-customer

- feature-id: `memo-outstanding-customer`
- revision: 1 (UI rev 1 + SA rev 1)
- status: **implemented** 2026-11-03 (approved 2026-11-03; dual security review clear; live browser check pending)
- request: owner 2026-11-03 "งาน Memo Outstanding customer ทำเอกสาร adr ออกมาเเล้วเริ่มทำได้เลย" (earlier the same day: "เปิด branches ใหม่ … ไว้สำหรับสร้าง memo outstanding")
- branch: `feat/03-11-26-memo-outstanding-quotation-from-stock`
- source: no new design; the page reuses the approved From Vendor page (memo-outstanding-vendor rev 1)
- review-bundle:
  - [ui-spec](../../apps/frontend/memo-outstanding-customer/ui-spec.md), [open questions Q-MOC-01…10](../../apps/frontend/memo-outstanding-customer/open-questions.md), [testing](../../apps/frontend/memo-outstanding-customer/testing.md)
  - [SA decisions](../../apps/backend/master/memo-outstanding-customer/decisions.md), [API contract](../../apps/backend/master/memo-outstanding-customer/api-contract.md), [database diagram](../../apps/backend/master/memo-outstanding-customer/database-diagram.md), [sequence diagram](../../apps/backend/master/memo-outstanding-customer/sequence-diagram.md)
  - [main flow](../../diagram/memo-outstanding-customer-flow.md), [ADR-0039](../../adr/0039-memo-outstanding-customer-report.md) (Accepted)
- dependencies: none new
- infra: none
- approved-revision: UI rev 1 + SA rev 1 (with the Q-MOC defaults)
- approved-by: owner
- approved-at: 2026-11-03
- approval-evidence: owner 2026-11-03 "งาน Memo Outstanding customer ทำเอกสาร adr ออกมาเเล้วเริ่มทำได้เลย" (documents and start of work in one instruction)

| Done | ID | Owner | Task | Allowed files | Depends on | Verification |
|---|---|---|---|---|---|---|
| [x] | BE-MOC-001 | backend | `customer*` input schemas; `MemoOutstandingService.customerSummary/List/Items/Options` (SA-MOC-02…08); router procedures with `memo-outstanding-customer:VIEW`; `MasterMenu` gets `memo-outstanding-customer` | `backend-api-master/src/trade-document/memo-outstanding*.ts`, `src/master/**`, tests | approval | UT-MOC-B01, GP-MT-MOC, IT-MOC-01…03, existing MOV tests |
| [x] | FE-MOC-001 | frontend | Make the From Vendor components report-generic (config: labels, routes, buckets, sort keys, hooks, storage keys) with From Vendor unchanged; customer adapter + hooks; route `/memo/memo-outstanding/customer`; nav link | `frontend/src/features/memo-outstanding-vendor/**` (shared report), `src/features/memo-outstanding-customer/**`, `src/app/memo/memo-outstanding/customer/**`, `src/features/home/navigation.ts`, tests | BE-MOC-001 | UT-MOC-01…03, existing UT-MOV-* |
| [~] | FE-MOC-002 | frontend + parent | Tests, typecheck, lint; live TC-MOC-01; sec-auditor + security-auditor on the final code | — | all | all suites pass |

## Evidence (2026-11-03)

- **backend-api-master**: typecheck and lint clean. The full suite ran against a disposable PostgreSQL 18.6 (127.0.0.1:55439, migrated, removed afterwards): 466 passed, 18 skipped.
  - GP-MT-MOC (router): only `memo-outstanding-customer:VIEW` is accepted; the vendor and memo-out grants are refused; no Reserve or vendor sort; bounds are enforced.
  - IT-MOC-01…03 (`memo-outstanding-customer.db.integration.test.ts`): approved vs pending documents; a Memo Out Return approval moves quantity into Return and closes the document when everything is back; KPIs, filters, sort, paging, items and options.
  - The From Vendor tests are unchanged and pass.
- **frontend**: typecheck clean (apart from the stale generated `.next/types`), lint 0 errors (2 old warnings), 577 tests.
  - New: UT-MOC-01…03 (`test/memo-outstanding-customer/`).
  - Shared report: `ReportSpec` + `ReportSpecContext` + `OutstandingReport` hooks. From Vendor keeps its storage key `gms.memo-outstanding-vendor.view.v1`, its item cache root and its tests; only the two navigation tests that expected Customer to be a placeholder were updated.
- **Not done**: live TC-MOC-01 through :8080, because the dev stack has no nginx, frontend or auth running. 
- **Security review** (2026-11-03, same uncommitted revision on HEAD 77be6bc): sec-auditor and security-auditor are both clear. One hardening note (summary and list aggregate all approved history before `HAVING`) is the same root cause as the existing INV-20261029-004, which the sec-auditor updated to revision 2 with an addendum. No new INV.
