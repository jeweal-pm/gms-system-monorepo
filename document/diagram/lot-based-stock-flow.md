# Flow: pick and deduct stock by Lot (lot-based-stock, SA revision 1, pending-review)

The main user flow is maintained in the service bundle, not copied here:

- Pick a lot (From Stock): [sequence-diagram §1](../apps/backend/shared/lot-based-stock/sequence-diagram.md#1-pick-a-lot-from-stock-quotation--reserve--memo-out--sale)
- Approve with FIFO allocation: [§2](../apps/backend/shared/lot-based-stock/sequence-diagram.md#2-approve-a-memo-out-with-memo-stock-lot-lines-allocation-fifo)
- Return part of a lot line: [§3](../apps/backend/shared/lot-based-stock/sequence-diagram.md#3-memo-out-return-of-part-of-a-lot-line-settle-oldest-first)
- Own-stock lot holds: [§4](../apps/backend/shared/lot-based-stock/sequence-diagram.md#4-reserve-with-own-stock-lot-lines-pre-read--allocate--unchanged-hold-put)
- Sale consumption: [§5](../apps/backend/shared/lot-based-stock/sequence-diagram.md#5-sale-inventory-from-stock-lot-line-and-from-reserve-line)
- Legacy documents: [§6](../apps/backend/shared/lot-based-stock/sequence-diagram.md#6-legacy-document-no-conversion)

```mermaid
flowchart LR
  A[Memo Receive approve / Load to Stock apply<br/>one Stock ID per line - unchanged] --> B[(Stock rows<br/>memo_stock / inventory.stock<br/>+ generated lot_key)]
  B --> C[Lot picker<br/>one row per lot: every detail equal,<br/>summed pcs / weight, Stock ID never shown]
  C --> D[Document lot line<br/>lot_key + snapshot, drafts hold nothing]
  D -->|Approve or auto-approved save| E[Allocate oldest first to Stock IDs<br/>under id-ordered lock, stored for audit only]
  E --> F[Buckets per Stock ID - unchanged<br/>+ line allocation rows]
  F --> G[Downstream: Memo Out Return / Sale From Reserve<br/>settle allocation oldest first]
  F --> H[Report figures per item - unchanged<br/>Stock ID column hidden: Q-LOT-17/18]
```

ADR: [ADR-0055](../adr/0055-lot-based-stock-picking-and-allocation.md) · TODO: [lot-based-stock](../task/todo/lot-based-stock.md)
