# Open questions: quotation revision 2 (From Stock)

Owner answers 2026-11-03: Q-QTS-01 and Q-QTS-02. Q-QTS-03…10: the proposed defaults below were approved with revision 2 (owner 2026-11-03: "อนุมัติ quotation revision 2 Memo Outstanding ไว้ก่อน").

| ID | Question | Answer / proposed default |
|---|---|---|
| Q-QTS-01 | What does From Stock list? | **Owner 2026-11-03:** the same as Memo Out: Memo Stock plus our own stock ("มาจาก memostock + stockเราเอง"). Our own stock needs the inventory service, so for now the list is Memo Stock only. |
| Q-QTS-02 | Does a quotation take, hold or approve stock? | **Owner 2026-11-03:** no. "แค่ดึงรายละเอียดของมาใส่ในใบเสนอราคา ไม่ตัดยอดอะไรทั้งนั้นไม่ approve ด้วย". It only copies the item's details. |
| Q-QTS-03 | Quantity of a stock row | **Approved default:** it starts at the item's full pending and can be lowered (part of an item), never raised above the pending it was picked with. The server checks the *current* pending only for a row that is newly added or whose quantity was raised. A saved row that was not changed is never refused because the stock moved later. |
| Q-QTS-04 | Sale Price of a stock row | **Approved default:** it starts empty and must be typed (> 0), as Memo Out (Q-MO-11). The vendor's cost is never shown or copied. Discount works as on typed rows. |
| Q-QTS-05 | Typed rows and Add row | **Approved default:** they stay. Quotation keeps Add row, and clicking an empty row still opens the key-in row panel. Stock rows and typed rows can be mixed. (Memo Out and Reserve are From Stock only; Quotation is not.) |
| Q-QTS-06 | Which fields can be edited on a stock row? | **Approved default:** these are copied and read-only: Stock ID, Lot, Location (`Memo`), Stone, Shape, Size, Color, Clarity, Cutting, Quality, Cer Type, Cer No. and Price Unit. Stone Code stays empty, because Memo Stock has none. Pcs / Weight, Sale Price, Discount, Item Note and photos can be edited. |
| Q-QTS-07 | Photos on a stock row | **Approved default:** up to 5, uploaded in the row panel as on typed rows. Memo Receive photos are not copied in this revision. |
| Q-QTS-08 | Can one item be added twice? | **Approved default:** no. The picker hides items already on the quotation, the row menu has no Duplicate on stock rows, and the server refuses a second row for the same item (`duplicate`). |
| Q-QTS-09 | What happens to a saved quotation when its stock is later sold, returned or reserved? | **Approved default:** nothing. The row keeps what was copied, and no warning is shown in this revision. |
| Q-QTS-10 | Hide stock-row prices from users without PRICE (Q-QT-07)? | **Approved default:** not in this revision. It stays with the inventory and load-to-stock work. |
