# Customer check: purchase flows and app tabs (2026-11-07)

- Request: owner, 2026-11-07, "ตอนนี้มีการเปิด tab ในตัวproject เอง มีPurchase ธรรมาดา และ ฟังก์ชั่น merge, Purchase Outstanding หรือ Purchase Order , from stock ที่นำของจากคลัง memo stock มาทำรายการได้เเล้ว เหลือ stock เราที่ยังไม่มี ช่วยทำ manual-test พวกนี้ให้หน่อยว่าติดปัญหาอะไรไหมเเล้วเปิด INV มา"
- Tester: `manual-tester`, testing as a customer with 20 years of jewelry ERP use.
  - Report scope: `manual-test-reports` (`document/testing/user-check/**`).
  - The parent asked for INV records in `document/task/investigation/`.
- Features and revisions checked:
  - `app-shell-tabs` rev 1, including the owner change of 2026-11-03 (Home has no tab).
  - `purchase-order` rev 1.
  - `purchase` rev 1–3 (merge).
  - `purchase-outstanding` rev 1.
  - `quotation` rev 2 (From Stock), plus the Reserve and Memo Out From Stock flows.
- Build: branch `feat/07-11-26-manual-tester` at `26f874b` (same as origin/dev), clean tree.
  - Local dev stack at `http://localhost:8080`, in dev mode, so the first open of a page is slow.
- Browser: headless Chrome driven by a script, desktop 1440×900. Signed in as the local demo admin. No passwords are written here.
- Screenshots: [artifacts/2026-11-07-purchase-flows/](artifacts/2026-11-07-purchase-flows/)

## Summary

The purchase flow works from start to finish:

1. I made and approved a Purchase Order.
2. I bought part of it on a Purchase, together with a stone that was partly sold and partly still on memo (merged into one row) and a keyed-in stone.
3. After approval, every number matched: Memo Stock, the open Purchase Order lines, and Purchase Outstanding.
4. Two purchases racing for the same Purchase Order line were handled correctly: the second approval was refused with a clear message.
5. From Stock on Quotation, Reserve and Memo Out behaved as the owner described. Quotation holds nothing, Reserve holds at approval, and Memo Out cuts at approval.

The problems I found are about everyday comfort and safety, not about wrong totals:

- On a Purchase, picking the vendor again silently throws away every picked row.
- New, untouched documents keep asking "Discard unsaved changes?".
- A Purchase Order row typed without a stone name looks empty, and Save then won't say what is missing.

| Area | Result | Tickets |
|---|---|---|
| 1. App shell tabs (open, switch, keep typed data, close, 15-tab limit, Close all, reload) | **Pass with a problem** | [INV-20261107-008](../../task/investigation/INV-20261107-008-new-vendor-documents-marked-unsaved.md) |
| 2. Purchase Order (PO): vendor, keyed-in rows, Stone Code, typed Location, photo, save, edit, delete, approve, read-only, daybook | **Pass with problems** | [INV-20261107-004](../../task/investigation/INV-20261107-004-row-without-stone-shows-empty-and-save-gives-no-hint.md), [-005](../../task/investigation/INV-20261107-005-po-required-messages-stay-after-fix.md), [-006](../../task/investigation/INV-20261107-006-po-price-labelled-sale-price.md), [-007](../../task/investigation/INV-20261107-007-typed-weight-loses-third-decimal.md) |
| 3. Purchase (PU): manual rows, Memo Stock rows, Purchase Order rows, save checks, approve | **Pass with a problem** | [INV-20261107-002](../../task/investigation/INV-20261107-002-purchase-vendor-reselect-clears-picked-rows.md) |
| 4. Merge of Sold + In stock (rev 3) | **Pass** (one display gap on Don't merge) | [INV-20261107-003](../../task/investigation/INV-20261107-003-purchase-separate-sold-instock-rows-look-identical.md) |
| 5. Purchase Outstanding: columns, formula, KPIs, filters, sort, expand, figures after approval | **Pass** | none |
| 6. From Stock on Quotation, Reserve and Memo Out | **Pass** | none |

## What I did and what worked

### 1. App shell tabs

- Each sidebar page opened as its own tab. Opening the same page again switched to its existing tab.
- Saved documents got their own tab titles, for example "Purchase Order (PO) · PO-4" and "Purchase · 5".
- Opening a document from the Daybook opened it in a new tab.
- Typed but unsaved Purchase Order data stayed intact when I switched to other tabs and back (07-tabs-three.png).
  - The hidden tab showed the unsaved dot.
  - Closing it asked "Discard unsaved changes in New Purchase Order (PO)?". Cancel kept everything (08-close-dirty-confirm.png).
- Closing a saved tab closed it with no question and showed the next tab to the right.
- The 16th page was refused with "Close a tab to open another (15 tabs open)" (64-tab-limit.png).
- Close all asked once when a tab had unsaved changes, then showed Home with an empty tab strip.
  - Home has no tab of its own. This follows the owner's change of 2026-11-03.
- Reloading the browser brought back the same five tabs, with the same one active (63-after-reload.png).
- A hidden Purchase Outstanding tab showed fresh figures as soon as I switched back to it after approving a Purchase.

### 2. Purchase Order (PO)

- Empty Save:
  - Vendor, Address and Due Date showed "Required".
  - The Item heading showed "Add at least one item".
  - The toast said "Please complete the required fields" (11-po-empty-save.png).
- There is no From Stock button. Clicking an empty row opens the key-in panel.
- I made **PO-4** (ref MT-PO-001), vendor V001 · Org, AFN at rate 100, due 30/11/2026:
  - Row 1: Stone Code RUBRD-1221GAAVVSSQAAA filled Ruby / ROUND / 1221 / GREEN / VVS1 / AA / AAA. Lot MT-PO-LOT-1, typed Location "Safe B shelf 2", 5 pcs, 3.25 ct, 1,500 per ct = 4,875.00, with an item note and one photo.
  - Row 2: B2-DISDEVVSSQA, Location "Vault 1", 12 pcs, 85 per pcs, less 10% = 918.00.
  - The totals were right.
- **Save:**
  - Status became Pending Approval and the number PO-4 was issued.
  - The photo was kept (20-po-saved-row1-photo.png).
- **Edit:**
  - Changed the Ref, added a document note, and changed row 2 to 10 pcs.
  - Saved, and the Grand Total became 5,640.00 AFN.
- **Daybook:** listed PO-4 (amber, pending) above PO-3 … 1 (green) (21-po-daybook.png).
- **Delete:**
  - I made PO-5 and pressed Delete. The system asked "Delete PO-5? … This can't be undone."
  - After Delete, a fresh new Purchase Order opened.
- **Approve:**
  - The confirm read "Approve this Purchase Order? Its 2 items are sent to Purchase and it can no longer be edited."
  - The toast said "Approved".
  - Afterwards the page was read-only: Edit, Delete and Approve were gone, and Save and Cancel were disabled (24-po-approved.png).

### 3. Purchase (PU)

- Without a vendor, Memo Stock and Purchase Order both answer "Choose a vendor first". An empty Save lists the required fields.
- **Memo Stock dialog** (V001, AFN) (30-pu-memo-stock-dialog.png):
  - Tabs All 3 / Sold 1 / In stock 2, with the pink Sold group above the grey In-stock group.
  - Searching "260013", "MR-3" or nonsense text worked. Nonsense showed "Nothing matches your search.".
  - Rows already on the form were left out.
- **Purchase Order dialog** (43-pu-po-dialog.png):
  - Approved PO lines with PO No. and Doc Date, Stone Code, "Auto" for the Stock ID, and the open quantity.
  - The net price was shown after the PO discount (76.50 per pcs).
- **Purchase 5** (ref MT-PU-001) had four rows:
  - The merged 260012 row at 7 pcs and 95 per ct.
  - PO-4 line 1 reduced to 3 of 5 pcs. Pcs filled the weight in proportion: 3 pcs → 1.95 ct.
  - PO-4 line 2 in full.
  - A keyed-in GRDI-SD row.
- Grand Total 4,595.00 AFN, which is correct (46-pu-ready.png).
- **Save checks:**
  - An In-stock row raised to 6 pcs when only 5 are pending was refused on Save with "Row 2: More than the pending 5 pcs" (41-pu-save-over-pending.png).
- **Save and Approve:**
  - Save gave the new rows Stock IDs 260014–260016, shown as "260014 · from PO-4".
  - The Approve text read "Its 4 items are taken off Memo Stock and the Purchase Orders" and the toast said "Approved 5".
  - Afterwards (56-po-dialog-after-approve.png, 57-ms-dialog-after-approve.png):
    - PO-4 line 1 showed 2 pcs / 1.30 ct still open.
    - PO-4 line 2 was gone.
    - 260012 showed Sold 0 and In stock 3.
- **Two purchases for the same open PO line:**
  - I saved Purchase 6 and Purchase 7, each taking the last 2 pcs of PO-4 line 1, then approved Purchase 7.
  - Approving Purchase 6 then said "Row 1: not enough is available any more. Lower the quantity or remove the row, then save and approve again." Purchase 6 stayed pending (62-race-approve-refused.png).
  - I then deleted Purchase 6.

### 4. Merge (Sold + In stock, rev 3)

- **Merge dialog:**
  - Ticking the Sold row and the In-stock row of 260012, then OK, opened "260012 is both sold and in stock".
  - It listed Sold 5 pcs / 5.00 ct / 500.00 AFN, In stock 5 / 5.00 / 500.00, and Total to buy 10 / 10.00 / 1,000.00.
  - "Merge into one row" was preselected (32-merge-dialog.png).
- **Choices:**
  - Choosing "Don't merge" changed the button to **Add 2 rows**.
  - **Back to list** and **Escape** both returned to the list with the same two rows ticked.
- **Merge:**
  - It made one row tagged "260012 · Sold + In stock", 10 pcs / 10.00 ct, and the toast said "Added 1 item from Memo Stock".
  - The row panel said "Sold 5 pcs / 5.000 cts must be purchased. Up to 5 pcs / 5.000 cts more from stock."
- **Merged row limits:**
  - Pcs 4 and Weight 4.5 snapped back to 5 / 5.000 when I left the field.
  - Pcs 11 and Weight 10.5 snapped back to 10 / 10.000.
  - Pcs 7 filled Weight 7.00.
  - Price could be changed.
  - Emptying Pcs showed "At least 5 pcs (already sold to customers)" under the field and on the row (45-merged-empty-pcs-toast.png).
- **Don't merge:**
  - It gave two rows. The Sold row had Pcs and Weight locked, with only Price and Note editable.
  - The In-stock row could change Pcs, Weight and Price (39-sold-row-panel.png).
- **Pair offered later:**
  - With only the Sold row on the form, I picked the In-stock part afterwards. The same question appeared, and Merge turned the existing row into the merged row (42-pair-later-dialog.png).
- **Approve takes the Sold part first:**
  - The merged row kept 7 of 10 pcs.
  - After approval, Purchase Outstanding showed MR-3 with Purchase 7 and Sale 0, and Memo Stock showed 3 pcs left in stock.
  - So all 5 sold pieces were settled first, and 2 came from stock.

### 5. Purchase Outstanding

- Before the purchase, MR-3 read: Memo 10, Return 0, Purchase 0, **Sale 5**, Balance 10.
- After approving Purchase 5, MR-3 read: Memo 10, Return 0, Purchase 7, **Sale 0**, Balance 3 / 3.00, with value 300.00 AFN (50-outstanding-after-pu.png).
- Every row matched Memo − Return − Purchase:
  - MR-1: 30 − 12 − 13 = 5.
  - MR-2: 13 − 3 − 0 = 10, and 6.63 − 1.54 = 5.09 ct.
  - MR-4: 20.
- Sale shows as a plain number, as the owner asked.
- **KPI Grand total (AED):**
  - It fell from 507,625.68 to 437,625.68. That is exactly the 7 ct × 100 AFN × rate 100 that was bought.
  - The other KPIs: 4 documents, 1 overdue, 1 due within 7 days.
- **Expand:** MR-3 expanded to item 260012 with the same numbers and 100.00 AFN per ct (51-outstanding-mr3-expanded.png).
- **Sort** worked on Balance Outstanding (both directions), Doc Number, Due Date, Sale and Purchase.
- **Search and filters:**
  - "MR-4" filtered the list to one document, and the KPIs followed.
  - Nonsense text showed "No documents match these filters." with **Clear filters** (52-outstanding-search-empty.png).
  - The date range 05/11/2026 → 06/11/2026 kept only MR-3 and MR-4.
- Reserve and Memo Out did not change Purchase Outstanding: MR-4 stayed at a balance of 20. This matches the formula.

### 6. From Stock on Quotation, Reserve and Memo Out

- **Quotation QT-29** (ref MT-QT-STOCK):
  - "Add From Stock" listed Memo Stock items with Ref. (MR no.) and Doc Date.
  - Picking 260013 copied its details, and the toast said "Added 1 item from Stock".
  - I saved it at 4 pcs × 350 THB.
  - **Nothing was held**: 260013 still showed 20 pending.
- **Reserve RS-1** (ref MT-RS-001), 2 pcs of 260013:
  - The Approve text read "Its 1 stock item is held for the customer".
  - After approval, From Stock showed **18** pending.
- **Memo Out 3** (ref MT-MO-STOCK), 1 pc of 260013:
  - The Approve text read "Its 1 stock item is cut from Memo Stock".
  - After approval, Memo Stock showed **17** (77-pu-memo-stock-after-reserve-memoout.png).
- When I edited the Quotation again, From Stock left out 260013 because it was already on the document.
- Our own stock (inventory) is not built yet, so it is out of scope. The stones bought on Purchase 5 (Stock IDs 260014–260016) do not appear in From Stock, which is expected for now.

## Problems found

### 1. Purchase: choosing the vendor again silently removes all picked rows (medium) — [INV-20261107-002](../../task/investigation/INV-20261107-002-purchase-vendor-reselect-clears-picked-rows.md)

- Starting point: a new Purchase with vendor V001, one Memo Stock row and/or one Purchase Order row, and a keyed-in row.
- Steps: open the Vendor list and click V001 again (or another vendor).
- Expected: nothing changes for the same vendor. For a different vendor, I am asked first.
- Actual: all Memo Stock and Purchase Order rows vanish, with no question and no message. Keyed-in rows stay ([59-vendor-change.png](artifacts/2026-11-07-purchase-flows/59-vendor-change.png)).
  - With a different vendor, the currency also changed by itself (AFN → AED).
  - The same happens when editing a saved Purchase.

### 2. New, untouched documents ask "Discard unsaved changes?" (low–medium) — [INV-20261107-008](../../task/investigation/INV-20261107-008-new-vendor-documents-marked-unsaved.md)

- Steps:
  1. From the sidebar, open Purchase Order (PO), Memo Receive or Memo Return.
  2. Type nothing and switch to another tab.
- Expected: no unsaved mark.
- Actual:
  - The tab shows the unsaved dot ([66-untouched-dirty-again.png](artifacts/2026-11-07-purchase-flows/66-untouched-dirty-again.png)).
  - Closing it asks to discard changes (09b-close-untouched-pu.png).
  - Reloading the browser shows "Leave site?".
- Seen every time on Purchase Order, Memo Receive and Memo Return, and in 2 of 3 tries on Purchase. Never on Quotation or Memo Out.

### 3. Purchase Order: a row typed without a stone looks empty, and Save won't say why it fails (medium) — [INV-20261107-004](../../task/investigation/INV-20261107-004-row-without-stone-shows-empty-and-save-gives-no-hint.md)

- Steps:
  1. In row 1, type Lot, Pcs 2, Weight 0.5 and Price 100, but no Stone. Close the panel.
  2. Fill the vendor and Due Date, then Save.
- Expected: the row shows my numbers, and Save says "Row 1: choose the stone".
- Actual:
  - Row 1 still reads "Empty row · click to key in", and Totals are 0.
  - Save only says "Please complete the required fields", and nothing on the page is marked ([82-po-row-without-stone-save.png](artifacts/2026-11-07-purchase-flows/82-po-row-without-stone-save.png), 83-po-row-without-stone-panel.png).

### 4. Purchase: separate Sold and In-stock rows look the same (low–medium) — [INV-20261107-003](../../task/investigation/INV-20261107-003-purchase-separate-sold-instock-rows-look-identical.md)

- Steps:
  1. Pick the Sold row and the In-stock row of 260012.
  2. Choose Don't merge, then Add 2 rows.
- Expected: I can see which row is the sold part. That row can only change its price.
- Actual: both rows read identically, and I had to open each one to find out ([38-dont-merge-two-rows.png](artifacts/2026-11-07-purchase-flows/38-dont-merge-two-rows.png)).

### 5. Typed weights lose the third decimal and a final 5 rounds down (low–medium, needs the owner's rule) — [INV-20261107-007](../../task/investigation/INV-20261107-007-typed-weight-loses-third-decimal.md)

- On the Purchase Order row panel I typed these weights:
  - 0.125 → 0.12
  - 1.255 → 1.25
  - 2.415 → 2.41
  - 3.335 → 3.33
- PO-4 was saved with 2.41 although I typed 2.415. Memo Stock rows, by contrast, show three decimals (5.000).

### 6. Purchase Order: "Required" messages stay after I fix them (low) — [INV-20261107-005](../../task/investigation/INV-20261107-005-po-required-messages-stay-after-fix.md)

- After an empty Save, choosing the vendor filled the Address, but "Required" stayed under it.
- "Add at least one item" stayed after I added two rows ([13-vendor-picked.png](artifacts/2026-11-07-purchase-flows/13-vendor-picked.png), 18-po-two-rows.png).
- Both cleared only after a successful Save.

### 7. Purchase Order calls the buying price "Sale Price" (low) — [INV-20261107-006](../../task/investigation/INV-20261107-006-po-price-labelled-sale-price.md)

- The PO item table and the row panel say "Sale Price". The Purchase page says "Price", which suits a purchase from a vendor.

## Smaller notes (no ticket; for the owner to judge)

- **Merged row, value below the sold part:**
  - Typing 4 pcs shows no message while I type. When I leave the field it quietly goes back to 5.
  - This matches the agreed behaviour (the value snaps back). A short message would help new staff understand why.
- **Over-cap rows:** an In-stock row or a Purchase Order row accepts more than the available quantity in the panel (6 of 5), with no colour change. Only Save says "Row 2: More than the pending 5 pcs". A Quotation From Stock row also accepted 25 of 20 pcs in the panel. I did not save it that way.
- **Merged row, first column:** it shows "260012 · Sold + In stock" and the lot, but not the Memo No. (MR-3). The rev 3 spec mentions Stock ID, Lot and Memo No.
- **Approved Purchase:** the Memo Stock and Purchase Order buttons still look dark and active, but clicking them does nothing because they are disabled.
- **Empty shape:** where a stone has no shape, the word "Shape" is printed as if it were the value, for example "Shape · 1221" and "260012 DIAMOND Shape · RED" in the merge dialog.
- **Vendor names:** in the Purchase Outstanding vendor filter both vendors show only as "Org", "Org", without codes, so they can't be told apart. This is test data, also noted on 2026-11-02.
- **Memo Outstanding › Vendor** uses the column name "Sold" for the quantity that Purchase Outstanding calls "Purchase". MR-3 shows Sold 7 there and Purchase 7 here, while "Sale" here means sold but not yet purchased. The two reports use the word "sold" differently, which may confuse users (78-memo-outstanding-vendor.png).
- **Exchange rate format:** it shows 100.0000 while editing and 100 after saving.
- **Purchase photos:** the Purchase row panel says "Photos for this document come in a later update."
- **After deleting a Purchase,** the toast reads "Deleted by Super Admin on 07/11/2026 10:52 · Read-only". The words "Read-only" look odd in a deletion message.
- **Purchase Order Save:**
  - The first time, the page stayed on the new form and its number preview for a few seconds before it switched to the saved document. Quotation did the same, showing the preview QT-30 for a moment.
  - This is probably the slow dev build. I did not double-click Save.

## Not run

- **A Sold quantity changing between Save and Approve** (rev 3, R3-04). There is no Sale page, and only item 260012 had a sold part. I used up its sold part on Purchase 5, so I did not ask for more data.
- **Permissions** for Purchase Order, Purchase and Purchase Outstanding with a limited user. Only the admin was used.
- **Print, Excel and Duplicate**, and the Purchase Outstanding column settings, print, Excel and page-size controls beyond the default.
- **Browser Back/Forward** between tabs, mobile or tablet widths, and a production build.
- **More than one photo**, and photos on Purchase. Purchase says photos come later.
- **Quotation and Memo Receive typed rows**, for the weight-rounding and "row without stone" problems. Only the Purchase Order was checked.

## Test data created (local dev database)

| Item | Reference | State |
|---|---|---|
| Purchase Order PO-4 | ref "MT-PO-001 rev", V001, AFN | Approved. Both lines are now fully purchased. |
| Purchase Order PO-5 | ref MT-PO-DEL | Deleted from the screen |
| Purchase 5 | ref MT-PU-001 | Approved: merged 260012 ×7, PO-4 line 1 ×3 (Stock ID 260014), PO-4 line 2 ×10 (260015), keyed-in GRDI-SD ×2 (260016) |
| Purchase 6 | ref MT-PU-RACE-A | Deleted from the screen (the approval was refused first) |
| Purchase 7 | ref MT-PU-RACE-B | Approved: PO-4 line 1 ×2 |
| Quotation QT-29 | ref MT-QT-STOCK, 260013 ×4 | Saved (holds nothing) |
| Reserve RS-1 | ref MT-RS-001, 260013 ×2 | Approved |
| Memo Out 3 | ref MT-MO-STOCK, 260013 ×1 | Approved |

Effect on Memo Stock after the run:

- 260012 (MR-3): sold part fully purchased. 3 pcs / 3.00 ct still in stock on memo.
- 260013 (MR-4): 17 pending, 2 reserved (RS-1), 1 out on Memo Out 3.
