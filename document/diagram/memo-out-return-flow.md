# Main flow: memo-out-return (UI revision 4 / SA revision 2, approved 2026-10-31)

Memo Out lends our goods to a customer. Memo Out Return brings them back into our own store. Owner 2026-10-31 (verbatim): "memoout คือการนำของของเราไปให้เขายืม ปุ่ม from stock คือ stockเรา ที่ตอนนี้ยังไม่มี และ ของในคลัง memo ตอนนี้จึงจะเเสดงของในคลัง memo ก่อน สิ่งที่จะให้ทำคือ หน้า memo out return คือนำของๆเราที่ทำ memo out กลับมาเข้าคลังตัวเอง กดที่ปุ่มmem outstanding จะสามารถดูของที่ทำmemo out ออกไปได้เเล้วเลือกเพื่อนำกลับเข้ามาคืนคลังตัวเอง".

Sequences: [sequence-diagram](../apps/backend/master/memo-out-return/sequence-diagram.md). Tables: [database-diagram](../apps/backend/master/memo-out-return/database-diagram.md). Decision: [ADR-0033 revision 3](../adr/0033-memo-documents-in-master-service.md). Questions: [open-questions](../apps/frontend/memo-out-return/open-questions.md) Q-MOR-11…18.

## Whole memo cycle (where each document moves the quantity)

```mermaid
flowchart LR
  V[Vendor] -->|Memo Receive approved| P[(Memo Stock<br/>pending = available)]
  P -->|Memo Return approved| R[Return bucket<br/>back to the vendor]
  P -->|Memo Out approved<br/>From Stock line| RS[Reserve bucket<br/>with the customer]
  RS -->|Memo Out Return approved<br/>NEW in this revision| P
  RS -.->|Sale · later| S[Sold bucket]
```

Only Memo Out rows that came from From Stock can be returned; manual Memo Out rows are never listed (Q-MOR-13, owner 2026-10-31).

## Memo Out Return page

```mermaid
flowchart TD
  A[Memo › Memo Out Return] -->|VIEW| B[List / New]
  A -->|no VIEW| X[No access]
  B --> C[Choose customer, Shipping + Invoice address, currency<br/>Doc No. preview from Document Setup memo-out-return]
  C --> D[Memo Outstanding button]
  D --> E[Dialog: that customer's approved Memo Out From Stock lines<br/>same currency · not fully returned<br/>Memo Out No. · Stock ID/Lot · stone · Outstanding · Memo price]
  E -->|tick lines| F[Rows copied from the Memo Out line<br/>Outstanding = out − already returned]
  F --> G[Edit Return pcs / weight ≤ Outstanding<br/>the only editable cells]
  G --> H{Save}
  H -->|over outstanding / other customer / twice| G
  H -->|ok| I[Status: Pending Approval<br/>nothing moves yet]
  I -->|Edit · EDIT| G
  I -->|Delete · DELETE| Z[Deleted]
  I -->|Approve · APPROVE| J{Confirm}
  J -->|cancel| I
  J -->|ok| K{Still outstanding?<br/>rows locked}
  K -->|no: another return took it| S2[MEMO_OUT_RETURN_OUTSTANDING_SHORT<br/>nothing changes]
  S2 --> G
  K -->|yes| L[Status: Approved · read-only]
  L --> M[Memo Out line: returned += q]
  L --> N[(Memo Stock item<br/>reserved − q · pending + q<br/>available again for Memo Out / Memo Return)]
  M -->|line fully returned| O[Left out of the dialog]
```

Not in this revision: our own stock (inventory service, ADR-0027), the Memo Outstanding › Customer report page, reversing an approved return, line photos.
