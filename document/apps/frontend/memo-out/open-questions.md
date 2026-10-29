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
