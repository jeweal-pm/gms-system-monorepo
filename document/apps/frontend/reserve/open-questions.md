# Open questions: reserve

Owner answers 2026-11-02 (Q-RS-01…04). Q-RS-05…08 are the defaults approved with revision 1 (owner 2026-11-02: "อนุมัติ reserve revision 1").

| ID | Question | Answer |
|---|---|---|
| Q-RS-01 | The design has From Stock and From Memo. What do they list? | **One button, From Stock**: "ทำให้เหลือปุ่มเดียวคือ from stock ที่จะรวมของ จาก memo และ คลัง Pmr." It lists Memo Stock plus our own stock. Our own stock (from Purchase) waits for the inventory service, so for now it lists Memo Stock only. |
| Q-RS-02 | When does a Reserve hold the stock? | **At Approve** (Save → Pending Approval → Approve → Approved), the Q-MR-15 rule. |
| Q-RS-03 | How is the stock released if it won't be sold? | **Later revision.** Approved reservations stay held until then. |
| Q-RS-04 | Can rows be keyed in by hand? | First answer: **Yes, and they hold nothing**, as Memo Out (Q-MO-09). **Superseded 2026-11-02**: "Reserve ไม่มีการ add row" and "ตอนกดช่องที่ไม่มีข้อมูลต้องไม่ขึ้น side bar ให้กรอก". There is no Add row, and an empty row opens From Stock, so Reserve rows come From Stock only. The API still accepts a line without a Memo Stock item (it holds nothing); the page no longer creates one. |
| Q-RS-05 | Which Memo Outstanding column does an approved Reserve fill? | **Reserve** (owner Q-MOV-04: "Reserve = Reserve or Memo Out approved"). |
| Q-RS-06 | Part of an item; price; From Stock scope | As Memo Out revision 2 (Q-MO-10, Q-MO-11, Q-MO-15): part or all of the pending, starting at the full pending; Sale Price typed and required; every vendor's items, not tied to the customer or currency. |
| Q-RS-07 | Number and exchange rate | Document Setup › Reserve (code RS); plain 1, 2, 3 … until it is set up. The exchange rate is the currency's Selling Rate (a customer document, as Quotation and Memo Out). |
| Q-RS-08 | Due Date meaning | The date the reservation is held until; on or after Doc Date. Nothing expires automatically in this revision. |
