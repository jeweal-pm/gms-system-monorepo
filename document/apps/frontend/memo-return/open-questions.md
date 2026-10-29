# Open questions: memo-return

| ID | Question | Answer / default |
|---|---|---|
| Q-MRT-01 | Where do the Memo Stock rows come from? | **Answered by the owner 2026-10-29:** Memo Receive. The vendor's memo receive lines with a quantity still out. |
| Q-MRT-02 | Number | **Owner 2026-10-29:** from Document Setup › Memo Return; plain 1, 2, 3 … until a row is set up. |
| Q-MRT-03 | Partial return, several receipts in one return | Yes: Return ≤ Outstanding per line; lines from any of the vendor's memo receives in the same currency. |
| Q-MRT-04 | Stock effect and approval | None yet: drafts only, no stock posting (as the other memo documents). |
| Q-MRT-05 | Stock ID on the rows | Open. The Memo Receive mock page numbers Stock IDs itself; the Memo Receive API doesn't issue them yet, so rows show the stone code until the Memo Receive page is wired to the API. |
| Q-MRT-06 | Price header in view mode | The design shows "SALE PRICE" on the saved view and "Memo PRICE" elsewhere. The page uses Memo PRICE everywhere; to confirm. |
| Q-MRT-07 | Due Date meaning on a return | Required per the design; meaning to confirm. |
| Q-MRT-08 | A memo receive whose lines were returned | Can't be edited or deleted (`MEMO_RECEIVE_IN_USE`) while a memo return points at its lines. To confirm when the Memo Receive page is wired. |
