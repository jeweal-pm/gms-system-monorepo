# Frontend acceptance and verification: sale

- UI revision: 1 (pending-review)
- Reference: owner text 2026-11-17 + the shipped Reserve / Purchase pages (no image)
- Relevant TODO / API / SA revisions: [todo/sale.md](../../../task/todo/sale.md); SA bundle pending ([handoff](../../../coordination/handoffs/sale-sa.md))

## Automated coverage

Follow [automated testing](../../../workflow/automated-testing.md). FE-SL-001…010 run 2026-11-20: full suite `npx vitest run` 130 files / 1,150 tests, 1,149 pass; UT-AS-09 fails only with the separate uncommitted `ApprovalSetupPage.tsx` edit (passes with HEAD's file). Earlier: 2026-11-18 128 files / 1,133 pass; `npx tsc --noEmit -p .` clean. `test/trade-document/document-form-pickers.test.ts` now expects Purchase and Sale as the two second-picker pages.

| Target / behavior | Unit case ID and test path | Integration case ID and test path | Boundary / fixture | Command and result |
|---|---|---|---|---|
| Shared picker shell move (Purchase unchanged) | `test/purchase/purchase-picker.test.ts` (import path only); UT-SL-01a `test/trade-document/stock-picker.test.ts` | IT-SL-01 `test/purchase/**` suite still passes | Purchase fixtures; flat Sale-like rows | `npx vitest run test/purchase test/trade-document/stock-picker.test.ts`: pass (2026-11-18) |
| Sale form model: schema, `toSaleInput`, source keys, caps, reserve-line → line mapping, price prefill | UT-SL-01…04 `test/sale/sale-form.test.ts` | — | 0 / cap / cap+1 qty; price 0; 201 rows | `npx vitest run test/sale`: pass (2026-11-18) |
| Sale page config: button order From Reserve then From Stock, blocked toast, empty-row opens From Reserve, no Add row; access / not found / not-available states | UT-SL-05 `test/sale/sale-page.integration.test.ts` | IT-SL-02 `test/sale/sale-page.integration.test.ts` (typed test binding) | no customer / currency; no VIEW; no binding | pass (2026-11-18) |
| Add From Reserve picker: columns, search, excluded lines, OK disabled, live query | — | IT-SL-03 `test/sale/sale-pickers.test.ts` | empty, filtered, excluded, error, Load more (seeded `reserve-lines` page) | pass (2026-11-20) |
| From Stock picker reuse (`MemoStockModal`, every vendor, no prices, picked items left out) | — | IT-SL-04 `test/sale/sale-page.integration.test.ts` (live binding) | mixed rows | pass (2026-11-20) |
| Customer/currency change clears From Reserve rows only | UT-SL-06 `test/sale/sale-form.test.ts` | IT-SL-05 `test/sale/sale-page.integration.test.ts` (`createReserveRowGuard`) | mixed rows; OK / Cancel; reset | pass (2026-11-18) |
| REST adapter, `fromSale` / `saleFlow`, error mapping (`SALE_*`, exceeds, reference, conflict, deleted, busy, master down), photos | UT-SL-07a…d `test/sale/sale-api.test.ts` | IT-SL-02 live route (seeded caches) | each code; empty rows before picked rows | pass (2026-11-20) |
| Navigation `REAL_PAGE_HREFS.sale`; approval type `sale` in flow / Approve Center / Approval Setup / notifications (IT-SL-06 `test/sale/sale-platform.integration.test.ts`) | UT-SL-08 `test/home/home-links.test.ts`, `test/sale/sale-page.integration.test.ts` (navigation); approval type with FE-SL-009 | IT-SL-02b UI-only page, no queries created | — | navigation pass (2026-11-18) |

- Browser check: owner instruction 2026-11-20 "skip the browser check (no headless Chrome, no screenshots, no dev data creation)" arrived after the check had already run; its results are kept for the record and no further browser checks follow. Dev data it created: Draft Sale No. 1 (`01a1f6bc-7efd-7a58-8a41-0e3c17b2c4a6`, customer C008, one RS-1001 line); nothing approved or consumed.

## Security review before handoff

| Reviewer | Source revision / changed scope | Status | Evidence / ticket IDs |
|---|---|---|---|
| `sec-auditor` | — | not run | — |
| `security-auditor` | — | not run | — |

## UI acceptance

| Case ID | TODO / component | Starting state | User actions | Expected result | Viewport / keyboard | Evidence / result |
|---|---|---|---|---|---|---|
| TC-SL-01 | FE-SL-002 | user with `sale:VIEW` | open Sale from sidebar | `/sale/sale`, breadcrumb Home › Sale › Sale, number preview SL…, buttons From Reserve then From Stock | 1920×1080 | not run |
| TC-SL-02 | FE-SL-002 | no VIEW | open page | "You don't have permission to view sales." | — | not run |
| TC-SL-03 | FE-SL-004 | no customer | click From Reserve | toast "Choose a customer first", no dialog | keyboard Enter | not run |
| TC-SL-04 | FE-SL-004 | customer with an approved Reserve (2 lines) | From Reserve, tick 1, OK | row filled with Stock ID, "from {RS No.}", open qty, reserve price; toast "Added 1 item from Reserve"; reopening hides that line | Esc closes, focus returns | not run |
| TC-SL-05 | FE-SL-005 | any customer | From Stock, tick 2, OK | 2 rows, Location Memo, Sale Price empty and required | — | not run |
| TC-SL-06 | FE-SL-003 | rows of both sources | lower Pcs on each | Weight follows; above cap → error with available amount | — | not run |
| TC-SL-07 | FE-SL-003 | From Reserve rows | change customer | confirm; OK clears only From Reserve rows | — | not run |
| TC-SL-08 | FE-SL-003 | empty row | click it | opens Add From Reserve (no row panel) | — | not run |
| TC-SL-09 | FE-SL-006 | valid form, approval ON | Save | "Saved SL…", Draft badge, URL `/sale/sale/<id>`; Send to approve → Pending Approval | — | not run |
| TC-SL-10 | FE-SL-009 | pending sale | approve on Approve page | Approved, read-only; reserve line open falls; Memo Stock sold rises; item appears in Purchase › Add Memo Stock › Sold | — | not run |
| TC-SL-11 | FE-SL-006 | two sales for the same reserve line | approve both | second fails with "not enough available"; stays pending | — | not run |
| TC-SL-12 | FE-SL-006 | draft | Delete, then Restore | soft delete banner, Restore with DELETE grant | — | not run |
| TC-SL-13 | FE-SL-002 | narrow viewport | resize | fields stack, table scrolls, no page horizontal scroll | 390 px | not run |
