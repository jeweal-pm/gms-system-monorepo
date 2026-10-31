# Open questions: memo-out-return

These need answers before the API step (FE-MOR-002…004). The page structure follows the design (revision 2).

| ID | Question | Proposed default |
|---|---|---|
| Q-MOR-01 | Header fields | **Answered by the design 2026-10-28:** Doc Date, Vendor, Address, Due Date, Currency, Exchange Rate, Ref. |
| Q-MOR-02 | Party of a Memo Out Return | **Answered by the owner 2026-10-28:** "Memo Out ใช้ ข้อมูลจาก customer และ Memo Out Return ใช้ ข้อมูลจาก vendor". The Memo Outstanding source for vendor lines is still open (no vendor memo document exists yet). |
| Q-MOR-03 | Can one return pick lines from several memos of the same party? | Yes, through Memo Outstanding (lines, not whole documents). |
| Q-MOR-04 | Partial return? | **Answered by the owner 2026-10-28 (rev 3):** only the Return column is editable; Return Pcs/Weight ≤ Outstanding. |
| Q-MOR-05 | Stock effect on save | Once the inventory service exists; until then no stock change. |
| Q-MOR-06 | Price and Amount meaning | Memo price × returned quantity, in the document currency, for reference. |
| Q-MOR-07 | Approval step? | No: Draft only. |
| Q-MOR-08 | Document number | Document Setup › Memo Out Return (MOR); plain 1, 2, 3 … until set up. The design's "MORGMS2609001" is an example. |
| Q-MOR-10 | Where do Memo Stock / Memo Outstanding rows come from for a vendor? | Open: no vendor memo document exists yet, so the picker stays unavailable. |
| Q-MOR-09 | Due Date meaning on a return | Required per the design; meaning to confirm (e.g. the date the goods must be back). |

## Revision 4 questions (2026-10-31): Memo Outstanding picker and returning stock

Owner 2026-10-31: Memo Out lends our goods to a customer, and Memo Out Return brings them back into our own store through the **Memo Outstanding** button. Each question below has a proposed default. The SA draft ([SA rev 2](../../backend/master/memo-out-return/decisions.md)) uses these defaults until the owner answers.

| ID | Question | Proposed default |
|---|---|---|
| Q-MOR-11 | Who is the party of a Memo Out Return? On 2026-10-28 the owner answered "vendor" (Q-MOR-02). The goods now come back from the **customer** who borrowed them in Memo Out. | **Answered (Owner 2026-10-31):** "เปลี่ยนเป็น Customer เหมือน Memo Out". Customer, the same as Memo Out. |
| Q-MOR-12 | Which customer address? Memo Out has Shipping and Invoice. | **Answered (Owner 2026-10-31):** "เหมือน memo out มีสองช่อง". Two fields, Shipping Address and Invoice Address of that customer, as on Memo Out. |
| Q-MOR-13 | Memo Out rows typed manually (not From Stock): can they be returned too? | **Answered (owner 2026-10-31):** "Q-MOR-13 ไม่ใช่คือหน้า memoout ทำผิดฝากเเก้ด้วยคือพิมไม่ได้เลยเเต่เเรกต้องเป็นของที่มาจาก from stock เท่านั้นเอาปุ่ม add row ออกด้วย". Memo Out itself takes only From Stock rows (memo-out revision 3, no Add row, no keying in), so every Memo Out row is returnable through Memo Outstanding. |
| Q-MOR-14 | Does a Memo Out Return need Approve, like Memo Out and Memo Return? (Q-MOR-07 said Draft only.) | **Answered (Owner 2026-10-31):** "ต้อง Approve และของกลับเข้าคลังตอน Approve". |
| Q-MOR-15 | Which Memo Out rows does the dialog list? | **Answered (owner 2026-10-31): "ทำตามที่เสนอเลย".** Approved Memo Outs of the chosen customer, **same currency** as the return, not fully returned. Rows from several Memo Outs may be mixed in one return. |
| Q-MOR-16 | Where does a returned Memo Stock item go? | **Answered (owner 2026-10-31): "ทำตามที่เสนอเลย".** Back to Memo Stock as available: Reserve falls and Outstanding rises. It can then go on another Memo Out or back to the vendor with Memo Return. When our own stock exists, our items go back there. |
| Q-MOR-17 | Existing Memo Out Return drafts (vendor-based, from revision 3). | **Answered (owner 2026-10-31): "ทำตามที่เสนอเลย".** Dev has none. The migration stops if any exist, so none are lost silently. |
| Q-MOR-18 | Due Date on a return (Q-MOR-09). | **Answered (owner 2026-10-31): "ทำตามที่เสนอเลย".** Keep it required, ≥ Doc Date, with no other rule for now. |
