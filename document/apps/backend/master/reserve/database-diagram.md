# Database diagram: reserve (SA revision 1, approved 2026-11-02)

Schema `partner`, owned by `backend-api-master`. New tables `reserve`, `reserve_line` and `reserve_charge`. `memo_stock` is unchanged: an approved Reserve fills its existing `reserved_*` bucket ([ADR-0035](../../../../adr/0035-memo-outstanding-vendor-report.md)).

```mermaid
erDiagram
  document_numbering ||--o{ reserve : numbers
  customer ||--o{ reserve : "reserved for"
  customer_address ||--o{ reserve : "shipping / invoice"
  reserve ||--o{ reserve_line : has
  reserve ||--o{ reserve_charge : has
  memo_stock ||--o{ reserve_line : "held by (stock line)"
  stone_code ||--o{ reserve_line : "manual line (optional)"

  reserve {
    uuid id PK
    uuid numbering_id FK "NULL = plain running number"
    int running_no
    varchar doc_no UK
    varchar status "PENDING_APPROVAL | APPROVED"
    date doc_date
    date due_date "held until, >= doc_date"
    uuid customer_id FK
    uuid shipping_address_id FK
    uuid invoice_address_id FK
    char currency_code
    numeric grand_total
    timestamp approved_at
    varchar approved_by
    int version
  }
  reserve_line {
    uuid id PK
    uuid reserve_id FK
    smallint position
    varchar source "MANUAL | STOCK"
    uuid memo_stock_id FK "NULL = manual line"
    varchar stock_id "snapshot"
    int stock_pending_pcs "pending at save"
    numeric stock_pending_weight_ct
    int pcs
    numeric weight_ct
    numeric unit_price "Sale Price"
    numeric amount
  }
  reserve_charge {
    uuid reserve_id PK
    varchar charge_type PK
    numeric amount
  }
  memo_stock {
    uuid id PK
    int pending_pcs "approve: -= q"
    int reserved_pcs "approve: += q"
  }
```

## Migration `20261102090000_reserve` (additive)

- The three tables have the columns of `memo_out` / `memo_out_line` / `memo_out_charge` after `20261031090000_memo_out_from_stock`.
- Keys: unique `doc_no`; unique `(numbering_id, running_no)`; partial unique `running_no WHERE numbering_id IS NULL`.
- Indexes: list `(doc_date DESC, created_at DESC, id DESC)`, `(customer_id, doc_date DESC)`, `(status, doc_date DESC, created_at DESC, id DESC)`, the address ids, and `reserve_line (memo_stock_id)`.
- Line keys: unique `(reserve_id, position)` and `(reserve_id, memo_stock_id)`.
- FKs:
  - numbering, customer, memo_stock: RESTRICT;
  - addresses: SET NULL;
  - stone_code: SET NULL;
  - lines and charges: CASCADE from `reserve`.
- CHECKs:
  - status, approved, due date, running no, discount, tax rate, exchange rate, version;
  - line values (source MANUAL / STOCK) and the stock-line CHECK of SA-MO-12;
  - charge values.

No backfill. Rollback (only while no Reserve is APPROVED): drop the three tables.
