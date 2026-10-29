# Database diagram: memo-receive (SA revision 1, 2026-10-29, approved 2026-10-29)

Owner: `backend-api-master`, schema `partner` (interim until the inventory service, ADR-0034 D5). Migration `20261029090000_memo_receive`, additive only.

```mermaid
erDiagram
  VENDOR ||--o{ MEMO_RECEIVE : "vendor_id (RESTRICT)"
  VENDOR_ADDRESS |o--o{ MEMO_RECEIVE : "address_id (SET NULL)"
  DOCUMENT_NUMBERING |o--o{ MEMO_RECEIVE : "numbering_id (RESTRICT)"
  MEMO_RECEIVE ||--|{ MEMO_RECEIVE_LINE : "CASCADE"
  MEMO_RECEIVE ||--o{ MEMO_RECEIVE_CHARGE : "CASCADE"
  MEMO_RECEIVE_LINE ||--o| MEMO_STOCK : "memo_receive_line_id (RESTRICT)"
  MEMO_RECEIVE ||--o{ MEMO_STOCK : "memo_receive_id (RESTRICT)"
  VENDOR ||--o{ MEMO_STOCK : "vendor_id (RESTRICT)"

  MEMO_RECEIVE {
    uuid id PK
    uuid numbering_id FK "nullable"
    int running_no
    varchar40 doc_no UK
    varchar20 status "CHECK PENDING_APPROVAL|APPROVED"
    date doc_date
    date due_date "CHECK >= doc_date"
    uuid vendor_id FK
    varchar vendor_code_snapshot
    varchar vendor_name_snapshot
    uuid address_id FK "nullable"
    varchar1000 address_snapshot
    char3 currency_code
    decimal exchange_rate "nullable"
    varchar ref
    varchar document_note
    varchar discount_type
    decimal discount_value
    bool tax_enabled
    decimal tax_rate
    bool tax_included
    varchar labor_work "labor_* as memo_out_return"
    decimal subtotal "… grand_total as memo_out_return"
    timestamp approved_at "nullable; set iff APPROVED"
    varchar64 approved_by "nullable"
    int version
    timestamp created_at
    varchar64 created_by
    timestamp updated_at
    varchar64 updated_by
  }
  MEMO_RECEIVE_LINE {
    uuid id PK
    uuid memo_receive_id FK
    smallint position "UK with memo_receive_id"
    varchar10 stock_id UK "YY + 4 digits"
    varchar10 source "MANUAL"
    varchar60 stone "shape, size, color, clarity, cutting, quality"
    varchar40 lot
    varchar20 cer_type
    varchar60 cer_no
    int pcs "CHECK >= 0"
    decimal12_3 weight_ct "CHECK >= 0"
    varchar10 price_unit "CTS|PCS"
    decimal18_2 unit_price "CHECK >= 0"
    varchar10 discount_type
    decimal discount_value
    decimal18_2 discount_amount
    decimal18_2 amount
    varchar500 item_note
  }
  MEMO_RECEIVE_CHARGE {
    uuid memo_receive_id PK
    varchar20 charge_type PK
    decimal18_2 amount
  }
  MEMO_STOCK {
    uuid id PK
    varchar10 stock_id UK
    uuid memo_receive_id FK
    uuid memo_receive_line_id FK,UK
    varchar40 received_doc_no
    date received_doc_date
    date due_date
    uuid vendor_id FK
    varchar vendor_code_snapshot
    varchar vendor_name_snapshot
    varchar40 location "DEFAULT 'Memo', CHECK = 'Memo'"
    varchar60 stone "shape … quality"
    varchar40 lot
    varchar20 cer_type
    varchar60 cer_no
    varchar500 item_note
    int received_pcs
    decimal12_3 received_weight_ct
    int pending_pcs "CHECK 0..received_pcs"
    decimal12_3 pending_weight_ct "CHECK 0..received_weight_ct"
    varchar10 price_unit
    decimal18_2 unit_price "gross Memo Price"
    decimal18_2 line_amount "after line discount"
    decimal18_4 net_unit_price "line_amount / received basis"
    char3 currency_code
    int version
    timestamp created_at
    varchar64 created_by
    timestamp updated_at
  }
  MEMO_STOCK_ID_COUNTER {
    smallint year PK "2-digit year of the save, e.g. 26"
    int last_no "CHECK 0..9999"
  }
```

## Constraints and indexes

| Table | Constraint / index |
|---|---|
| memo_receive | `UNIQUE (numbering_id, running_no)`; partial `UNIQUE (running_no) WHERE numbering_id IS NULL`; list `(doc_date desc, created_at desc, id desc)`; `(vendor_id, doc_date desc)`; `(status, doc_date desc, created_at desc, id desc)` for the future Approve page; `CHECK ((status = 'APPROVED') = (approved_at IS NOT NULL))` |
| memo_receive_line | `UNIQUE (memo_receive_id, position)`; `UNIQUE (stock_id)`; `CHECK stock_id ~ '^[0-9]{6}$'` |
| memo_stock | `UNIQUE (stock_id)`; `UNIQUE (memo_receive_line_id)`; partial `(vendor_id, received_doc_date desc, stock_id desc) WHERE pending_pcs > 0 OR pending_weight_ct > 0` for the dialog; `(memo_receive_id)` |

`memo_stock.stock_id` matches its line. The line FK uses `RESTRICT`, and an approved document cannot be deleted (SA-MR-03), so a stock item always keeps its source line.

## Migration, backfill, rollback

- Expand only: create 5 tables, the indexes and the CHECKs. Existing tables are not changed, and the Document Setup `used` check changes only in code.
- No backfill. Mock documents in the browser are not imported (ADR-0034).
- Rollback: before any approved Memo Receive exists, drop the 5 tables in reverse order. After that, roll forward with a fix migration. Approved Memo Stock is never deleted by a schema rollback.
- Move to inventory later: copy `memo_stock` with the same `id` and `stock_id`, check counts and checksums, switch reads, then write from the new owner only (ADR-0027 D1 pattern).

## SA revision 2 (2026-10-29, approved): line photos

```mermaid
erDiagram
  MEMO_RECEIVE_LINE ||--o{ MEMO_RECEIVE_LINE_PHOTO : "line_id (CASCADE)"
  STORED_FILE ||--o{ MEMO_RECEIVE_LINE_PHOTO : "file_id (RESTRICT)"
  MEMO_RECEIVE_LINE_PHOTO {
    uuid line_id PK,FK
    smallint position PK "CHECK 1..5"
    uuid file_id FK
  }
  STORED_FILE {
    uuid id PK
    varchar source_type "memo_receive.line-photo"
    varchar object_key "memo-receive-photo/…"
    varchar status "ready"
  }
```

Index `memo_receive_line_photo_file_idx (file_id)`. Migration `20261029150000_memo_receive_line_photo` is additive. Rollback: drop the table. Stored files stay (ADR-0030).
