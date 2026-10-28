# UI specification: memo-out-return

- Feature ID / revision: `memo-out-return` / **3**
- Status: **implemented with its API** (2026-10-28, [SA rev 1](../../backend/master/memo-out/decisions.md), [ADR-0033](../../../adr/0033-memo-documents-in-master-service.md)). The "page structure only" notes below describe revision 1 before the API; now saving, numbers from Document Setup, the row panel and the daybook work, while photos, From Stock / Memo Outstanding and stock stay for later.
  - Revision 3, owner 2026-10-28: "frontend backend Memo Out Return head coulumn ยังไม่ตรง เอา More ออกและ เปลี่ยน head ให้ตรง สามารถแก้ไขได้แค่ column return", with design [source/02-memo-out-return-columns.png](source/02-memo-out-return-columns.png) (2108×1183, SHA-256 prefix `d28322c60cef8c64`). Item table columns renamed, row menu removed, only the Return cells are editable (see "Item table (revision 3)").
  - Revision 2, owner 2026-10-28: "Memo Out Return ยังไม่ตรง design เขียนuxuiเขียน spec และ frontend ทำ ui ให้ตรง". The owner supplied the design and asked for the spec and the UI to match it.
  - Revision 1, owner 2026-10-28: the first spec and page structure, written from text only.
  - API: owner 2026-10-28 "frontend backend ให้ Memo Out กับ Memo Out Return เชื่อมกับ document setup และ ทำ api เลย"; party = vendor (owner answer). Stock and the Memo Outstanding source stay open (FE-MOR-004, Q-MOR-03…09).
- Source: owner GMS design [source/01-memo-out-return-new.png](source/01-memo-out-return-new.png), 1920×1080, SHA-256 prefix `0b4b2966c3415064` (new document). It replaces the revision 1 proposal.
- Bundle: this file, [open-questions.md](open-questions.md), [testing.md](testing.md); central TODO [`task/todo/memo-out-return.md`](../../../task/todo/memo-out-return.md).
- No new package. Reuses the shared document form (`features/trade-document/document-form.tsx`) and the Quotation components. The item table is its own component (`ReturnItemTable`) because of the Pending/Return columns.

## Route and navigation

`/memo/memo-out-return` (new document). After the API exists, `/memo/memo-out-return/[id]` opens a saved one. Sidebar Memo › Memo Out Return. Breadcrumb: Home › Memo › Memo Out Return.

## Layout (source 01)

```
[ Memo Out Return No.: MORGMS2609001 [scan]        print · excel · duplicate · refresh ]
[                                    [+ Create New] [Cancel] [Save] [Edit] [Delete]     ]
[ Doc Date* | Vendor* (wide)                  | Address* (wide)                         ]
[ Due Date* | Currency*     | Exchange Rate (read-only) | Ref.                          ]
[ Item  5 rows  [Memo Outstanding] [scan]                                    | rail     ]
[ [photo box "Add up to 5 photos" + Item Note]  [return item table]          | daybook  ]
[                                                [+ Add row]                 | summary  ]
[ Document Note (0/250)                          Summary Value                         ]
```

| Area | Design |
|---|---|
| Header row 1 | Doc Date (200 px), **Vendor** and **Address** share the rest equally (design text "Vender" is spelled "Vendor") |
| Header row 2 | Due Date, Currency, Exchange Rate (read-only), Ref. (design text "Rfe.") |
| Item toolbar | "Item", row count, dark **Memo Outstanding** button (picks lines from memo outstanding), scan icon |
| Item table columns | checkbox · remove · # · Stone Code (STOCK ID · LOT) · LOCATION · STONE (SHAPE · SIZE) · COLOR · CLARITY (CUTTING · QUALITY) · CER TYPE (CER NO.) · **Pending** group (Pcs, Weight) · **Return** group (Pcs, Weight), tinted `#E3F0F0` across header and rows · SALE PRICE (UNIT) · Amount · More. The table scrolls sideways; 5 rows show. |
| Empty row | "Empty row · click to pick from Memo Outstanding" |
| Totals row | "Totals" with dividers under Pending, Return and price |
| Document Note | counter **0/250** |
| Summary Value | as Quotation |

Meaning of the groups: **Pending** = pieces/weight still out on the memo; **Return** = pieces/weight coming back now (editable once the API exists, ≤ Pending).

## Item table (revision 3, source 02)

Replaces the item table row above where they differ.

| Column | Content | Editable |
|---|---|---|
| # | row number | — |
| STOCK ID · LOT | stock id (stone code until stock exists), lot badge | no |
| LOCATION, STONE (SHAPE · SIZE), COLOR · CLARITY (CUTTING · QUALITY), CER TYPE (CER NO.) | as picked | no |
| **Outstanding** Pcs, Weight | quantity still out when the row was picked (was "Pending") | no |
| **Return** Pcs, Weight | quantity coming back now, ≤ Outstanding ("More than outstanding" otherwise) | **yes, the only editable cells** |
| Memo PRICE (UNIT) | price per unit, document currency (was "SALE PRICE") | no |
| Amount | price × Return quantity | no |

- No checkbox, remove or **More** column, no **Add row** button (owner 2026-10-28: "frontend Memo Out Return เอาปุ่ม add row ออก"), and no row panel: rows come only from Memo Stock (Memo Outstanding). Empty row text: "Empty row · click to pick from Memo Stock"; clicking one shows "Memo Stock isn't available yet" until the picker exists.
- No tint on the Return group; dividers separate Outstanding, Return and price, in the header and the Totals row.
- Totals: Outstanding Pcs/Weight, Return Pcs/Weight, Amount.
- In view mode the Return cells are read-only.

## Page structure only (FE-MOR-001)

- New, empty document: today's date, 5 empty rows, the company currency once known, totals 0.00.
- Save, Edit and Delete are disabled. The notice under the number reads "Page preview — saving Memo Out Return comes with its API."
- Vendor and Address lists are empty until the API exists. The Exchange Rate is read-only from Setup › Currency.
- **Memo Outstanding** is disabled ("Memo Outstanding isn't available yet").
- Selecting a row shows "Item entry comes with the Memo Out Return API."
- The rail shows Summary Value and an empty Daybook ("No memo out returns yet").
- Permission: `memo-out-return:VIEW`.
