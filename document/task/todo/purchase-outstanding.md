# TODO: purchase-outstanding

- feature-id: `purchase-outstanding`
- revision: 1 (UI rev 1 + SA rev 1)
- status: **in-progress** 2026-11-06
- request / approval-evidence: owner 2026-11-06, design screenshot + "ทำหน้า purchase outstanding มาโดยสูตรbalance คือ memo - return - purchase ส่วน sale คือ รอย้ายมา purchase (1) ไม่ต้องสนใจ เป็น 1 ธรรมาดา"
- approved-revision: UI rev 1 + SA rev 1 (defaults Q-POS-03…06)
- approved-by: owner
- approved-at: 2026-11-06
- branch: `feat/06-11-26-purchase-merge-outstanding`
- source: [source/01-purchase-outstanding.png](../../apps/frontend/purchase-outstanding/source/01-purchase-outstanding.png)
- review-bundle: [ui-spec](../../apps/frontend/purchase-outstanding/ui-spec.md), [open questions](../../apps/frontend/purchase-outstanding/open-questions.md), [SA decisions](../../apps/backend/master/purchase-outstanding/decisions.md), [ADR-0044](../../adr/0044-purchase-outstanding-report.md)
- dependencies: none new; infra: none

| Done | ID | Owner | Task | Allowed files | Depends on | Verification |
|---|---|---|---|---|---|---|
| [x] | BE-POS-001 | backend | `purchaseOutstanding.*` schemas, service methods (SA-POS-01…06), router with `purchase-outstanding:VIEW`, `MasterMenu` | `backend-api-master/src/trade-document/memo-outstanding*.ts`, `src/master/**`, tests | approval | GP-MT-POS, IT-POS-01 |
| [x] | FE-POS-001 | frontend | Per-report bucket labels in the shared report; `features/purchase-outstanding` adapter + spec; route; nav link | `frontend/src/features/memo-outstanding-vendor/**` (shared labels only), `src/features/purchase-outstanding/**`, `src/app/(app)/purchase-order/purchase-outstanding/**`, `src/features/home/navigation.ts`, tests | BE-POS-001 | UT-POS-01…02, existing report tests |
| [x] | FE-POS-002 | frontend + parent | Tests, typecheck, lint; both security reviews | — | all | all suites pass |

## Evidence (2026-11-06)

- **backend-api-master:** typecheck and lint clean. Full suite on a disposable PostgreSQL 18.6: 540 passed, 18 skipped (two full runs). New: GP-MT-POS (`test/master/router.test.ts`), IT-POS-01 (`test/purchase/purchase.db.integration.test.ts`: Memo / Return / Purchase / Sale / Balance after a merged purchase, balance value, KPI, leaves the list when all is bought). The existing IT-MOC-02 failed once on a fresh database and passed on three reruns and both full runs (flaky, not in this change).
- **frontend:** typecheck clean (apart from stale `.next/types`), lint 0 errors (2 old warnings), 726 tests. New: UT-POS-01/02 (`test/purchase-outstanding/`). Shared report: optional `ReportSpec.bucketLabels` + `bucketLabel()`; From Vendor / From Customer unchanged. UT-PO-01 now expects the real Purchase Outstanding page.
- **Dev:** api-master and frontend restarted; `/purchase-order/purchase-outstanding` 200, `purchaseOutstanding.summary` 401 without a session.
- **Security review** (same uncommitted revision): sec-auditor and security-auditor both clear, no new INV. Advisory: summary/list aggregate the whole approved history when no date filter is set — the same root cause as INV-20261029-004 (scope note added there).
- **Not done:** live check in the browser.
