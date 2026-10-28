# UI specification: memo-out

- Feature ID / revision: `memo-out` / 1
- Status: **implemented with its API** (2026-10-28, [SA rev 1](../../backend/master/memo-out/decisions.md), [ADR-0033](../../../adr/0033-memo-documents-in-master-service.md)). The "page structure only" notes below describe revision 1 before the API; now saving, numbers from Document Setup, the row panel and the daybook work, while photos, From Stock / Memo Outstanding and stock stay for later. Owner 2026-10-28: "uxui ทำ spec ของ Memo Out ให้หน่อยและ frontend ขึ้นหน้าโครง Memo Out ให้หน่อย". The request covers this spec and the page structure (FE-MO-001). Saving, numbering and stock need an SA revision and owner approval first (FE-MO-002…004 `requires-sa`, open questions Q-MO-01…08).
- Source: owner GMS design [source/01-memo-out-new.png](source/01-memo-out-new.png), 1920×1080, SHA-256 prefix `03ad465b59cdc890` (new document). Other states follow the Quotation page.
- Bundle: this file, [open-questions.md](open-questions.md), [testing.md](testing.md); central TODO [`task/todo/memo-out.md`](../../../task/todo/memo-out.md).
- No new package. Reuses the Quotation page components (`features/quotation/components/**`): header, header fields, item table, photo box, document note, summary value and right rail.

## What Memo Out is

Stones sent to a **customer** on memo (consignment out). The customer holds them until they buy (later a Sale) or return them (Memo Out Return). Same document shape as Quotation: customer, shipping and invoice address, currency, items, summary.

## Route and navigation

`/memo/memo-out` (new document). After the API exists, `/memo/memo-out/[id]` opens a saved one. Sidebar Memo › Memo Out links here and stays active on both. Breadcrumb: Home › Memo › Memo Out.

## Layout (source 01)

```
[ Memo Out No.: MOGMS2609001 [scan]              print · excel · duplicate · refresh ]
[                                    [+ Create New] [Cancel] [Save] [Edit] [Delete]   ]
[ Doc Date* | Customer*        | Shipping Address*     | Invoice Address*             ]
[ Due Date* | Currency*        | Exchange Rate (ro)    | Ref.                         ]
[ Item  5 rows  [From Stock] [scan]                                       | rail      ]
[ [photo box]  [item table, 5 rows visible, Totals]                       | daybook   ]
[              [+ Add row]                                                | summary   ]
[ Document Note                                   Summary Value                       ]
```

The header grid, table columns, empty-row text ("Empty row · click to key in, or use From Stock to fill it"), photo box, document note, summary and rail are identical to Quotation. Only the labels change: "Memo Out No.:", the Create New target, and the note hint "Printed on the memo out for the customer".

## Fields and rules (for the API step)

| Field | Rule |
|---|---|
| Doc Date\* | date, default today |
| Due Date\* | date by which the customer returns or buys; ≥ Doc Date; chosen by the user |
| Customer\* | active customers "CODE · Name"; choosing one picks its default shipping and invoice addresses and its currency |
| Shipping Address\* / Invoice Address\* | the customer's SHIPPING / INVOICE addresses |
| Currency\* | active currencies (Setup › Currency); a new document starts in the company currency |
| Exchange Rate | read-only, the currency's Selling Rate (sending to a customer, Q-MO-03); empty for the company currency |
| Ref. | ≤ 100 characters |
| Items | as Quotation; **From Stock** picks items that are in stock (Q-MO-02) |
| Document Note | ≤ 500 characters (the design counter shows 250, Q-MO-06) |
| Summary Value | as Quotation |

## Page structure only (revision 1, FE-MO-001)

- The page shows the full layout with a new, empty document: today's date, 5 empty rows, totals 0.00, and the company currency once known.
- **Save, Edit, Delete, Duplicate and Refresh are disabled.** A notice under the number reads "Page preview — saving Memo Out comes with its API." The number shows "New Memo Out".
- The Customer and address lists are empty until the API provides them. The Currency list and the Exchange Rate come from Setup › Currency when the user can read it.
- **From Stock** is shown as in the design but disabled ("Stock isn't available yet"), as on Quotation.
- Selecting a row doesn't open the row panel yet. It shows "Item entry comes with the Memo Out API."
- The rail opens Summary Value (live totals) and an empty Daybook ("No memo outs yet").
- Permission: the page needs `memo-out:VIEW` (existing catalog leaf). Otherwise it shows "You don't have permission to view memo outs."
