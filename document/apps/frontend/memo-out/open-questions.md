# Open questions: memo-out

These need answers before the API step (FE-MO-002…004, SA revision). The page structure (FE-MO-001) doesn't depend on them.

| ID | Question | Proposed default |
|---|---|---|
| Q-MO-01 | Does a memo out need approval (Approve page)? | No, Draft only like Quotation; approval can be added later. |
| Q-MO-02 | Does saving take the stones out of available stock, and must every line come From Stock? | Yes once the inventory service exists. Until then: manual lines only, From Stock disabled, no stock change. |
| Q-MO-03 | Which exchange rate? | The currency's Selling Rate (sending to a customer). |
| Q-MO-04 | Document number | Document Setup › Memo Out (default code MO); plain 1, 2, 3 … until it's set up. The design's "MOGMS2609001" is an example. |
| Q-MO-05 | Is Due Date required, and what does it mean? | Yes: the date the customer must return or buy. On or after Doc Date. |
| Q-MO-06 | Document Note length: the design shows 0/250, Quotation allows 500. | 500, same as Quotation (shared component). |
| Q-MO-07 | Can a memo out be turned into a Sale or a Memo Out Return from this page? | Not in revision 1. Those pages will pick up open memo outs later. |
| Q-MO-08 | Backend owner | `backend-api-master`, tables `memo_out_*` in schema `partner`, the same document engine as Quotation (needs an ADR and SA approval). |

## Revision 2 answers (owner 2026-10-31)

These supersede the revision 1 defaults of Q-MO-01 (approval) and Q-MO-02 (stock). Q-MO-01: Memo Out now has approval. Q-MO-02: From Stock is enabled and cuts Memo Stock at approval (Q-MR-15).

| ID | Question | Answer |
|---|---|---|
| Q-MO-09 | Must every row come from From Stock? | **Changed by the owner 2026-10-31 (memo-out revision 3):** "Q-MOR-13 ไม่ใช่คือหน้า memoout ทำผิดฝากเเก้ด้วยคือพิมไม่ได้เลยเเต่เเรกต้องเป็นของที่มาจาก from stock เท่านั้นเอาปุ่ม add row ออกด้วย". Every row comes from From Stock; no Add row, no keying in. (Revision 2 answer "both kinds of row" is superseded.) |
| Q-MO-10 | Can a row take part of an item? | **Yes, part or all** (up to the item's pending). |
| Q-MO-11 | What is the starting Sale Price of a From Stock row? | **Typed by the user, empty.** The Memo Stock price is the vendor's cost, so the user types the Sale Price, which is required. |
| Q-MO-12 | Does Memo Out Return put Reserve back now? | **Now:** Memo Out Return revision 4 (Q-MOR-11…18, owner 2026-10-31) puts Reserve back to pending at its approval. |
| Q-MO-13 | When is stock cut? | **At Approve** (owner Q-MR-15 2026-10-29: "ตัดตอน approve เอกสารนั้น"). Saving reserves nothing; approval re-checks pending under a row lock. |
| Q-MO-14 | Which Memo Outstanding column does an approved Memo Out fill? | **Reserve** (owner Q-MOV-04 2026-10-29: "Reserve = Reserve or Memo Out approved"). |
| Q-MO-15 | Starting Pcs / Weight of a picked row; is From Stock tied to the customer or currency? | **Approved with revision 2** (owner 2026-10-31): start at the item's full pending; any vendor's items, not tied to the customer or currency. |
