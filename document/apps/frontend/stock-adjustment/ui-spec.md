# UI spec: Stock Adjustment (UI revision 1)

- Feature ID: `stock-adjustment` (menu Inventory › Stock Adjustment, permission leaf `stock-adjustment`)
- Revision: **1**, status **approved** 2026-11-24
- Approval: approved-revision UI 1 · approved-by owner · approved-at 2026-11-24T00:00:00+07:00 · approval-evidence owner "คำถามด้านบน อนุมัติตามค่าตั้งต้น มีคำถามอีกไหมฉันอยากให้คนทำต่อไม่ต้องตอบคำถามเลย" in chat, 2026-11-24 (UI rev 1 + SA rev 1 / ADR-0059; Q-SAJ-01…12 and SQ-SAJ-01…03 take their defaults; the implementer asks the owner nothing more)
- Source: owner design images in [source/](source/) (no Figma) and the owner request of 2026-11-24
- TODO: [task/todo/stock-adjustment.md](../../../task/todo/stock-adjustment.md) · open questions: [open-questions.md](open-questions.md) (Q-SAJ-01…12)
- SA bundle: [inventory/stock-adjustment](../../backend/inventory/stock-adjustment/decisions.md) · [ADR-0059](../../../adr/0059-stock-adjustment-document.md) (Accepted)
- Item ID code: **SAJ** (`FE-SAJ-nnn`, `Q-SAJ-nn`). `SA-` is already used for SA decisions, so `SA` stays only as the **document number prefix**.

## Owner request (verbatim, 2026-11-24)

> Stock Adjustment คือการดึงของในคลังเรา(load)มาปรับให้ตรงกับของที่มีจริงๆ ช่อง stock คือที่ดึงมาจากคลัง ช่อง physical คือของจริงๆที่มีที่เราต้องใส่ พอกด save หรือ ถูก approve เเล้วของใน stockนั้นจะถูกเปลี่ยนเป็นเลขphysicalเลย ปุ่ม from stock จะเเสดงเเค่ของจากคลังเราเเล้วไม่เเสดงที่ของที่เป็น 0 ด้วย

Follow-up answers (same day):
- "Price": "ฉันว่าเอาpriceมาเเสดงในทุกช่องเลยทั้ง stock เเละ diff". The Stock, Physical and Diff groups each have Pcs / Cts / Price.
- From Stock scope: **the chosen Main Location only**.

## Purpose

This is a stock count document. The user picks lots of **our own stock** (stock that came in through Load to Stock) at one location. **Stock** shows what the system holds, **Physical** is what was actually counted, and **Diff** shows the difference. When the document takes effect, each picked Stock ID's on-hand quantity is **set to the Physical value**. It takes effect on Save when approval is OFF, or on Approve when approval is ON (ADR-0050).

## Source images

| File | Shows |
|---|---|
| [01-page-empty.png](source/01-page-empty.png) | New document `SA2611003`, 5 empty rows "Empty row · click to pick from stock" |
| [02-page-with-lines.png](source/02-page-with-lines.png) | 3 picked rows with Physical inputs at 0, Diff "–", Remark |
| [03-row-states.png](source/03-row-states.png) | Row background: default (white), hover (light grey), selected (light teal) |

The images show Price **only under Physical**. Per the owner's follow-up, rev 1 adds **Price to Stock and Diff as well** (S-03).

## Layout

Breadcrumb: Home › Inventory › Stock Adjustment. Tab title "Stock Adjustment".

### H — Header (`QuotationHeader` pattern, as Load to Stock)
| ID | Element | Rule |
|---|---|---|
| H-01 | "Adjustment No.:" + number (e.g. `SA2611003`) + barcode icon | Preview number from Document Setup key `stock-adjustment` (default code **SA**); the real number is issued on first Save. Status badge beside it, as other documents (Draft / Pending Approval / Approved / Revision / Rejected) |
| H-02 | Print, Excel, Duplicate, Refresh icons | Print / Excel / Duplicate **disabled** in rev 1 (Q-SAJ-10); Refresh reloads the document |
| H-03 | Create New, Cancel, Save, Edit, Delete | Standard document behaviour (Load to Stock). Send to approve appears when approval is ON (ADR-0050) |

### I — Info card
| ID | Field | Rule |
|---|---|---|
| I-01 | Doc Date * | Date picker, default today, display `DD/MM/YYYY` |
| I-02 | Main Location * | Dropdown of active Location Master names. **Required before From Stock / barcode / empty-row click.** If lines exist, changing it asks "Changing Main Location clears all rows. Continue?" and clears them on OK (Q-SAJ-03) |
| I-03 | Ref. | Free text ≤ 100 |

### G — Lines card "Stock Adjustment"
- Title, row count ("5 rows"), **From Stock** button (dark), barcode-scan icon button.
- Starts with **5 empty rows**. Clicking an empty row opens From Stock. There is no Add row button: every row comes from a picker (Q-SAJ-05).

Grid columns (grouped header, colours as image 01):

| Group | Column | Content | Editable |
|---|---|---|---|
| — | checkbox | row select (bulk remove) | ✓ |
| — | ⊖ | remove row | ✓ |
| — | # | running number | |
| — | Stone Code (sub-label "STOCK ID · LOT", sortable) | line 1 stone code (e.g. `SA-RBLDVGVS1AAA`); line 2 `Lot · Ref doc no` (e.g. `L-2610-053 · MI2610-007`); line 3 💬 `Stone · Shape · Size · Location` (e.g. `Sapphire · Oval · 5.0×7.0 mm · BKK-01`) | |
| **Stock** (teal) | Pcs, Cts, **Price** | the lot's on-hand quantity when picked; Cts shown as `1.12 cts`; Price = the lot's stock price per its price unit (S-03) | |
| **Physical** (pink) | Pcs, Cts, Price | numeric inputs. Pcs integer ≥ 0, Cts ≥ 0 (3 dp), Price ≥ 0 (2 dp). Shown empty (placeholder 0) until typed; Price defaults to the Stock Price (Q-SAJ-02) | ✓ |
| **Diff** (blue) | Pcs, Cts, Price | Physical − Stock, computed in the browser; "–" until the Physical field is filled; negative values red, positive green | |
| — | REMARK | text input ≤ 250 | ✓ |

Row states as in image 03: default white, hover light grey, selected (checkbox ticked) light teal. Stock and Diff columns keep their tinted background.

### N — Document Note
Textarea ≤ 250 with a counter `0/250`.

## Pickers

### P-01 From Stock
- Reuse `MemoStockModal` with `fromStock: true` (`frontend/src/features/trade-document/memo-stock-modal.tsx`), the same dialog as Memo Out / Sale.
- Lists **only our own stock (Load to Stock) at the Main Location**, grouped by lot. Lots with 0 on hand never appear (the inventory open-stock filter already does this). Memo Stock (vendor goods) never appears.
- Lots already on the document are excluded. OK is disabled until something is ticked. On OK, one row is added per picked lot, with toast "Added N items from Stock".
- Because own stock is one Stock ID per lot (ADR-0055, lot_key `OS`+id), one row = one Stock ID. The row stores the Stock ID behind the scenes.

### P-02 Barcode
The barcode icon opens a scan input. Scanning a Stock ID or lot adds that row if it is our own stock at the Main Location with on hand > 0. Otherwise toast "Not in stock at <location>" (Q-SAJ-06).

## Behaviour

| ID | Rule |
|---|---|
| S-01 | Save validates: Doc Date, Main Location, at least one picked row, every picked row has Physical Pcs **and** Cts filled (0 is allowed: it writes the lot off). Price is optional and defaults to the Stock Price |
| S-02 | A row whose Physical equals Stock on every field is allowed and posts nothing (Q-SAJ-07) |
| S-03 | Price columns: Stock Price is the lot's current stock price; Physical Price is typed; Diff Price = Physical Price − Stock Price. Whether the Physical Price **replaces** the lot's price when the document takes effect is Q-SAJ-01 (default: yes, it becomes the new stock price) |
| S-04 | Taking effect: approval OFF → Save sets on hand to Physical immediately (status Approved, auto). Approval ON → Save = Draft, Send to approve → Pending, Approve sets the stock (ADR-0050) |
| S-05 | If the lot's on hand changed between picking and taking effect (another document moved it), the save or approve is refused with the row message "Stock changed since picked (now X pcs / Y cts). Remove and pick again." (Q-SAJ-04) |
| S-06 | Physical cannot be lower than what is held for that lot (reserved or out on memo is not on hand, so this is only about on hand: Physical ≥ 0). Stock column = **on hand** only |
| S-07 | Edit / Delete of an effective document reverses it first (on hand goes back to the Stock value), and is refused if the Stock ID was used by a later document (Q-SAJ-08) |
| S-08 | Approve Center shows a Stock Adjustment panel when approval is ON (changes the Q-AP-08 default, Q-SAJ-09) |
| S-09 | Daybook and status dots as other inventory documents (Load to Stock) |

## Out of scope (rev 1)
Adding new stones not in stock (use Load to Stock), adjusting Memo Stock (vendor goods), Print / Excel layouts, a count sheet import.
