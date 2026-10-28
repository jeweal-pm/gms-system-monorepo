# Open questions: memo-out-return

These need answers before the API step (FE-MOR-002…004). The page structure follows the design (revision 2).

| ID | Question | Proposed default |
|---|---|---|
| Q-MOR-01 | Header fields | **Answered by the design 2026-10-28:** Doc Date, Vendor, Address, Due Date, Currency, Exchange Rate, Ref. |
| Q-MOR-02 | Party of a Memo Out Return | **Answered by the owner 2026-10-28:** "Memo Out ใช้ ข้อมูลจาก customer และ Memo Out Return ใช้ ข้อมูลจาก vendor". The Memo Outstanding source for vendor lines is still open (no vendor memo document exists yet). |
| Q-MOR-03 | Can one return pick lines from several memos of the same party? | Yes, through Memo Outstanding (lines, not whole documents). |
| Q-MOR-04 | Partial return? | Yes: Return Pcs/Weight ≤ Pending. |
| Q-MOR-05 | Stock effect on save | Once the inventory service exists; until then no stock change. |
| Q-MOR-06 | Price and Amount meaning | Memo price × returned quantity, in the document currency, for reference. |
| Q-MOR-07 | Approval step? | No: Draft only. |
| Q-MOR-08 | Document number | Document Setup › Memo Out Return (MOR); plain 1, 2, 3 … until set up. The design's "MORGMS2609001" is an example. |
| Q-MOR-09 | Due Date meaning on a return | Required per the design; meaning to confirm (e.g. the date the goods must be back). |
