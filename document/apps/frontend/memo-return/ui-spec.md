# UI specification: memo-return

- Feature ID / revision: `memo-return` / 1
- Status: **implemented with its API** 2026-10-29 ([SA rev 1](../../backend/master/memo-return/decisions.md)).
- Owner 2026-10-29 (verbatim): "uxui ช่วยเขียน spec memo return ให้หน่อยและ frontend backend ช่วยเขียน UI และ api ให้หน่อย Memo Return No.: ดึงค่ามาจาก Document set up ด้วย"
- Memo Stock source (owner answer 2026-10-29): **Memo Receive**. The rows are the vendor's memo receive lines that still have a quantity out.
- Sources (owner design, 1920×1080 / 3840×2160; SHA-256 prefixes):
  - [01-new.png](source/01-new.png) `ad60293bf7d105a0`: new document.
  - [02-memo-stock.png](source/02-memo-stock.png) `8ada788774f1d730`: Add Memo Stock window.
  - [03-memo-stock-selected.png](source/03-memo-stock-selected.png) `baaf45b44595ec23`: rows checked.
  - [04-added.png](source/04-added.png) `c0b7000a676eff95`: rows added, toast.
  - [05-return-entry.png](source/05-return-entry.png) `dfb997e8ff34fea4`: Return keyed in.
  - [06-saved-view.png](source/06-saved-view.png) `19847c44d236de2a`: saved document in view mode.
- Bundle: this file, [open-questions.md](open-questions.md), [testing.md](testing.md); TODO [`task/todo/memo-return.md`](../../../task/todo/memo-return.md).
- No new package. Reuses the shared document form and the return item table (`features/trade-document/**`) and the Quotation components.

## Route and navigation

- `/memo/memo-return` opens a new document; `/memo/memo-return/[id]` opens a saved one.
- Sidebar: Memo › Memo Return, active on both routes. Breadcrumb: Home › Memo › Memo Return.
- Permission: `memo-return:VIEW` / `ADD` / `EDIT` / `DELETE`. Without VIEW the page shows "You don't have permission to view memo returns."

## New / edit (sources 01, 04, 05)

```
[ Memo Return No.: MRGMS2609001 [scan]              print · excel · duplicate · refresh ]
[                                    [+ Create New] [Cancel] [Save] [Edit] [Delete]   ]
[ Doc Date* | Vendor* (wide)                   | Address* (wide)                      ]
[ Due Date* | Currency*     | Exchange Rate (read-only) | Ref.                        ]
[ Item  5 rows  [Memo Stock] [scan]                                       | rail      ]
[ [photo box + Item Note]  [item table]                                   | daybook   ]
[                          [+ Add row]                                    | summary   ]
[ Document Note (0/250)                          Summary Value                        ]
```

### Header and number

- **Memo Return No.** comes from Document Setup › Memo Return (key `memo-return`, default code MRT).
  - A new document shows a preview number; the number is issued on save.
  - With no setup row in effect it shows a plain number (1, 2, 3 …). The design's "MRGMS2609001" is an example.
- **Fields:** Doc Date\*, Vendor\*, Address\*, Due Date\* (≥ Doc Date), Currency\*, Exchange Rate (read-only, from Setup › Currency) and Ref. (≤ 100 characters).
  - The design spells "Vender" and "Rfe."; the page uses "Vendor" and "Ref.".
- **Choosing a vendor** picks its default address and currency. Rows already picked from another vendor are emptied.

### Item table

| Column | Content | Editable |
|---|---|---|
| ☐ / remove | checkbox (bulk "Remove N selected") and remove button | — |
| # | row number | — |
| STOCK ID · LOT | stone code (the Stock ID until memo receive issues Stock IDs, Q-MRT-05), lot | no |
| LOCATION, STONE (SHAPE · SIZE), COLOR · CLARITY (CUTTING · QUALITY), CER TYPE (CER NO.) | from the memo receive line | no |
| **Outstanding** Pcs, Weight | still out on that memo receive line when the row was picked | no |
| **Return** Pcs, Weight | quantity sent back now | **yes, the only editable cells** |
| Memo PRICE (UNIT) | the memo receive price, "per cts" / "per pcs" | no |
| Amount | price × Return quantity | no |

- **Picking rows:** an empty row reads "Empty row · click to pick from Memo Stock". Clicking it, or the **Memo Stock** button, opens Add Memo Stock.
  - Before a vendor (or currency) is chosen, the page shows "Choose a vendor first" (or "Choose a currency first") instead.
- **Return Pcs / Weight:**
  - Picked rows start at 0 / 0.00.
  - Typing Return Pcs fills Return Weight in proportion to the Outstanding weight. For example, 7 of 10 pcs at 3.20 ct gives 2.24. The weight stays editable.
  - Return must be above 0 and not above Outstanding. Otherwise the cell turns red: "Enter the return quantity" or "More than outstanding". The server checks again.
- **Totals:** Outstanding Pcs / Weight, Return Pcs / Weight, Amount.
- **+ Add row** adds an empty row. There is no row panel: an item can't be typed by hand.
- The photo box and Item Note show as on Quotation. Photos are not available on memo documents yet.
- After adding, the toast reads "Added N items from Memo Stock" (the design says "Added 3 items memo stock").

### Add Memo Stock (sources 02, 03)

- **Content:** the chosen vendor's memo receive lines in the document's currency that still have a quantity out. Newest receipt first, up to 200 rows.
- **Rows already on this return are left out.** When editing a saved return, its own quantities count as still out.
- **Toolbar:** a search box (stone code, stone, lot, location, receive number) and **Start → Due**, which filters the receive date.
- **Columns:** checkbox (select all), #, STOCK ID (lot, "from <receive no.>", item note), LOCATION, STONE, COLOR · CLARITY, CER TYPE, **Pending** Pcs / Weight, PRICE (UNIT), Amount (price × pending).
- **Footer:** "N selected", Cancel, and **OK** (disabled until a row is checked). OK fills the empty rows first, then adds rows.

## Saved document, view mode (source 06)

- **Header:** a **"Memo Return Details"** card shows Doc Date, Due Date, Vendor, Address, Currency, Exchange Rate and Ref. as text, replacing the input fields. The Memo Stock and scan buttons are hidden.
- **Item table:** leads with **Stone Code** (STOCK ID · LOT under it). There are no checkboxes, remove buttons, inputs or Add row; Return shows as text.
- **Buttons:** Edit switches back to the form and Delete removes the draft.
  - The design's "Create User" is read as **Create New**.
  - The price header stays **Memo PRICE** (the design shows "SALE PRICE" on this screen and "Memo PRICE" on others, Q-MRT-06).
- Document Note shows as text. Summary Value works as on Quotation.
