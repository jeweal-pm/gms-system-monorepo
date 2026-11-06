# Main flow: purchase (UI revisions 1–2, SA revision 1 approved 2026-11-04)

A Purchase (PU) records stones bought from a vendor. Its rows come from three places:

- that vendor's **Memo Stock**, which approved Memo Receives fill (see [memo-receive-flow](memo-receive-flow.md));
- **approved Purchase Order lines** that still have something outstanding (see [purchase-order-flow](purchase-order-flow.md));
- rows **keyed in** by hand.

Spec: [ui-spec](../apps/frontend/purchase/ui-spec.md). Open questions: [open-questions](../apps/frontend/purchase/open-questions.md). Service design: [SA rev 1 decisions](../apps/backend/master/purchase/decisions.md), with the [sequences](../apps/backend/master/purchase/sequence-diagram.md) and [ADR-0042](../adr/0042-purchase-document-and-stock-deduction.md).

Nodes marked **(Dn)** are SA defaults the owner may change ([list](../apps/backend/master/purchase/decisions.md#sa-defaults--owner-may-change)).

```mermaid
flowchart TD
  A[Purchase Order › Purchase PU] -->|purchase:VIEW| B[New purchase<br/>No. preview from Document Setup › Purchase PU]
  A -->|no VIEW| X[No access message]
  B --> C[Doc Date · Vendor · Address<br/>Due Date · Currency · Exchange Rate read-only · Ref.]
  C -->|vendor chosen| C2[Default address + currency<br/>picked rows of another vendor cleared]
  C2 --> D{Add rows}
  D -->|Memo Stock| E[Add Memo Stock dialog · purchase.memoStock<br/>this vendor + currency · tabs All / Sold / In stock + counts<br/>Sold = sold − purchased · empty until Sale exists D6<br/>In stock = pending]
  D -->|Purchase Order| P[Add Purchase Order dialog · purchase.purchaseOrderLines<br/>approved POs, this vendor + currency<br/>tabs All / Open / Partly purchased]
  D -->|click empty row| G[Row panel: manual row<br/>Stone Code · stone · quality · cer · Location text<br/>Pcs · Weight · Price · Stock ID Auto]
  E -->|tick rows| F[Picked rows: details copied by the server<br/>only Pcs · Weight · Price · note editable · D8<br/>cap = row's available quantity]
  P -->|tick lines| F
  F --> H{Save}
  G --> H
  H -->|invalid / above available now| HE[Field / row errors<br/>VALIDATION_ERROR exceeds_available]
  HE --> D
  H -->|ok| I[Saved · Pending Approval<br/>Stock IDs issued for manual + PO rows<br/>no stock change · D2]
  I -->|Edit · EDIT| D
  I -->|Delete · DELETE · confirm| Z[Deleted · no stock change]
  I -->|Approve · APPROVE · confirm| J{Still available?<br/>FOR UPDATE row locks, id order}
  J -->|no| S[PURCHASE_PENDING_SHORT<br/>nothing changes · rows named]
  S --> D
  J -->|yes| K[Approved · read-only]
  K --> M[(Memo Stock: In stock rows pending → sold + purchased<br/>Sold rows purchased += q · D1)]
  K --> Q[(Purchase Order line: purchased_pcs / weight += q)]
  M --> O[Memo Outstanding › Vendor: Sold up, Outstanding down]
  K -.-> N[(Own stock / คลัง Pmr: deferred · D4<br/>bought stones not pickable From Stock yet)]
```

## Rules

- **Owner, 2026-11-04:**
  - PU and PO have the same shape, and on picked rows only pcs, weight and price change.
  - The Memo Stock button cuts memo stock.
  - The Purchase Order button cuts the outstanding of the PO being bought in.
- **Established elsewhere:**
  - The number comes from Document Setup key `purchase` (code PU), and the permission leaf is `purchase`.
  - There is one Exchange Rate per currency.
  - Stock moves at approval of the pulling document (Q-MR-15). This is the default D2 for Purchase.
- **Not in revision 1:**
  - un-approve;
  - payable posting;
  - the Purchase Outstanding report;
  - own stock;
  - a Sale document, which is what makes items "Sold to customers";
  - piece type (Pair / Parcel / Single);
  - line photos.

## Revision 3 (proposed 2026-11-05): merge Sold + In stock

```mermaid
flowchart TD
  P[Add Memo Stock: tick rows · OK] --> Q{Sold + In stock of the same Stock ID ticked?}
  Q -->|no| A[Rows added as today]
  Q -->|yes| M{Merge items?}
  M -->|Merge| R[One row · Pcs/Weight ≥ Sold part, ≤ Sold + In stock · Price editable]
  M -->|Don't merge / ✕| T[Two rows · Sold row: Price only]
  R --> S[Save: check soldOpen ≤ q ≤ soldOpen + pending]
  S --> AP[Approve: Sold part first, rest from pending]
```

Sources: [ui-spec › Revision 3](../apps/frontend/purchase/ui-spec.md#revision-3-merge-the-sold-and-in-stock-parts-of-one-item-pending-review), [ADR-0043](../adr/0043-purchase-merged-memo-stock-line.md).
