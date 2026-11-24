# Main flow: stock-value (UI revision 1)

Stock Value is a read-only report. The list shows, per stone code + location + lot, the BALANCE (Pcs, Weight) valued at the **current price** (Price with its source, Unit, Amount) and a Profit/Loss; a row opens the card's transactions (IN, OUT, running BALANCE, Current value, Profit & Loss, totals); a document number opens the source document. It uses the same cards and ledger as [Stock Card](stock-card-flow.md). Dashed edges and unknown transitions are open questions. SA refines the service side in its own sequence diagram without duplicating this flow.

```mermaid
flowchart LR
  MENU[Sidebar Report › Stock Movement › Stock Value] --> LIST[Stock Value list<br/>location, stone code, lot, BALANCE pcs / weight / price / unit / amount, Profit/Loss]
  LIST -->|search, location, Start → Due, sort, page| LIST
  LIST -->|select rows| SEL[Rows ticked]
  SEL -->|Print| PRINT[Print selected rows + Total]
  LIST -->|Print / Refresh| LIST
  LIST -->|Excel| XLS[Disabled in rev 1, Q-SV-17]
  LIST -->|click row, Enter| DETAIL[Stock Value detail<br/>header + IN / OUT / BALANCE / Current value / P&L rows + Total]
  DETAIL -->|search, Start → Due, sort, page| DETAIL
  DETAIL -->|click DOC NO| DOC[Source document page<br/>Load to Stock, Memo Out, Sale, ...]
  DOC -->|browser Back| DETAIL
  DETAIL -->|‹ Stock Value, filters kept| LIST
  DETAIL -->|Print| PRINT2[Print current page + Total]
```

Where the numbers come from (assumption, SA decides, [handoff](../coordination/handoffs/stock-value-sa.md)):

```mermaid
flowchart TD
  B[Card BALANCE as at Due or today<br/>same ledger as Stock Card] --> A
  P1{Stock has a Price list?<br/>stock.sale_price > 0} -->|yes| PL[Price = Price list<br/>caption: Price list]
  P1 -->|no| P2{Latest approved Sale line<br/>of the stone code?}
  P2 -->|yes| LS[Price = Last sale, THB<br/>caption: Last sale]
  P2 -->|no| NP[No price<br/>Price, Amount, P/L = —]
  PL --> A[Amount = remaining quantity x price<br/>unit Cts: by weight]
  LS --> A
  A --> PLs[Profit/Loss = Amount − cost of the remaining balance<br/>weighted-average cost of the lot; — if no cost, Q-SV-07]
```

Open transitions: Q-SV-01…04 (price of a multi-stock card, price list, last sale, units), Q-SV-06 (Due date and current prices), Q-SV-07 / 09 / 10 (Profit/Loss), Q-SV-17 (Excel) in [open questions](../apps/frontend/stock-value/open-questions.md). UI: [ui-spec](../apps/frontend/stock-value/ui-spec.md).
