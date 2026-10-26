# Database diagram: quotation (SA revision 1, approved 2026-10-26)

Owner: `backend-api-master`, PostgreSQL schema `partner` ([SA-QT-01](decisions.md)). New tables have
the prefix `quotation`; existing tables are referenced only.

```mermaid
erDiagram
  customer ||--o{ quotation : "customer_id (RESTRICT)"
  customer_address ||--o{ quotation : "shipping/invoice address id (SET NULL)"
  quotation ||--|{ quotation_line : "quotation_id (CASCADE)"
  quotation ||--o{ quotation_charge : "quotation_id (CASCADE)"
  quotation_line ||--o{ quotation_line_photo : "line_id (CASCADE)"
  stored_files ||--o{ quotation_line_photo : "file_id (RESTRICT)"
  stone_code ||--o{ quotation_line : "stone_code_id (SET NULL)"
  document_numbering ||--o{ quotation : "numbering_id (RESTRICT)"

  quotation {
    uuid id PK "uuid v7"
    uuid numbering_id FK "nullable: null = plain 1, 2, 3 (no Document Setup row in effect)"
    int running_no "max for numbering_id + 1; UNIQUE (numbering_id, running_no)"
    varchar40 doc_no UK "prefix + separator + running_no (SA-QT-04)"
    varchar20 status "DRAFT|PENDING_APPROVAL|APPROVED|REJECTED|CANCELLED (CHECK)"
    date doc_date
    date due_date "CHECK due_date >= doc_date"
    uuid customer_id FK
    varchar120 customer_code_snapshot
    varchar200 customer_name_snapshot
    uuid shipping_address_id FK "nullable after address delete"
    text shipping_address_snapshot "<= 1000"
    uuid invoice_address_id FK
    text invoice_address_snapshot "<= 1000"
    char3 currency_code
    numeric18_6 exchange_rate "nullable"
    varchar100 ref
    varchar500 document_note
    varchar10 discount_type "NONE|PERCENT|AMOUNT"
    numeric18_4 discount_value
    boolean tax_enabled
    numeric9_4 tax_rate
    boolean tax_included
    varchar120 labor_work "nullable = no labor"
    varchar10 labor_basis "PCS|WEIGHT"
    numeric18_3 labor_qty
    numeric18_2 labor_rate
    numeric18_2 subtotal "server-computed"
    numeric18_2 discount_amount
    numeric18_2 price_before_tax
    numeric18_2 tax_amount
    numeric18_2 charges_amount
    numeric18_2 labor_amount
    numeric18_2 grand_total
    varchar500 status_reason "reject/cancel reason"
    int version "optimistic, +1 per write"
    timestamp3 created_at
    varchar64 created_by
    timestamp3 updated_at
    varchar64 updated_by
    timestamp3 approved_at "nullable"
    varchar64 approved_by "nullable"
  }

  quotation_line {
    uuid id PK
    uuid quotation_id FK
    smallint position "1..200, UNIQUE (quotation_id, position)"
    varchar10 source "MANUAL (STOCK reserved)"
    uuid stone_code_id FK "nullable"
    varchar60 stone_code_snapshot
    varchar60 stone "plus shape, size, color, clarity, cutting, quality (each varchar60)"
    varchar40 lot
    varchar40 location
    varchar20 cer_type
    varchar60 cer_no
    int pcs "0..999999"
    numeric12_3 weight_ct
    varchar10 price_unit "PER_CT|PER_PCS"
    numeric18_2 unit_price
    varchar10 discount_type "NONE|PERCENT|AMOUNT (owner 2026-10-26)"
    numeric18_4 discount_value
    numeric18_2 discount_amount "server-computed"
    numeric18_2 amount "server-computed, after the line discount"
    varchar500 item_note
  }

  quotation_charge {
    uuid quotation_id PK "and FK"
    varchar20 charge_type PK "SHIPPING|HANDLING|INSURANCE|CERTIFICATE"
    numeric18_2 amount
  }

  quotation_line_photo {
    uuid line_id PK "and FK"
    smallint position PK "1..5; 1 = main photo"
    uuid file_id FK "stored_files.id"
  }
```

## Indexes

- `quotation (running_no) WHERE numbering_id IS NULL` UNIQUE — plain numbers (owner 2026-10-26).
- `quotation (numbering_id, running_no)` UNIQUE — next number = `max(running_no) + 1` read under the
  numbering-row lock (SA-QT-04); also the "used" check for Document Setup (SA-QT-05).
- `quotation (doc_date desc, created_at desc, id desc)` — list/daybook keyset (SA-QT-11).
- `quotation (status, doc_date desc, created_at desc, id desc)` — status filter / excluding cancelled.
- `quotation (customer_id, doc_date desc)` — customer filter and RESTRICT checks.
- `quotation_line (stone_code_id)` — FK checks when a stone code is deleted.
- `quotation_line_photo (file_id)` — FK checks.
- Search on `doc_no`, `customer_name_snapshot`, `ref` uses `ILIKE '%q%'` over the date-ordered keyset
  (bounded to 50 rows per page; add a trigram index only if measured slow).

## Existing tables touched

- `document_numbering`: no column change; locked `FOR UPDATE` while a number is issued. A row is "used"
  when a quotation references it; Document Setup save keeps used rows unchanged (SA-QT-05), and the
  `numbering_id` FK is RESTRICT, so a used row can't be deleted.
- `stored_files`: new rows with `kind = 'image'`, `source_type = 'quotation.line-photo'`,
  `source_id = <the photo id>` (the table allows one ready row per source; the uploader is `created_by`); never deleted (ADR-0030).
- `customer`: delete of a customer that has quotations returns the existing in-use error (RESTRICT).

## Migration, backfill, rollback

- One additive migration `…_quotation`: create the 4 tables, CHECK constraints, indexes. No backfill
  (there is no stored quotation data; the browser mock is not migrated).
- Rollback: drop the 4 tables in reverse FK order; photo bytes stay in storage as permanent files.
- Prisma models use `@@schema("partner")`. Later documents (reserve, memo, …) reuse the same
  "lock numbering row, max + 1" rule with their own `numbering_id` / `running_no` columns.
