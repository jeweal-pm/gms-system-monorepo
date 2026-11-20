# Open questions: load-to-stock (UI revision 1, draft)

Owner answers so far are in [Owner answers](#owner-answers-2026-11-16); the rest are unanswered. Each row gives a **recommended default**; approving revision 1 "with the defaults" accepts every default, or the owner can answer any ID. Rows marked **SA** also need the SA bundle and its separate approval before dependent code. Evidence: E = screenshot, C = code/approved ADR, O = owner text, A = assumption.

| ID | Question | Recommended default | Alternatives | Affects |
|---|---|---|---|---|
| Q-LS-01 | What is the header **Account**? (E: "Account *" shows "Select" while items are already loaded) | The **vendor** of the picked PU lines, auto-filled by the first pick; the picker then shows only that vendor's lines | Stock account (Primary / Consignment, cf. report menus); a GL account; free choice before picking | I-02, P-01, FE-LS-003/004; SA |
| Q-LS-02 | What is the header **Currency** and which currency are Price / Stock Price / Sale Price in? (E: header USD, load Price "52,490.00 USD" = THB value) | Stock cost is kept in the **company currency (THB)**, converted at each PU's own exchange rate (as the design's Amount "THB · rate 36.20"); the header Currency defaults to THB and is the currency for Stock Price / Sale Price | Header currency = PU currency, stock cost kept in foreign currency; Currency removed | I-03, LT-11, M-08…10; SA |
| Q-LS-03 | May one Load to Stock take lines from **several vendors / currencies / PUs**? (E: picker mixes USD and THB lines of 3 PUs) | Several PUs and currencies **yes**; **one vendor** per document (follows Q-LS-01) | Any vendor; one PU per document | P-01 filter; SA |
| Q-LS-04 | **Stock ID**: the design shows "New on load / Stock ID on save SL-0311", ADR-0051 says the ID is issued at Load to Stock from the Memo Receive counter. Is it issued at **Save** or at **Approve**, and is a preview number shown? | Issued when the stock is created: approval OFF → at Save; approval ON → at **Approve**. Before that the badge shows **"Auto"** (no preview: the counter cannot be reserved, and Split makes several stocks from one line). One Stock ID per load row; IDs of deleted rows are not reused | Issue at Save even for a Draft (IDs exist for stock not yet in stock); show a "next number" preview that may change | LT-4, M-01, DV-07; **SA** (counter owner across services) |
| Q-LS-05 | Which Purchase lines can be loaded? | `MANUAL` and `PURCHASE_ORDER` lines (no Stock ID, C ADR-0051) of **approved** Purchases (incl. auto-approved). `STOCK` lines (from Memo Stock) already have a Stock ID and are excluded | Include STOCK lines (convert Memo Stock → own stock); include Draft/Pending PUs | P-01; SA |
| Q-LS-06 | Do Draft / Pending loads **hold** PU quantity? | No. Remaining = PU qty − approved/applied loads. Two drafts may name the same line; the first Approve wins, the second gets "Row n: only x pcs left" | Hold at Save (Reserve-like) | P-01 remaining, error-handling; SA |
| Q-LS-07 | Is the mode (None / Split / Merge) **per document** or **per pick**? | **Per pick batch**: each OK in P-02 creates its rows with that mode; Split groups and Merge rows can coexist in one document. The Load table shows Split group rows only for split batches | One mode per document (first pick sets it; changing mode clears load rows) | L-03…05, FE-LS-006…008 |
| Q-LS-08 | **Merge** restrictions? | ≥ 2 lines; same **price unit** (all per ct or all per pcs); same stone type not required (the user edits details). Merges the full remaining qty of each line (no partial merge) | Same stone/shape required; same currency required; allow partial | P-02, L-05; SA |
| Q-LS-09 | Can a merged row be split later / pcs-weight edited? | **No** (design: "A merged row can't be split later"; "Pcs and weight come from the PU lines"). To change it, remove the row and pick again | Allow editing pcs/weight within Σ | L-05 |
| Q-LS-10 | **Split** rules: what does "+ Split" add and must children use the full remaining? | "+ Split" adds a child row with the same details and the **unallocated** remainder (0 if none). Σ children ≤ remaining (partial load allowed). Each child has its own Location, pcs, weight, photos and Stock ID; cost per unit = PU line's | Σ must equal remaining; split by pcs only | L-04, S-01 |
| Q-LS-11 | **Location** source and "**Parcel**"? (E: "Select location" / "Parcel") | Location **required**, chosen from a Location master (catalog leaf `location-master` exists, no page/API, C). Until SA provides it: static list. "Parcel" = optional parcel/packet no. text (≤ 50) | Free text; Parcel is a location type (parcel vs set) select | LT-5, M-03; **SA** |
| Q-LS-12 | **Partial-load cost**: how is the cost of 7 of 10 pcs computed? | Unit price stays the PU line's net unit price (after PU discount, converted). Amount = loaded weight × price (per ct) or pcs × price (per pcs). The PU's remaining amount follows the same rule | Pro-rate by pcs; pro-rate by weight | LT-11/12; SA |
| Q-LS-13 | **Price / Stock Price / Sale Price** meaning? | **Price** = cost from the PU (read-only); **Stock Price** = stock valuation/landed cost, defaults to Price, editable; **Sale Price** = optional selling (tag) price. All per the row's unit, in Q-LS-02 currency | Stock Price = Price × markup %; Sale Price required | M-08…10; SA |
| Q-LS-14 | Photos and Item Note per load row? | ≤ 5 photos + note per **load row** (ADR-0048 pattern), carried onto the created stock. PU line photos are **not** copied (as Q-PU-11) | Copy PU line photos as initial photos | L-02, M-11/12; SA (storage in new service) |
| Q-LS-15 | **Empty rows** "Empty row · click to pick a PU line, or use Load in PU Items" (only in 05) and the dialog text "no Load ▸" — is there a per-item "Load ▸" action in the Item table? | No empty rows and no "Load ▸" action in rev 1: rows come only from P-01/P-02; clicking the empty Load area opens P-01 | Add a "Load ▸" action per Item row that appends a None row | L-06 |
| Q-LS-16 | **Scan** buttons (header and Item) | Disabled placeholders, as every transaction page (C) | Barcode lookup of PU no. | H-01, T-03 |
| Q-LS-17 | **Duplicate** on Load to Stock? | Disabled (rows are bound to PU remaining) | Copy header only | H-03 |
| Q-LS-18 | Below the fold: **Document Note** and **Summary**? | Document Note 250 + rail Summary with Σ pcs / weight / amount; no discount, tax or charges | No note; no Summary | S-NOTE, R-01 |
| Q-LS-19 | **Edit / delete** rules (ADR-0050) | Approval ON: editable in Draft / Revise; locked when Pending; Approved read-only. OFF: editable / deletable until **any created stock is used** by another document (Merge/Split, Transfer, Adjustment, Memo Out, Sale…; none built yet → always editable). Edit/delete reverses PU deduction and stocks | Read-only after Save when OFF | H-05; **SA** (used-check across services) |
| Q-LS-20 | **Document number** "LSGMS2609001" | Document Setup › Load to Stock, default code **LS** (C, already seeded in master `document-setup.transactions.ts`); preview grey until Save | Own numbering in the new service | H-01; SA |
| Q-LS-21 | **Weight remainder** when the last pcs is loaded (pcs remaining 0, weight left) | The PU line closes when remaining pcs = 0 (O); the last load must not exceed remaining weight; any weight left is written off on that line (shown as a row hint "x ct left on PU will be closed") | Require weight = remaining on the last load | P-01, validation; SA |
| Q-LS-22 | Backend: **new service** (O "สร้าง service ใหม่เลยไม่รวมกับ master") | Accept as owner direction; SA designs the service, its DB schema, how it reads/deducts Purchase lines and issues Stock IDs owned by master, Approval Setting, Document Setup, permissions, and capacity (new container within 4 GB / 2 vCPU) | Module inside backend-api-master | All requires-sa; **SA + infra** |

## Owner answers 2026-11-16

| ID | Owner (verbatim) | Decision |
|---|---|---|
| Q-LS-07 | "ไม่ได้ 1 ใบ 1 โหมดเท่านั้น" | **One mode per document.** The first pick sets None / Split / Merge; later picks in the same document use that mode (Merge: one merged row per document). Changing the mode needs the Load table emptied first |
| Q-LS-08 | "หมายถึง unit ใช่ไหม ถ้าใช่ อิสระเลย เวลา Merge อย่างน้อย 2 แถว display ในตาราง load เลือก 1 แถวที่ราคามากที่สุดมาแสดงผล" | Merge needs ≥ 2 lines; price units may be **mixed** (per ct and per pcs). The merged row shows the details of the **highest-priced** picked line. Full remaining qty of each line (default kept) |
| Q-LS-11 | "location เป็น require" | Location **required** (default kept) |
| Q-LS-13 | "บังคับใส่หมดทั้ง stock price sale price เริ่มต้นเป็นช่องว่างไว้" | **Stock Price and Sale Price both required**, start **empty** (no default from Price). Price = PU cost, read-only |
| Q-LS-14 | "รูปจาก Pu ตามมาด้วยแต่เปลี่ยนรูปได้ไม่เกิน 5 รูป" | PU line photos are **copied** as the load row's initial photos; the user can change them, ≤ 5 per row. (Merge: photos of the line whose details are shown) |
| Q-LS-03 | "เอาตามที่แนะนำ มีได้ แต่ต้องเป็นผู้ขายรายเดียว" | Several PUs and **currencies allowed**, **one vendor** per document; cost kept in THB at each PU's rate (default kept) |
| Q-LS-12 | "ก" | Partial-load cost **by the PU line's price unit**: per ct → loaded weight × unit price × PU rate; per pcs → loaded pcs × unit price × PU rate. The PU keeps the rest (default kept) |

| Q-LS-23 | "ตาม company profile currency" | Header Currency = the **Company Profile currency**, read-only; Stock Price / Sale Price in it; PU costs converted to it at each PU's rate (ADR-0052 D7) |
| Q-LS-26 | "ถ้า pcs เป็น 0 จะไม่แสดงแล้ว ไม่สามารถโหลดของที่เป็น 0 ชิ้นได้อยู่แล้ว แต่ถ้า weight เป็น 0 ทำได้ แถวที่โหลดใส่ 0 ได้ถ้าต้นทางเป็น 0" | Only lines with remaining pcs > 0 are shown/loadable; load-row pcs ≥ 1; load-row weight may be 0 when the source weight is 0 |
| Q-LS-28 | "เป็นช่องว่างที่ต้องเลือกเหมือนช่อง stone shape" | Location = required select, starts empty, options from a master list (Location Master); no default row. Follow-up Q-LS-34 in ADR-0052 |
| Q-LS-29 | "เหมือน memo receive 260001" | Stock ID format as Memo Receive (`YY####`, e.g. 260001); the design's "SL-0311" is replaced |
| Q-LS-30 | "ได้ ปุ่ม from stock ทั้งหมด คือ stock นี้ + memo stock ตามที่เคยบอก" | Every From Stock picker lists our own (loaded) stock **and** Memo Stock — designed in ADR-0052 D15, phased; follow-ups Q-LS-35/36 |
| Q-LS-33 | "delete เป็น soft delete ก็จริงแต่ user นำกลับมาเองไม่ได้ งั้นไม่ต้อง" | No Restore for Load to Stock; a deleted load stays in the Deleted filter, read-only |
| Q-LS-32 | (owner asked what the notifications are; parent explains) | Pending: approvers on Send to approve, creator on Approve / Revise / Reject (ADR-0049) |
| Q-LS-24, 25, 27, 31 | (no answer) | ADR-0052 defaults stand |

New source image 06 (`source/06-load-mode-dialog-states.png`, 2026-11-16): None / Split / Merge selected states; Merge primary button "Merge · create 1 load row". Consistent with one mode per document (Split starts with one row per PU line); on later picks the dialog must keep the document's mode (other cards disabled). ui-spec to update the text.

All other Q-LS rows: owner moved on to SA design 2026-11-16 ("ทำเอกสาร ออก adr diagram") without changing them; the defaults stand for the SA draft and are confirmed with the bundle approval.

## Owner answers 2026-11-17

| ID | Owner (verbatim) | Decision |
|---|---|---|
| Q-LS-01 (revised) | "Account เอาแบบ ข สิ มีหน้าบางหน้าบังคับให้เลือก vendor ก่อนถึงจะเรียกของใน stock ได้ อันนี้เช่นกัน" | The user **chooses Account (vendor) first**; From Purchase then lists only that vendor's PU lines. Account locks while the Load table has rows. Replaces the "auto-fill from the first pick" default (matches the implemented frontend) |

## Owner answers 2026-11-18 (phase 2)

| ID | Owner (verbatim) | Decision |
|---|---|---|
| Q-LS-P2-02 | "load ต้องเพิ่ม มี lot" (+ [source/07-row-panel-lot.png](source/07-row-panel-lot.png): row panel Info = Stock ID, Lot, Location) | **Load to Stock rows get a Lot field** (row panel Info section, next to Stock ID), stored on our stock; our-stock rows in From Stock show the Lot badge like Memo Stock. Changes phase-1 load row / stock schema → SA rev 2 |
| Q-LS-P2-05 | asked for an explanation | pending (explained in chat) |
