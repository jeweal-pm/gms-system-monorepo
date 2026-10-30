# Database diagram: memo-return (SA revision 2, as built 2026-10-30)

Schema `partner`, service `backend-api-master`. Migration `20261029160000_memo_return`. The Return bucket columns on `memo_stock` come from `20261030090000_memo_stock_buckets` (ADR-0035). Flow: [memo-return-flow.md](../../../../diagram/memo-return-flow.md). Sequences: [sequence-diagram.md](sequence-diagram.md).

```mermaid
erDiagram
  vendor ||--o{ memo_return : "vendor_id RESTRICT"
  vendor_address |o--o{ memo_return : "address_id SET NULL"
  document_numbering |o--o{ memo_return : "numbering_id RESTRICT"
  memo_return ||--|{ memo_return_line : "CASCADE"
  memo_return ||--o{ memo_return_charge : "CASCADE"
  memo_stock ||--o{ memo_return_line : "memo_stock_id RESTRICT"
  memo_receive ||--|{ memo_stock : "approved receive lines"

  memo_return {
    uuid id PK
    uuid numbering_id FK
    int running_no
    varchar40 doc_no UK
    varchar20 status "PENDING_APPROVAL | APPROVED"
    date doc_date
    date due_date ">= doc_date"
    uuid vendor_id FK
    varchar vendor_code_snapshot
    varchar vendor_name_snapshot
    uuid address_id FK
    varchar address_snapshot
    char3 currency_code
    decimal exchange_rate
    decimal totals "subtotal … grand_total"
    timestamp approved_at "set iff APPROVED"
    varchar approved_by
    int version
  }
  memo_return_line {
    uuid id PK
    uuid memo_return_id FK
    smallint position "1..200"
    uuid memo_stock_id FK
    varchar10 stock_id "copy of memo_stock.stock_id"
    int outstanding_pcs "pending when saved"
    decimal12_3 outstanding_weight_ct
    int pcs "Return <= outstanding_pcs"
    decimal12_3 weight_ct "Return <= outstanding_weight_ct"
    varchar item_fields "stone, shape, size, color, clarity, cutting, quality, lot, location, cer"
    decimal18_2 unit_price "memo_stock.net_unit_price, 2 dp"
    decimal18_2 amount
  }
  memo_return_charge {
    uuid memo_return_id PK
    varchar20 charge_type PK
    decimal18_2 amount
  }
  memo_stock {
    uuid id PK
    varchar10 stock_id UK
    uuid vendor_id
    char3 currency_code
    int received_pcs
    int returned_pcs "+= on Memo Return approve"
    int sold_pcs
    int reserved_pcs
    int pending_pcs "-= on Memo Return approve"
    decimal12_3 weight_buckets "same for _weight_ct"
    int version
  }
```

## Constraints and indexes

| Table | Constraints / indexes |
|---|---|
| memo_return | `UNIQUE doc_no`; `UNIQUE (numbering_id, running_no)`; partial `UNIQUE (running_no) WHERE numbering_id IS NULL`; list `(doc_date desc, created_at desc, id desc)`; `(vendor_id, doc_date desc)`; `(status, doc_date desc, created_at desc, id desc)`; `(address_id)`. CHECKs: status, approved fields set iff APPROVED, due ≥ doc date, running_no ≥ 1, discount, tax rate, exchange rate, version |
| memo_return_line | `UNIQUE (memo_return_id, position)`; `UNIQUE (memo_return_id, memo_stock_id)` (one line per item); `(memo_stock_id)`. CHECK values and `pcs <= outstanding_pcs AND weight_ct <= outstanding_weight_ct` |
| memo_return_charge | PK `(memo_return_id, charge_type)`; charge type in SHIPPING / HANDLING / INSURANCE / CERTIFICATE, amount ≥ 0 |
| memo_stock | `memo_stock_balance`: pending = received − returned − sold − reserved (pcs and weight); buckets ≥ 0 |

## Who writes what

| Event | memo_return | memo_stock |
|---|---|---|
| Save (create / update) | row + lines, status PENDING_APPROVAL | read only |
| Delete (pending only) | row removed, lines cascade | — |
| Approve | status APPROVED, approved_at/by | rows locked `FOR UPDATE` (id order); `pending_* −= return`, `returned_* += return`, version + 1 |

`memo_stock` rows can't be deleted while a return line points at them (RESTRICT).
