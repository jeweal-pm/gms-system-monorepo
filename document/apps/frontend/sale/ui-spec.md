# UI specification: sale

- Feature ID / revision: `sale` / **1**
- Status: **approved** 2026-11-18 (owner "อนุมัติทั้งสอง" in chat, 2026-11-18 (UI rev 1 + SA rev 1 / ADR-0054; Q-SL-01…16 and SQ-SL-01…04 take their defaults; Sale in backend-api-inventory); see the [TODO](../../../task/todo/sale.md)).
- Owner request (2026-11-17, verbatim): "sa uxui เขียน adr และ ui spec หน้า sale โดย ui หน้าเหมือนหน้า transaction อื่นๆ โดยจะนำของออกมาขายได้จาก 2 ปุ่มคือ from stock ที่ของมาจากหน้า load และ memo อีกปุ่มนึงคือ reserve เอาของมาจากของที่จองไว้ เรียงปุ่มเป็น from reserve และ from stock"
- Meaning used in this spec (**O**):
  - The Sale page looks like the other transaction document pages.
  - Items to sell come from **two picker buttons, in this order: From Reserve, then From Stock**.
  - **From Reserve** takes items already held by an approved Reserve.
  - **From Stock** takes stock that came in through **Load to Stock** (own stock) and through **Memo** (Memo Stock).
  - The owner also asked SA for an ADR. That is SA's deliverable, requested in the [SA handoff](../../../coordination/handoffs/sale-sa.md); this bundle contains no ADR.
- Source: **owner text only. No design image or Figma file was supplied.** The visual reference is the shipped transaction pages, chiefly [Reserve](../reserve/ui-spec.md) (customer header, pick-only rows) and [Purchase](../purchase/ui-spec.md) (two picker buttons). Viewport: not applicable; layout follows those pages at the same 1920 x 1080 desktop reference.
- Inspection evidence (2026-11-17/18, branch `fix/16-11-26-ui-bug` at `5dfb1f3`): read the specs of reserve, purchase, quotation, memo-out and purchase-order, and the code in `frontend/src/features/{reserve,purchase,trade-document,quotation}/`, `frontend/src/features/home/navigation.ts`, `backend-api-master/src/document-setup/document-setup.transactions.ts`, `backend-api-master/src/approval-setting/approval-types.ts`, `backend-api-auth/src/permission/catalog.ts`, `backend-api-master/prisma/schema.prisma` (`MemoStock`) and `backend-api-inventory/src/modules/`.
- Main flow: [diagram/sale-flow.md](../../../diagram/sale-flow.md)
- Review bundle: this file, [open-questions](open-questions.md), [conventions](conventions.md), [data-fetching](data-fetching.md), [dependencies](dependencies.md), [design-system](design-system.md), [error-handling](error-handling.md), [form-guidelines](form-guidelines.md), [testing](testing.md), the [flow](../../../diagram/sale-flow.md) and the [SA handoff](../../../coordination/handoffs/sale-sa.md). Central TODO: [`document/task/todo/sale.md`](../../../task/todo/sale.md).

## Source quality and open decisions

Each value is tagged with where it comes from:

- **C**: existing code or an approved spec (the reused pattern).
- **O**: owner text above.
- **A**: an assumption or recommended default. Every **A** that changes the flow is a question in [open-questions.md](open-questions.md) (Q-SL-01…16).

There are **no measured (Figma) or pixel-estimated (E) values** in this revision. All sizes, colours and spacing are the shared components' existing values (C). If the owner later supplies a Sale design, it becomes UI revision 2 and its measurements replace the reuse rules here.

Not established by the source, so taken from the reused pages (**A** / **C**): the header fields, the table columns, both picker dialogs, the row panel, Summary Value, view mode, the approval badge and buttons, loading / error / empty states, and mobile behaviour.

Facts found while inspecting that change the request's premise:

| ID | Fact (C) | Consequence |
|---|---|---|
| F-01 | **Load to Stock is approved (2026-11-17, UI 1 + SA 1, ADR-0052 Accepted) and phase 1 is implemented** (`backend-api-inventory` with `inventory.stock`; FE-LS-001…012, BE-LS-001…011 done; FE-LS-013 / BE-LS-012 open). The coordinator's note described it as a pending-review draft. | Own stock exists as data, but **no API reads available own stock or holds/consumes it yet**. ADR-0052 D15 schedules that as phase 2a/2b (master pickers) and **phase 3 (Sale in inventory)**. See Q-SL-01. |
| F-02 | ADR-0052 D1 places the future **Sale module in `backend-api-inventory`**, consuming Memo Stock (master) through a master API (D15 phase 3). | Reserve and Memo Stock are both owned by `backend-api-master`. Placement of Sale is an SA/ADR decision (Q-SL-02). The UI is the same either way; only the data adapter differs. |
| F-03 | `memo_stock` already has the buckets `pending = received − returned − sold − reserved` and `purchased ≤ sold` (ADR-0035, ADR-0042). **The `sold` bucket has no customer-sale writer yet**; Purchase's "Sold to customers · must be purchased" group is empty until Sale exists (ADR-0042 consequences). Reserve **and Memo Out** both move pending → `reserved` at Approve (SA-RS-07, Memo Out SA rev 2). | A Sale of memo stock fills `sold`, which makes those stones appear in Purchase › Add Memo Stock › Sold. From Reserve must consume a **specific Reserve line** (not just the shared `reserved` bucket) so Memo Out holds are never sold by mistake. |
| F-04 | Document Setup already has key **`sale`, default code `SL`**; the auth catalog already has leaf **`sale`** (section SALE); the sidebar already has a **Sale** section with link slug `sale` (placeholder `/modules/sale`). | No new number key or permission leaf is needed; this spec's IDs use the `SL` prefix (checked: no existing `*-SL-*` IDs in `document/`). |
| F-05 | The approval setting types (ADR-0050) in master and frontend do not include `sale`. | SA adds `sale` to the approval types, the Approve Center registry and the frontend `DocumentApprovalType` (Q-SL-09). |

## Page structure and layout

Route `/sale/sale` for a new document and `/sale/sale/[id]` for a saved one (**A**, the section/slug pattern of `/purchase-order/purchase` and `/memo/memo-out`). The breadcrumb reads Home › Sale › Sale. The sidebar Sale › Sale item (`saleLink`, slug `sale`) and the Home "Main Menu" Sale shortcut link there through `REAL_PAGE_HREFS.sale` and stay active on both routes. The page opens in an app-shell tab titled with the document number (C, ADR-0037).

```
[ Breadcrumb Home › Sale › Sale                                                   (topbar, existing) ]
[ "Sale No.:"  SL… [scan]   [status badge]                   Print Excel  Duplicate Refresh          ]
[                          [+ Create New] [Cancel] [Save] [Send to approve] [Edit] [Delete]          ]
[ Doc Date*  | Customer*            | Shipping Address*         | Invoice Address*                  ]
[ Due Date*  | Currency*            | Exchange Rate (read-only) | Ref.                              ]
[ ─────────────────────────────────────── divider ───────────────────────────────────────────────── ]
[ Item  N rows  [From Reserve] [From Stock] [scan]                                       | rail     ]
[ [photo box] [item table, 5 empty rows, Totals]                                         | daybook  ]
[ Document Note                                             Summary Value                            ]
```

| Region | Rule | Evidence |
|---|---|---|
| Header, number, actions | `QuotationHeader` through `DocumentForm` with the ADR-0050 flow buttons (Save, Send to approve, Edit/Delete per status) | C (Reserve) |
| Header card | `QuotationInfoForm` (customer, both addresses, currency, Selling Rate, Ref.), as Reserve via `customerStockConfig` | C |
| Item tools | Two dark buttons: **From Reserve** (first, `picker`) and **From Stock** (second, `secondaryPicker`), then the disabled scan icon | O (order), C (Purchase FE-PU-001) |
| Table, photo box, note, summary, rail | `ItemTable`, `ItemPhotoBox`, `DocumentNote`, `SummaryValue`, `RailButtons` unchanged | C |

Responsive behaviour: the shared form's container-query breakpoints (C). Header fields stack below `@2xl`; note and summary stack below `lg`; the table scrolls horizontally. No new mobile behaviour is invented.

## Component inventory

| ID | Region / component | Existing implementation | Props / states | Evidence |
|---|---|---|---|---|
| H-01 | Number "Sale No.:" + scan icon | `QuotationHeader` | New: grey preview from Document Setup › Sale (key `sale`, default **SL**) with "Number preview — the number is issued when you save". Saved: the issued number + status badge | C (F-04) |
| H-02 | Print, Excel | `QuotationHeader` | **Disabled** in rev 1 (Q-SL-13) | A |
| H-03 | Duplicate | `DocumentForm.onDuplicate` | Copies header and rows to a new unsaved Sale. Picked rows keep their source; availability is checked again at Save / Approve | C (Purchase H-03) |
| H-04 | Refresh | `DocumentForm` | Reload; asks first with unsaved changes | C |
| H-05 | Create New / Cancel / Save / Send to approve / Edit / Delete / Restore | `DocumentForm` + `useDocumentFlow` (ADR-0050), soft delete (ADR-0045) | Leaf `sale` ADD / EDIT / DELETE. Approve itself happens only on the Approve page | C (Q-SL-09) |
| I-01…I-08 | Doc Date*, Customer*, Shipping Address*, Invoice Address*, Due Date*, Currency*, Exchange Rate (read-only, Selling Rate), Ref. | `QuotationInfoForm` | As Reserve. Changing the **customer or currency clears From Reserve rows** (they belong to that customer's reserve in that currency, Q-SL-05); From Stock rows stay | C, A |
| T-01 | "Item" + "N rows" | `DocumentForm` | Count of all rows | C |
| T-02 | **From Reserve** (dark, first) | `DocumentForm` `picker` → new `ReserveLinePicker` (FE-SL-004) | Blocked with a toast until a customer and a currency are chosen: "Choose a customer first" / "Choose a currency first". Opens "Add From Reserve" (P-01) | O, C (Purchase `blockedReason`) |
| T-03 | **From Stock** (dark, second) | `DocumentForm` `secondaryPicker` → `MemoStockModal` (phase 1) | Opens "Add From Stock" (P-02). Not tied to customer or currency (Q-RS-06 rule) | O, C |
| T-04 | Scan icon | `IconButton` | Disabled placeholder | C |
| T-05 | Photo box + Item Note | `ItemPhotoBox` | Selected row's photos and note; own line photos per ADR-0048 (Q-SL-12) | C, A |
| T-06 | Item table | `ItemTable` with a Sale `DocumentKind` (`stockQuantity`, `pickOnly`) | 5 empty rows; **no Add row** (pick-only, Q-SL-07); row checkbox + "Remove N selected"; More menu (Edit, Clear, Remove; **no Duplicate** on picked rows, C) | C, A |
| T-07 | Empty row text | `DocumentKind.emptyRowText` | "Empty row · click to pick From Reserve, or use From Stock" | A (Q-SL-07) |
| T-08 | Totals row | `ItemTable` | Pcs, Weight and Amount totals; Decimal Setup places | C |
| T-09 | Row panel | `ItemEditorPanel` (stock-quantity mode) | Stone, quality, certificate, lot, location read-only. **Pcs / Weight** editable, > 0 and ≤ the row's cap; Pcs fills Weight in proportion; panel shows "Available x pcs / y ct" (From Stock) or "Reserved x pcs / y ct · {Reserve No.}" (From Reserve). **Sale Price** required > 0, line discount and Item Note editable | C (Reserve rows), A (Q-SL-06/08) |
| R-01 | Right rail | `DocumentDaybook` / `RailPanelView` | Daybook: saved sales, newest first, customer name; Summary Value | C |
| S-01 | Document Note | `DocumentNote` (Quotation kind, 250) | Placeholder "e.g. Paid in full by transfer." Hint "Printed on the sale for the customer" | C, A |
| S-02 | Summary Value | `SummaryValue` | Subtotal, Discount, Tax, Other Charge, Grand Total as Quotation / Reserve | C |

### Item table columns (T-06)

The Reserve / Quotation columns, unchanged (C): ☐ · remove · # · **Stone Code** (Stock ID · Lot) · Location · Stone (Shape · Size) · Color · Clarity (Cutting · Quality) · Cer Type (Cer No.) · Pcs · Weight (ct) · Sale Price (Unit) · Amount · More.

- First column: the Stock ID leads (C, Reserve). Under it, a small source line: **"from {Reserve No.}"** for From Reserve rows, **"from {Memo Receive No.}"** for memo stock rows, **"from {Load No.}"** for own stock rows (phase 2). This is the only visible difference between the sources (A, Q-SL-08).
- Location: `Memo` for memo stock (C); own stock shows its Location Master name (ADR-0053, phase 2).
- No sorting (C, Q-PU-12).

### P-01 Add From Reserve dialog (new, FE-SL-004)

- Shell: the shared picker shell `PurchasePicker` (`purchase/components/purchase-picker.tsx`, flat list mode used by Add Purchase Order). The shell is moved or re-exported into `trade-document/` so Sale does not import a Purchase feature file (FE-SL-001). Width `min(1632px, 100vw − 48px)`, height `min(1000px, 100vh − 80px)`, focus trap, Escape / ✕ close, focus returns to the From Reserve button (C).
- Title "Add From Reserve". Search "Search Reserve No., Stock ID, Lot, Stone, Cer No." (debounced 250 ms, C). Start → Due filters the Reserve Doc Date.
- Lists **open lines of approved Reserves of the chosen customer in the document currency** (Q-SL-05), oldest reserve first, 50 per page with Load more. Open = reserved − sold (− released, later) > 0.
- Columns: checkbox · # · **Reserve No.** (Reserve date · Due date) · Stone Code / Stock ID · Lot · Location · Stone · Shape · Size · Color · Clarity / Cutting · Quality · Cer Type · Cer No. · **Open Pcs / Weight** · **Sale Price** (the reserve's price per unit, after its line discount) · Amount (open × price).
- Reserve lines already on the document are left out. OK is disabled until one row is ticked. OK fills empty rows first, then appends; toast "Added N items from Reserve".
- Empty: "No open reservations for this customer in {currency}." Error: the shared domain error text with Retry.

### P-02 Add From Stock dialog (phase 1: existing `MemoStockModal`)

- Phase 1 (Q-SL-01 default): exactly the Reserve / Memo Out "Add From Stock" dialog: Memo Stock items with pending > 0 from every vendor, no price columns, 50 per page, Start → Due on the Memo Receive date (C). Title "Add From Stock"; toast "Added N items from Stock".
- Items held by a Reserve or Memo Out are **not** listed (they are in `reserved`, not pending; C).
- Phase 2 (after the own-stock read API exists): the same dialog gains own stock from Load to Stock as a second section or tab, per ADR-0052 D15 ("shown as a second section/tab next to Memo Stock"). That needs its own UI revision because the section design is not specified (Q-SL-01).

## Interaction and data

- Access (C): leaf `sale` via `useDocumentAccess("sale")`. Without VIEW: "You don't have permission to view sales." ADD / EDIT / DELETE gate the buttons; the server checks every call.
- Save (requires-sa): validates the whole form ([form-guidelines](form-guidelines.md)), names the first bad row, and with approval ON gives **Draft**; with approval OFF the save is auto-approved and moves stock at once (ADR-0050, Q-SL-09). A new sale opens at `/sale/sale/<id>` in the same tab.
- **Stock effect (requires-sa, recommended defaults, Q-SL-03/04):** Save holds nothing. Approve, in one transaction with row locks and re-checks:
  - From Reserve row: the Reserve line's sold quantity rises; the Memo Stock item moves `reserved → sold`. The Reserve stays Approved; it is fully consumed when every line's open quantity is 0.
  - From Stock memo row: the Memo Stock item moves `pending → sold`.
  - Own stock row (phase 2): inventory moves `on_hand → sold`.
  - Short at Approve → the document stays as it was with "Some items no longer have enough available. Edit the row and approve again."
- Data, errors and tests: [data-fetching](data-fetching.md), [error-handling](error-handling.md), [testing](testing.md).

## States

- Loading "Loading…"; not found "Sale not found."; load error the shared domain text (C).
- Saved documents open in view mode; Draft / Revise editable by the creator; Pending Approval / Approved / Rejected read-only (ADR-0050, C).
- Deleted (soft delete, ADR-0045): read-only with the deleted banner and Restore for DELETE holders (C).
- Toasts: "Saved {docNo}", "Refreshed", "Added N items from Reserve", "Added N items from Stock", "Duplicated as a new sale", "Row n: …" (C pattern).
- Empty master lists: a short message on the field (C).

## Accessibility

Visible labels, red `*` and `aria-required` on required fields (C, `Field`). The blocked From Reserve button gives its reason as a toast and keeps focus on the button. Dialogs reuse the existing modal behaviour: `aria-modal`, titled by id, Escape closes, focus trap and focus return (C). Badge colours keep the WCAG AA text colours already in use (C, DV-09 of Purchase).

## Dependencies and traceability

No new packages ([dependencies.md](dependencies.md)). SA handoff: [sale-sa.md](../../../coordination/handoffs/sale-sa.md) (SA-SL-01…12). TODO IDs FE-SL-001…012 in [todo/sale.md](../../../task/todo/sale.md). Related: [reserve](../reserve/ui-spec.md), [purchase](../purchase/ui-spec.md), [quotation](../quotation/ui-spec.md), [memo-out](../memo-out/ui-spec.md), [purchase-order](../purchase-order/ui-spec.md), [load-to-stock](../load-to-stock/ui-spec.md); ADR-0035, 0036, 0042, 0045, 0048, 0050, 0052, 0053.

## Out of scope (revision 1)

- Own stock (Load to Stock) in From Stock until the read/consume API exists (phase 2, Q-SL-01).
- Selling stones the customer already holds on Memo Out (Q-SL-14).
- Print / Excel / tax invoice output (Q-SL-13).
- Receivable / payment posting, Sale Person, commission (Q-SL-15).
- Releasing a Reserve's unsold remainder (Reserve Q-RS-03, a Reserve revision).
- Cancelling or reversing an approved Sale (Q-SL-16).
- Barcode scan.
