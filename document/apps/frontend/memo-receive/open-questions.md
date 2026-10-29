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
