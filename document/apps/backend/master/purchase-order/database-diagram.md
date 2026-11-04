# Database diagram: purchase-order (SA revision 1, approved 2026-11-04)

Schema `partner`, migration `20261104090000_purchase_order` (additive; rollback = drop the four tables).

```mermaid
erDiagram
  vendor ||--o{ purchase_order : "vendor_id RESTRICT"
  vendor_address |o--o{ purchase_order : "address_id SET NULL"
  document_numbering |o--o{ purchase_order : "numbering_id RESTRICT"
  purchase_order ||--|{ purchase_order_line : "CASCADE"
  purchase_order ||--o{ purchase_order_charge : "CASCADE"
  purchase_order_line ||--o{ purchase_order_line_photo : "CASCADE"
  stored_file ||--o{ purchase_order_line_photo : "file_id RESTRICT"
  stone_code |o--o{ purchase_order_line : "stone_code_id SET NULL"

  purchase_order {
    uuid id PK
    uuid numbering_id FK "null = plain 1, 2, 3"
    int running_no
    varchar40 doc_no UK
    varchar20 status "PENDING_APPROVAL | APPROVED"
    date doc_date
    date due_date
    uuid vendor_id FK
    varchar120 vendor_code_snapshot
    varchar200 vendor_name_snapshot
    uuid address_id FK
    varchar1000 address_snapshot
    char3 currency_code
    numeric exchange_rate "18,6 null"
    varchar100 ref
    varchar500 document_note
    varchar10 discount_type
    numeric discount_value
    bool tax_enabled
    numeric tax_rate
    bool tax_included
    varchar120 labor_work
    varchar10 labor_basis
    numeric labor_qty
    numeric labor_rate
    numeric subtotal
    numeric discount_amount
    numeric price_before_tax
    numeric tax_amount
    numeric charges_amount
    numeric labor_amount
    numeric grand_total
    timestamp approved_at
    varchar64 approved_by
    int version
    timestamp created_at
    varchar64 created_by
    timestamp updated_at
    varchar64 updated_by
  }
  purchase_order_line {
    uuid id PK
    uuid purchase_order_id FK
    smallint position "UK with purchase_order_id"
    varchar10 source "MANUAL"
    uuid stone_code_id FK
    varchar60 stone_code_snapshot
    varchar60 stone_shape_size_color_clarity_cutting_quality "7 columns"
    varchar40 lot
    varchar40 location "free text"
    varchar20 cer_type
    varchar60 cer_no
    int pcs
    numeric weight_ct "12,3"
    varchar10 price_unit
    numeric unit_price "18,2"
    varchar10 discount_type
    numeric discount_value
    numeric discount_amount
    numeric amount
    varchar500 item_note
    int purchased_pcs "default 0, CHECK 0..pcs"
    numeric purchased_weight_ct "default 0, CHECK 0..weight_ct"
  }
  purchase_order_charge {
    uuid purchase_order_id PK
    varchar20 charge_type PK
    numeric amount
  }
  purchase_order_line_photo {
    uuid line_id PK
    smallint position PK "1..5"
    uuid file_id FK
  }
```

Constraints and indexes:

- `purchase_order_numbering_running_no_key (numbering_id, running_no)`; partial unique `(running_no) WHERE numbering_id IS NULL`; `purchase_order_doc_no_key`.
- `purchase_order_list_idx (doc_date desc, created_at desc, id desc)`, `purchase_order_status_idx (status, doc_date desc, …)`, `purchase_order_vendor_idx (vendor_id, doc_date desc)`, `purchase_order_address_idx`.
- `purchase_order_line_position_key (purchase_order_id, position)`; `purchase_order_line_stone_code_idx`.
- CHECK `purchase_order_status_check` (two values), `purchase_order_line_source_check` (`MANUAL`), `purchase_order_line_purchased_check` (`purchased_pcs BETWEEN 0 AND pcs AND purchased_weight_ct BETWEEN 0 AND weight_ct`), `purchase_order_line_photo_position_check` (1..5).
