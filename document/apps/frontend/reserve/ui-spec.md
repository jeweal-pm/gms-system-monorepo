# UI specification: reserve

- Feature ID / revision: `reserve` / 1
- Status: **approved** 2026-11-02 (owner 2026-11-02: "อนุมัติ reserve revision 1"). Owner request: "uxui ช่วยเขียน spec Reserve โดยฟังชันก์นี้ จะเป็นการจองของเพื่อนำไปทำหน้า sale frontend backend ทำ ui และ api ให้หน่อย". Answers Q-RS-01…04 in [open-questions.md](open-questions.md).
- Sources (owner GMS design, 1920×1080 / 3840×2160):
  - [source/01-reserve-new.png](source/01-reserve-new.png), SHA-256 prefix `73ef791596434e43`: the new document.
  - [source/02-add-from-stock.png](source/02-add-from-stock.png), SHA-256 prefix `65989943c4eafa34`: the Add From Stock dialog.
- Backend: [SA revision 1](../../backend/master/reserve/decisions.md), [ADR-0036](../../../adr/0036-reserve-document.md). TODO: [task/todo/reserve.md](../../../task/todo/reserve.md).
- No new package. Reuses the shared document form, the Quotation components and the Memo Stock picker, as Memo Out revision 2 does.

## What Reserve is

A Reserve **holds stones for a customer so they can be sold later** (the Sale page, a later revision).
- Saving it holds nothing. When it is **approved**, its From Stock rows move from Memo Stock pending into **Reserve** (owner Q-RS-02, the Q-MR-15 rule).
- Memo Outstanding › From Vendor shows them in the Reserve column (Q-MOV-04).
- Rows keyed in by hand hold nothing (Q-RS-04).

## Route and navigation

- `/pre-sale/reserve` is a new document; `/pre-sale/reserve/[id]` is a saved one.
- The sidebar Pre-Sale › Reserve item links there and stays active on both. The breadcrumb reads Home › Pre-Sale › Reserve.
- Access needs the existing leaf `reserve`: VIEW / ADD / EDIT / DELETE / APPROVE.

## Layout (source 01)

```
[ Reserve No.: RS-… [scan]                         print · excel · duplicate · refresh ]
[                                    [+ Create New] [Cancel] [Save] [Edit] [Delete]    ]
[ Doc Date* | Customer*        | Shipping Address*     | Invoice Address*              ]
[ Due Date* | Currency*        | Exchange Rate (ro)    | Ref.                          ]
[ Item  5 rows  [From Stock] [scan]                                         | rail     ]
[ [photo box]  [item table, Totals]                                         | daybook  ]
[ Document Note                                     Summary Value                      ]
```

- The page is the Quotation / Memo Out page: same header fields, item table columns (Stone Code · Stock ID · Lot, Location, Stone, Color · Clarity, Cer Type, Pcs, Weight, Sale Price, Amount, More), photo box, document note, summary and rail.
- **One button, From Stock** (owner Q-RS-01: "ทำให้เหลือปุ่มเดียวคือ from stock"). The design's From Memo button is dropped.
- The empty row reads "Empty row · click to key in, or use From Stock to fill it".
- The number comes from Document Setup › Reserve (default code RS). The design's "ODGMS2609001" is an example.
- Labels: "Reserve No.:"; the note hint is "Printed on the reserve for the customer".

## From Stock dialog (source 02, "Add From Stock")

- It lists items with something pending, from every vendor, 50 at a time with Load more. That is Memo Stock (stones borrowed through approved Memo Receives) plus our own stock once the inventory exists (Q-RS-01: "รวมของ จาก memo และ คลัง"). Until then, Memo Stock only.
- Columns: checkbox, #, Stone Code · Stock ID · Lot ("from {Memo Receive No.} · {vendor}"), Location (`Memo`), Stone · Shape · Size, Color · Clarity / Cutting · Quality, Cer Type · Cer No., Pending Pcs / Weight.
- The design's Sale Price and Amount columns are dropped: the stock has no customer price yet, and the vendor's cost isn't shown (as Memo Out, Q-MO-11).
- Search "Search Stock ID, Lot, Stone, Cer No." (owner Q-MR-10 corrected the design's "Search for a project"). Start → Due filters the Memo Receive Doc Date.
- Items already on the document are left out. OK adds the checked items: they fill the empty rows first, then are appended. The toast reads "Added N items from Stock".

## Rows

- **From Stock rows**, as Memo Out revision 2:
  - The first column shows the Stock ID.
  - Location `Memo`, the stone fields and the certificate are read-only.
  - Pcs / Weight start at the item's full pending and can be lowered, never above pending. Pcs fills Weight in proportion, and the row panel shows "Pending x pcs / y ct".
  - Sale Price starts empty and is required.
  - Duplicate is hidden on these rows.
- **Rows come From Stock only** (owner 2026-11-02, after revision 1: "Reserve ไม่มีการ add row", then "ตอนกดช่องที่ไม่มีข้อมูลต้องไม่ขึ้น side bar ให้กรอก"):
  - There is no Add row button under the table, matching design 01.
  - Clicking an empty row opens **Add From Stock** instead of the row panel. The empty row reads "Empty row · click to pick From Stock".
  - A row filled from stock still opens the row panel (Pcs / Weight, Sale Price, discount, note). Next row there stops at the last row.
  - From Stock still appends rows when the empty rows run out.
  - So rows can't be typed by hand. This supersedes Q-RS-04 (see open questions).

## Status and Approve

- Save → **Pending Approval** (orange). Edit and Delete work only while pending.
- **Approve** (`reserve:APPROVE`; a saved pending document in view mode with no unsaved changes) asks: "Approve this Reserve? Its N stock items are held for the customer and it can no longer be edited." With no stock rows: "…It has no stock items, so nothing is held."
- After approval: **Approved** (green), read-only.
- If another document took the stock first: "Some stock items no longer have enough pending. Edit the row and approve again." The Reserve stays pending.

## Not in revision 1

- Releasing or cancelling an approved Reserve (Q-RS-03, later).
- Sale (later; it will move Reserve to Sold).
- Our own stock in From Stock (inventory).
- Line photos (as Memo Out).
