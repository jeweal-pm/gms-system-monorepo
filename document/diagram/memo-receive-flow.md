# Main flow: memo-receive → Memo Stock → Memo Return (UI revision 3 / SA revision 1, approved 2026-10-29)

Owner flow 2026-10-29: Memo Receive brings stones borrowed from a vendor into Memo Stock, and Memo Return sends Memo Stock items back to that vendor. Technical sequences: [sequence-diagram.md](../apps/backend/master/memo-receive/sequence-diagram.md). Decision: [ADR-0034](../adr/0034-memo-receive-approval-and-memo-stock.md).

```mermaid
flowchart TD
  A[Memo › Memo Receive] -->|VIEW| B[List / New]
  A -->|no VIEW| X[No access]
  B --> C[Fill vendor, address, currency, lines<br/>Stock ID shows Auto · no Location]
  C --> D{Save}
  D -->|invalid| C
  D -->|ok| E[Status: Pending Approval<br/>Doc No. from Document Setup<br/>Stock IDs 260001, 260002 …]
  E -->|Edit · EDIT| C
  E -->|Delete · DELETE| Z[Deleted · Stock IDs not reused]
  E -->|Approve button · APPROVE<br/>temporary, later the Approve page| F{Confirm}
  F -->|cancel| E
  F -->|ok| G[Status: Approved · read-only]
  G --> H[(Memo Stock<br/>one item per line<br/>location = Memo<br/>pending = received pcs/weight)]
  H --> I[Memo › Memo Return · later revision<br/>choose the vendor → + Add Memo Stock]
  I --> J[Dialog lists that vendor's items with pending > 0<br/>Stock ID/Lot · Location Memo · Stone · Cer · Pending · Price · Amount]
  J --> K[Save Memo Return<br/>pending pcs/weight reduced · later revision]
  K -->|pending = 0| L[Item fully returned · no longer listed]
  K -->|pending > 0| H
```

Status of each step: steps up to Memo Stock are in this revision. The dialog read (`memoStock.list`) is in this revision. The Memo Return page and its save and pending deduction need their own UI spec and revision.
