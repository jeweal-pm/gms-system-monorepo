# Frontend acceptance and verification: purchase

- UI revision: 1 (approved 2026-11-04, FE-PU-001/002); revision 2 cases are in the [Revision 2 section](#revision-2-add-memo-stock-and-add-purchase-order-approved-2026-11-04-not-run). Automated UT-PU-01…05 and IT-PU-02 ran on 2026-11-04 (working tree on `f542171`); the UI acceptance cases and the security reviews have not run yet.
- Reference image and viewport: [source/01-purchase-new.png](source/01-purchase-new.png), desktop, 2101 x 1179
- Relevant TODO / API / SA revisions: [todo/purchase.md](../../../task/todo/purchase.md). The SA bundle is pending ([handoff](../../../coordination/handoffs/purchase-sa.md)).

## Automated coverage

Follow [automated testing](../../../workflow/automated-testing.md). Frontend runner: `pnpm --filter frontend exec vitest run` (Vitest 5, C).

| Target / behavior | Unit case ID and test path | Integration case ID and test path | Boundary / fixture | Command and result |
|---|---|---|---|---|
| Shared form: second item button (shown, disabled with reason, opens its own picker when enabled); existing pages show one button as before | UT-PU-01 `frontend/test/trade-document/document-form-pickers.test.ts` (`ItemToolButtons`; only Purchase sets `secondaryPicker`) | IT-PU-02 | Config with and without `secondaryPicker` | `npx vitest run`: 4/4 passed (2026-11-04) |
| `DocumentKind.priceTitle`: column + row panel label "Price"; Quotation / Memo pages still "Sale Price" | UT-PU-02 `frontend/test/quotation/item-table-price-title.test.ts` | IT-PU-02 | QUOTATION_KIND, MEMO_RECEIVE_KIND, MEMO_OUT_KIND, Reserve kind, PURCHASE_KIND; ItemTable + ItemEditorPanel render | 3/3 passed (2026-11-04) |
| Routes, sidebar link (`REAL_PAGE_HREFS.purchase`, active prefix), access gate | UT-PU-03 `frontend/test/purchase/purchase.test.ts` (the sidebar stays the `/modules/purchase` placeholder until FE-PU-006) | IT-PU-02 | `permission.mine` fixtures with and without `purchase:VIEW` | 4/4 passed (2026-11-04) |
| Schema: header required fields, Due ≥ Doc, ≥ 1 row, ≤ 200 rows, Memo Stock row ≤ pending and > 0, Price required, note ≤ 250 | UT-PU-04 same file | IT-PU-02 (Save stays enabled; refused write) | boundary values (0, pending, pending + 0.001, 200/201 rows, 250/251 chars) | 7/7 passed (2026-11-04) |
| `memoStockToPurchaseLine`: copies Stock ID, stone, cer, location `Memo`, pending as the start quantity, net unit price, `memoStockId` | UT-PU-05 same file (also `clearMemoStockRows`, `pickedMemoStockIds`) | — (the picker is FE-PU-004) | MemoStockItem fixture (per ct and per pcs) | 3/3 passed (2026-11-04) |
| Contract mapping `toPurchaseInput` / `fromPurchase`; error mapping `PURCHASE_*` to fields and toasts; approve confirm text | UT-PU-06 same file | — | SA contract fixtures (after SA approval) | not run |
| Page skeleton before the API (FE-PU-001/002): route page → providers → access gate → DocumentForm with the purchase config; not-connected status line; two disabled item buttons with reasons; Price column; 5 empty rows; note 0 / 250; no `purchase.*` request; unwired writes refuse | covered by UT-PU-01…05 | IT-PU-02 `frontend/test/purchase/purchase-page.integration.test.ts` | real React Query + auth/master tRPC providers, seeded `permission.mine` / `currency.options`, recording `fetch` stub, mocked `next/navigation` | 4/4 passed (2026-11-04) |
| Page wiring: new document, number preview, save → `/purchase-order/purchase/<id>`, edit, delete confirm, approve, daybook | — | IT-PU-01 `frontend/test/purchase/purchase-page.integration.test.ts` (mocked tRPC link, as other pages) | after BE-PU-003 | not run |
| Backend (owned by backend, listed for traceability) | UT-PU-B* / GP-MT-PU | IT-PU-B* (disposable PostgreSQL) | per the SA testing plan | not run |

Before handoff, also run the full frontend suite, `tsc --noEmit`, and ESLint, and record the results here.

FE-PU-001/002 run, 2026-11-04 (working tree on `f542171`, including the uncommitted confirm-modal change):

- `npx vitest run` (frontend): 70 files / 646 tests passed.
- `npx tsc --noEmit`: 0 errors. This needed a type-only destructuring default in the uncommitted `test/quotation/confirm-and-row-errors.test.ts` (UT-QT-ROW-02).
- `npx eslint .`: 0 errors; the 2 old `react-hooks/exhaustive-deps` warnings in `src/features/auth/login-form.tsx` remain.
- Regression check: with `kind.priceTitle` removed from `ItemTable`, UT-PU-02 fails as intended.
- Dev stack: after `docker restart gms-system-monorepo-frontend-1` and `node docker/repair-dev-networks.cjs`, `GET http://127.0.0.1:8080/purchase-order/purchase` returned 200. The served chunks under `/app/frontend/.next/dev/` contain the page's status text.

## Security review before handoff

Follow [security review](../../../workflow/security-review.md) once on the final diff.

| Reviewer | Source revision / changed scope | Status | Evidence / ticket IDs |
|---|---|---|---|
| `sec-auditor` | — | not run | — |
| `security-auditor` | — | not run | — |

## UI acceptance

| Case ID | TODO / component | Starting state | User actions | Expected result | Viewport / keyboard | Evidence / result |
|---|---|---|---|---|---|---|
| TC-PU-01 | FE-PU-002 layout | Signed in with `purchase` VIEW + ADD | Sidebar › Purchase Order › Purchase (PU) | Breadcrumb Home › Purchase Order › Purchase; "Purchase No.:" preview; fields and order as the source; "Vendor" and "Ref." spelling; Exchange Rate read-only; 5 empty rows; Memo Stock + Purchase Order buttons; Document Note 0/250; Summary Value; 2 rail icons | Desktop ≥ 1440 | not run |
| TC-PU-02 | T-03 / Q-PU-02 | New document | Hover or focus Purchase Order | Disabled; reason "Purchase Order isn't available yet" | keyboard: reason announced | not run |
| TC-PU-03 | FE-PU-004 | Approved Memo Receive for vendor V in USD | Choose V, USD → Memo Stock → tick 2 items → OK | Rows fill the empty rows; Stock ID, Location `Memo`, pending quantity and memo price shown; the dialog leaves them out next time; changing vendor clears them | Escape closes the dialog | not run |
| TC-PU-04 | FE-PU-002 validation | New document | Save with nothing filled | Field errors; toast; focus on Doc Date or the first error; nothing sent | — | not run |
| TC-PU-05 | FE-PU-003 | Valid document | Save | "Saving…", then the PU number; Pending Approval (if Q-PU-06); view mode; tab title = number | — | not run |
| TC-PU-06 | FE-PU-003 / Q-PU-03 | Saved pending purchase with a Memo Stock row | Approve → confirm | Approved, read-only; Memo Stock pending lower and Memo Outstanding › Vendor updated per the approved SA rule | — | not run |
| TC-PU-07 | regression | — | Open Quotation, Memo Return, Memo Out, Reserve, Memo Receive | Unchanged: one item button, "Sale Price" title | — | not run |

Customer reports go under `document/testing/user-check/` after the manual-tester run.

## Revision 2: Add Memo Stock and Add Purchase Order (approved 2026-11-04, not run)

- UI revision: 2 ([ui-spec › Revision 2](ui-spec.md#revision-2-add-memo-stock-and-purchase-order-dialogs)).
- Reference images:
  - [source/04](source/04-memo-stock-dialog-sold-collapsed.png) and [source/05](source/05-memo-stock-dialog-expanded.png): 3840 x 2160, treated as 2x of a 1920 x 1080 desktop
  - [source/06](source/06-memo-stock-row-states.png): row variants
  - [source/07](source/07-memo-stock-group-headers.png): group headers
- The proposed FE item IDs (FE-PU-008…010, and the changed FE-PU-004) come from the parent's TODO update. Cases marked *after SA* wait for the approved R2-D contract.

### Automated coverage (revision 2)

| Target / behavior | Unit case ID and test path | Integration case ID and test path | Boundary / fixture | Command and result |
|---|---|---|---|---|
| Picker shell. Tabs with counts filter the table. Groups collapse and expand (`aria-expanded`, Enter/Space). Running # across groups. Select all covers only expanded groups. Checked rows are kept across tab, search and date changes, and OK returns all of them. OK is disabled with 0 checked. Escape, Close and the backdrop close it. Focus starts in search, stays inside (Tab cycles), and returns to the trigger. | UT-PU-07 `frontend/test/purchase/purchase-picker.test.tsx` | IT-PU-03 | Fixture rows: 2 sold + 3 in stock (the source's values), 0-row group, 51 rows (Load more) | not run |
| Memo Stock view model. Sold-first grouping. Status badge text and colours (DV-09). "{lot} · {memo no.}". Note line only when there is a note. "{cur} per cts/pcs". Pcs over "{wt} cts". Location second line hidden without a piece type. Count fallback "+" while `hasNextPage`. Items without `status` count as In stock (Q-PU-16 default). | UT-PU-08 same file | IT-PU-03 | `MemoStockItem` with and without the R2-D-01/02 fields; per ct and per pcs; source arithmetic (0.76 x 1,450 = 1,102.00; 2.94 x 320 = 940.80) | not run |
| `memoStockToPurchaseLine` for sold rows. The cap is the sold, not-yet-purchased quantity, and the price is the net unit price. *After SA.* | UT-PU-05 (extended) `frontend/test/purchase/purchase.test.ts` | — | the sold-row contract fixture | not run |
| `purchaseOrderLineToPurchaseLine`: open quantity (ordered − purchased), net unit price after the PO line discount, Stock ID "Auto", "from {PO No.}", attributes copied, `purchaseOrderLineId`, photos not copied | UT-PU-09 `frontend/test/purchase/purchase.test.ts` | IT-PU-04 | partly purchased line; fully open line; per pcs line | not run |
| Picked-row edit rule (R2-03): only Pcs, Weight and Price are enabled in the row panel. Pcs and Weight are > 0 and ≤ the cap; Pcs fills Weight in proportion; Price is required and > 0. A vendor change clears Memo Stock **and** PO rows and keeps manual rows. | UT-PU-10 same file (+ `ItemEditorPanel` render) | IT-PU-03 | cap, cap + 0.001, 0; manual + memo + PO rows mixed | not run |
| Page (R2-01a, R2-02): the empty-row text names both buttons. The Purchase Order button is disabled with "Purchase Order lines aren't connected yet" before R2-D-05. After R2-D-05 it shows the blocked toast without a vendor or currency, and opens Add Purchase Order once both are chosen. | UT-PU-11 `frontend/test/purchase/purchase.test.ts`; UT-PU-01 kept | IT-PU-02 (update its "two disabled buttons" expectation) | with and without vendor/currency | not run |
| Memo Stock dialog wired: `memoStock.list` with `status` / `q` / `from` / `to` / cursor; counts from the server; error and empty texts per tab; OK adds rows and toasts "Added N items from Memo Stock". *After SA (R2-D-01…03).* | — | IT-PU-03 `frontend/test/purchase/purchase-pickers.integration.test.tsx` | real React Query + master tRPC provider, recording `fetch` stub | not run |
| Purchase Order dialog wired to the open-PO-lines query; OK adds rows and toasts "Added N items from Purchase Order". *After SA (R2-D-05).* | — | IT-PU-04 same file | as IT-PU-03 | not run |
| Regression: `MemoStockModal` is unchanged for Memo Return and Memo Out From Stock (two "Pending" header rows, "from {docNo}", no tabs or groups) | existing memo-return / memo-out picker tests; UT-PU-02 kept | — | — | not run |

### UI acceptance (revision 2)

| Case ID | TODO / component | Starting state | User actions | Expected result | Viewport / keyboard | Evidence / result |
|---|---|---|---|---|---|---|
| TC-PU-08 | FE-PU-008 / R2-MS layout | Vendor V and USD chosen; V has sold and in-stock memo items (*after SA*) | Click Memo Stock | Matches source 05: title "Add Memo Stock"; tabs All / Sold / In stock with counts; search placeholder "Search Stock ID, lot, memo, invoice"; Start → Due; one header row with the 11 columns; pink Sold group first, rows with a 3 px red left border and a "Sold" badge, invoice · date and customer; grey In stock group with an "In stock" badge and "with us since memo"; OK disabled | 1920 x 1080; also 1440 (table scrolls sideways inside the card) | not run |
| TC-PU-09 | FE-PU-008 groups / tabs | TC-PU-08 open | Collapse Sold (click, then Enter on the focused header); switch to In stock, then Sold, then All; search a Stock ID | The chevron turns; the numbers stay 3, 4, 5 under a collapsed Sold group (source 04); each tab shows only its group; counts follow the search; checked rows stay checked and "N selected" stays the same | keyboard only: Tab, arrows on the tabs, Space on the rows | not run |
| TC-PU-10 | FE-PU-004 add | TC-PU-08 open | Check 1 sold + 1 in-stock row, then OK | 2 rows fill the empty rows; Stock ID, Location, quantity at the cap, and price; toast "Added 2 items from Memo Stock"; reopening the dialog leaves them out | Escape closes; focus returns to Memo Stock | not run |
| TC-PU-11 | FE-PU-010 edit rule | Purchase with one Memo Stock row and one PO row | Open each row panel | Only Pcs, Weight and Price can be changed (Item Note too); a value over the cap shows the row error; changing the vendor clears both rows after the confirm | — | not run |
| TC-PU-12 | FE-PU-009 / R2-PO | An approved PO for V in USD with one partly purchased line (*after SA*) | Click Purchase Order, open the PO group, check the line, then OK | Groups per PO; Status "Partly purchased" with the ordered quantity; Pcs/Weight show the outstanding quantity; the row added has Stock ID "Auto" and "from {PO No.}"; toast "Added 1 item from Purchase Order" | as TC-PU-09 | not run |
| TC-PU-13 | R2-01a / R2-02 | New document, no vendor | Read the empty rows; click Purchase Order | Empty-row text names both buttons; the toast "Choose a vendor first" appears (before R2-D-05: the button is disabled with its reason) | keyboard: the reason is announced | not run |
| TC-PU-07 (extended) | regression | — | Open Memo Return › Add Memo Stock and Memo Out › From Stock | Unchanged from before revision 2 | — | not run |

### Revision 3 (owner 2026-11-04): picker Ref. / Memo ID / PO No.

| Case ID | Target | Test | Result (2026-11-05) |
|---|---|---|---|
| UT-SR-01 | `stockRef` / `stockRefLabel` (`frontend/src/features/trade-document/stock-ref.ts`): `ref` first, `memoReceive` fallback, LOAD type, no source | `frontend/test/trade-document/stock-ref.test.ts` | pass |
| UT-SR-02 | `RefCell` (`memo-stock-modal.tsx`): bold no. over Doc Date; Load hint; dash | same file | pass |
| TC-PU-07 (rev 3) | `MemoStockModal` keeps the Pending header and no tabs/groups; Ref. column shows "MR-1001 / 29/10/2026"; no "from MR-1001" sub-line | `frontend/test/purchase/purchase-page.integration.test.ts` | pass |
| UT-PU-08 (rev 3) | Add Memo Stock: header "Memo ID" / "Stock ID · Lot"; memo no. on top, "{Stock ID} · {Lot}" under it | `frontend/test/purchase/purchase-picker.test.ts`, IT-PU-03 | pass |
| UT-PU-09 (rev 3) | Add Purchase Order: flat list, no tablist / group rows / Status; columns PO No., Stone Code, …; PO no. over Doc Date; "Auto" + lot badge | `frontend/test/purchase/purchase-picker.test.ts`, IT-PU-04 | pass |

Full frontend run 2026-11-05: `vitest run` 74 files / 705 tests passed, `tsc --noEmit` 0 errors, `eslint .` 0 errors (2 old warnings). Manual browser check of the three dialogs: not run.

