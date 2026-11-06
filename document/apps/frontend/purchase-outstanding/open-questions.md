# Open questions: purchase-outstanding revision 1

Owner 2026-11-06 gave the design and the formula and asked to build the page. These defaults stand until the owner changes one.

| ID | Question | Answer / default |
|---|---|---|
| Q-POS-01 | Balance formula | **Owner:** Memo − Return − Purchase. |
| Q-POS-02 | Sale column | **Owner:** sold, waiting to move to Purchase (= sold − purchased); a plain number, no brackets. |
| Q-POS-03 | Which documents are listed? | **Default:** approved Memo Receives with a Balance > 0 on any item (fully returned or fully purchased documents leave the list). |
| Q-POS-04 | Balance value | **Default:** line amount × balance basis ÷ received basis (the From Vendor open-value rule on the Balance quantity), in the document currency; Grand total converts with the document exchange rate. |
| Q-POS-05 | Reserve column | **Default:** not shown; reserved stones are still in the Balance (they are with a customer on memo, not bought). |
| Q-POS-06 | Permission | **Default:** existing leaf `purchase-outstanding`, VIEW (PRINT / EXCEL for print and Excel). |
