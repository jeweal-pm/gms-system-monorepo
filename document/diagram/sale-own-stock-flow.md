# Main flow: sale-own-stock (addendum A to Sale UI revision 1)

The Sale page's **From Stock** button now offers the stock loaded by **Load to Stock** (own stock) first, then Memo Stock, in the same dialog. A saved Sale takes the stones out of stock when it is applied; the Stock Card shows the OUT row. The base Sale flow is [sale-flow](sale-flow.md); the service side is drawn in the [sequence diagram](../apps/backend/inventory/sale-own-stock/sequence-diagram.md) and the decision in [ADR-0058](../adr/0058-sale-own-stock-from-load-to-stock.md).

```mermaid
flowchart LR
  LOAD[Load to Stock approved<br/>stock on hand] --> POOL[(own stock<br/>on_hand)]
  RES[Reserve approved<br/>own stones held] --> HELD[(own stock<br/>reserved)]
  POOL --> PICK
  MEMO[(Memo Stock<br/>pending)] --> PICK
  SALE[Sale page] -->|From Stock| PICK[Add From Stock dialog<br/>Our stock first, then Memo Stock<br/>lot, no Stock ID]
  PICK -->|OK: rows, price prefilled from Sale Price| LINES[Sale lines<br/>source OWN_STOCK / STOCK]
  HELD --> PICKR
  SALE -->|From Reserve| PICKR[Add From Reserve dialog<br/>Memo Stock and own-stock Reserve lines]
  PICKR --> LINES
  LINES -->|Save| DRAFT[Draft or auto-approved]
  DRAFT -->|Send to approve, Approve| APPLY{Apply}
  APPLY -->|own stock: on hand to sold, FIFO by Stock ID| POOL2[(sold)]
  APPLY -->|Reserve own line: reserved to sold, hold reduced| HELD2[(sold, Reserve line sold)]
  APPLY -->|Memo Stock line: master consumption| MEMO2[(Memo Stock sold)]
  APPLY -->|short, busy, refused| ERR[Row message, nothing moved]
  POOL2 --> CARD[Stock Card: OUT row Sale<br/>number link, date, customer]
  HELD2 --> CARD
  CARD -->|DOC NO| SALEDOC[Sale page]
  APPLY -->|edit down, delete of an auto-approved Sale| BACK[Quantity returns,<br/>OUT row nets to zero]
```

Open decisions (defaults applied): [SQ-SO-01…12](../apps/backend/inventory/sale-own-stock/decisions.md#owner-questions): Reserve own-stock lines in this revision, Stock ID hidden, price prefill, own-only Sale without master, cost not in the ledger.
