# Open questions: purchase-order revision 1

Owner answers 2026-11-04 are quoted. The other rows are proposed defaults: approving the revision as written accepts them; name a Q-PO ID to change one.

| ID | Question | Answer / proposed default |
|---|---|---|
| Q-PO-01 | Who is the party? | **Owner 2026-11-04:** "account เป็น vendor". A Vendor (active) with one vendor address, as on Memo Receive. |
| Q-PO-02 | Status flow? | **Owner:** the PO has Approve ("ในหน้า purchase order มี approve"). **Default:** Save → Pending Approval (editable, deletable) → Approve → Approved (read-only). No reject, cancel or un-approve in rev 1. |
| Q-PO-03 | Where is it approved, and may the creator approve? | **Default:** on the Purchase Order page itself (like Memo Receive), by users with `purchase-order:APPROVE`, including the creator. |
| Q-PO-04 | What does Approve do? | **Owner:** "approveเพื่อส่งรายการสินค้าไปซื้อเข้าในหน้าpuchase". **Default:** each line becomes waiting to be purchased for its full Pcs / Weight (purchased 0). No stock, Stock ID or Memo Stock is created. The Purchase page (later) takes items, part or all, and records what was bought. |
| Q-PO-05 | Can rows come from From Stock or Memo Stock? | **Owner:** no — "ไม่สามารถดึงมาจากปุ่ม form stock หรือ memo stock ได้ต้องสร้างเองเท่านั้น". Rows are keyed in only; there is no From Stock button. |
| Q-PO-06 | Stock ID and Location on a PO row? | **Owner 2026-11-04:** Location yes ("มีสิ") — free text ≤ 40, as on the Quotation typed row. **Default:** no Stock ID; Stock IDs come at Purchase. |
| Q-PO-07 | Header, summary and price fields? | **Default:** same as Quotation / Memo Receive: Doc Date, Due Date (required, ≥ Doc Date, no default), Ref, currency + exchange rate, line discount, document discount, tax, service charges, labor, grand total. Unit price ≥ 0. |
| Q-PO-08 | Numbering? | **Default:** Document Setup key `purchase-order` (code `PO`, already in the list); plain 1, 2, 3 … until a setup row is in effect. |
| Q-PO-09 | Photos per row? | **Owner 2026-11-04:** yes ("ถูก"), up to 5, as on Quotation and Memo Receive. Read-only after approve. |
| Q-PO-10 | Daybook contents? | **Default:** all POs newest first; Approved dot green, Pending amber. |
| Q-PO-11 | Permissions? | **Default:** existing leaf `purchase-order`: VIEW, ADD, EDIT, DELETE, APPROVE. PRINT / EXCEL stay disabled; PRICE not enforced. |
| Q-PO-12 | Can an approved PO still be changed, e.g. a vendor price change? | **Owner 2026-11-04:** no in rev 1 ("ถูก"). Un-approve / cancel comes with the Purchase page, once it is clear what happens to items already purchased. |
| Q-PO-13 | Design | **Owner:** "designยังไม่เสร็จเเต่ หน้าเหมือน quotation เลย". Rev 1 uses the Quotation layout; the Figma becomes UI revision 2. |
