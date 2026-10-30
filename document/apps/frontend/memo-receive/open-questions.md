# Open questions: memo-receive (UI revision 1)

Owner answers 2026-10-28 ("อันนี้ตอบเพื่อให้รู้เฉยๆ อาจมีการเปลี่ยนแปลง"): the answers may change later.

| ID | Question | Answer (owner 2026-10-28) |
|---|---|---|
| Q-MR-01 | Stock ID format? | **Plain running 1, 2, 3 … for now** ("ตอนนี้เป็น 1 2 3 ไปก่อน"); one counter for all Memo Receive lines, never reused. |
| Q-MR-02 | Memo Receive No. format? | **From Document Setup, like Quotation**: the `memo-receive` row in effect on the Doc Date gives prefix + separator + running (start no., then highest + 1); with no row in effect the number is plain 1, 2, 3. |
| Q-MR-03 | Location: choose from a list? | **Yes**: a list (mock until a location master exists); optional. |
| Q-MR-04 | Line amount basis? | **Same as Quotation**: Price per Cts → weight × Memo Price; per Pcs → pcs × Memo Price; half-up 2 dp. |
| Q-MR-05 | Approval / status? | **Has approval**: saving sends the document to wait on the Approve page (status Pending Approval). It can be edited and deleted until it is approved there. The Approve page does not exist yet, so in revision 1 every saved document stays Pending Approval. |
| Q-MR-06 | Vendor defaults? | **Same as Customer on Quotation**: choosing a vendor picks its default address and its currency. |
| Q-MR-07 | Editing after stones are used elsewhere? | Not applicable yet (no stock flow); editable until approved. |

## UI revision 3 / SA revision 1 (owner flow 2026-10-29, approved 2026-10-29)

The owner's 2026-10-29 flow replaces Q-MR-01 (Stock ID = 2-digit year of the save + 4-digit running, e.g. `260001`) and Q-MR-03 (Location removed from the page and stored as `Memo`). It also answers Q-MR-05: approval creates Memo Stock, and for now the Approve button is on this page. Answers below ([ADR-0034](../../../adr/0034-memo-receive-approval-and-memo-stock.md)).

Owner answers 2026-10-29 (verbatim in quotes):

| ID | Question | Answer |
|---|---|---|
| Q-MR-08 | Which date gives the Stock ID year? | **Year of the save**, assigned at save ("ออกเลขตอนบันทึกปีนี้ปีไหนเอาปีนั้น"). |
| Q-MR-09 | What happens after 9,999 Stock IDs in one year? | **Open**. The owner is still thinking, but one year should not exceed it ("ขอคิดก่อนเเต่คิดว่าใน 1 ปีคงไม่เกิน"). For now saving is refused (`STOCK_ID_EXHAUSTED`). |
| Q-MR-10 | Add Memo Stock dialog "Start → Due": which dates? | **Memo Receive Doc Date** (from–to). "Search for a project" is a typo ("ใช่ พิมพ์ผิด"), and the placeholder will be "Search Stock ID, Lot, Stone, Cer No." |
| Q-MR-11 | Can Memo Stock items go out through Memo Out "From Stock"? | **Yes** (owner 2026-10-29, replaces "decide during Memo Out"): "ปุ่ม from stock คือ ของจาก stock เรา + memo stock ปุ่ม memo stock เเสดงเเค่ memo stock". **From Stock** lists our own stock **plus** Memo Stock, with Memo Stock rows showing Location `Memo`. **Memo Stock** lists Memo Stock only. Which pages carry each button, and when pending is reduced, are still open. Our own stock does not exist yet (inventory). |
| Q-MR-12 | Can an approved Memo Receive be rejected or un-approved? | **No, not for now** ("ยังไม่มีตอนนี้"). |
| Q-MR-13 | Dialog Price/Amount: before or after the line discount? | **After the discount** ("ใช้ราคาหลังส่วนลด"): PRICE = line amount ÷ weight (Cts) or pcs, and Amount = line amount × pending ÷ received. |
| — | Photos? | **None for now** ("ตอนนี้ยังไม่มีรูป"). |
| Q-MR-14 | Which pages carry which button? | **Memo Return**: the **Memo Stock** button only. **Quotation, Memo Out, Sale**: the **From Stock** button (our stock + Memo Stock). Owner 2026-10-29: "ถูก". |
| Q-MR-15 | When does pulling a Memo Stock item into another document reduce its pending pcs/weight? | **When that document is approved** (owner 2026-10-29: "ต้องตัดยอดคงค้าง ตัดตอน approve เอกสารนั้น"). Saving alone does not reduce it. **Quotation never reduces it** (owner 2026-10-29: "Quotation ไม่มี approve ไม่ต้องตัดยอดไม่ต้องตัดของเป็นการออกใบเสนอราคาเฉยๆ"): a Quotation only copies the item's data to quote it. |

### Notes for the later Memo Stock work (owner 2026-10-29: "ตอนนี้ยังไม่ต้องทำ memo return เเค่เเจ้งให้ทราบเฉยๆบันทึกเอกสารไว้")

Not scheduled. Each needs its own ui-spec / SA revision and approval.

- **Memo Return page**: Memo Stock button and the "Add Memo Stock" dialog ([design](../memo-return/source/01-add-memo-stock-dialog.png)) read `memoStock.list` (already built). Approving a Memo Return reduces pending pcs/weight.
- **From Stock** on Quotation, Memo Out and Sale lists our stock plus Memo Stock (Q-MR-11/14). Until inventory exists it lists Memo Stock only.
- **Reducing pending (Q-MR-15)**: done at approval of Memo Out, Sale and Memo Return, and never by Quotation. Memo Out has no approval today (DRAFT only, ADR-0033), so it needs an approval flow first. The Sale page does not exist yet.
- **Over-pull guard**: the same item can sit in several unapproved documents. At approval, re-check pending inside the transaction (row lock on `memo_stock`). When it is short, refuse with the line that is short, and never let pending go below 0 (CHECK already exists).
- **Stone Code**: Memo Stock rows have no Stone Code (rev 2), so a row pulled into Quotation or Memo Out leaves Stone Code empty. All other fields copy.
