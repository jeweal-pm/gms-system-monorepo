# Database design: inventory / sale (SA revision 1, approved 2026-11-18)

Two owners, two additive migrations, no cross-schema foreign key and no shared transaction. Inventory stores master ids (`customer_id`, `reserve_line_id`, `memo_stock_id`) as plain uuids with snapshots; master stores inventory ids (`sale_id`, `line_id`) as plain uuids in its consumption ledger.

## Part A — schema `inventory` (owner `backend-api-inventory`, migration `2026111xxxxxxx_sale`)

```mermaid
erDiagram
  sale ||--o{ sale_line : has
  sale ||--o{ sale_charge : has
  sale ||--o{ sale_sync_op : "saga ops"
  sale_line ||--o{ sale_line_photo : has
  stored_file ||--o{ sale_line_photo : "linked file"
  approval_setting ||..o{ sale : "type 'sale' read FOR SHARE"

  sale {
    uuid id PK
    uuid numbering_id "master document_numbering id, nullable"
    int running_no
    varchar40 doc_no UK
    varchar20 status "DRAFT|PENDING_APPROVAL|REVISION_REQUESTED|APPROVED|REJECTED"
    bool provisional "auto-approved create in flight"
    varchar10 sync_state "IDLE|SYNCING"
    int applied_revision "last revision master applied"
    date doc_date
    date due_date "CHECK due_date >= doc_date"
    uuid customer_id
    varchar120 customer_code_snapshot
    varchar200 customer_name_snapshot
    uuid shipping_address_id
    varchar1000 shipping_address_snapshot
    uuid invoice_address_id
    varchar1000 invoice_address_snapshot
    char3 currency_code
    decimal18_6 exchange_rate "Selling Rate; NULL when = company currency"
    varchar100 ref
    varchar250 document_note
    varchar10 discount_type
    decimal18_4 discount_value
    bool tax_enabled
    decimal9_4 tax_rate
    bool tax_included
    varchar120 labor_work
    varchar10 labor_basis
    decimal18_3 labor_qty
    decimal18_2 labor_rate
    decimal18_2 subtotal
    decimal18_2 discount_amount
    decimal18_2 price_before_tax
    decimal18_2 tax_amount
    decimal18_2 charges_amount
    decimal18_2 labor_amount
    decimal18_2 grand_total
    smallint line_count
    int total_pcs
    decimal15_3 total_weight_ct
    bool auto_approved
    smallint revision_count "0..1"
    timestamptz submitted_at "+ submitted_by, submitted_by_name"
    varchar10 review_action "+ review_note, reviewed_at, reviewed_by, reviewed_by_name (all or none)"
    timestamptz approved_at "+ approved_by"
    timestamptz deleted_at "+ deleted_by"
    int version
    timestamptz created_at "+ created_by, updated_at, updated_by"
  }
  sale_line {
    uuid id PK
    uuid sale_id FK
    smallint position "UK (sale_id, position)"
    varchar10 source "RESERVE|STOCK"
    uuid reserve_line_id "NOT NULL iff RESERVE"
    uuid reserve_id
    varchar40 reserve_doc_no
    uuid memo_stock_id "NOT NULL"
    varchar10 stock_id
    uuid memo_receive_id
    varchar40 memo_receive_doc_no
    varchar60 stone_code "+ stone, shape, size, color, clarity, cutting, quality"
    varchar40 lot
    varchar40 location
    varchar20 cer_type
    varchar60 cer_no
    varchar10 price_unit
    int pcs
    decimal12_3 weight_ct
    int cap_pcs "open/pending at last save"
    decimal12_3 cap_weight_ct
    decimal18_4 reserve_net_unit_price "RESERVE only"
    decimal18_2 unit_price "> 0"
    varchar10 discount_type
    decimal18_4 discount_value
    decimal18_2 discount_amount
    decimal18_2 amount
    varchar500 item_note
  }
  sale_charge {
    uuid sale_id PK "FK"
    varchar20 charge_type PK
    decimal18_2 amount
  }
  sale_line_photo {
    uuid line_id PK "FK cascade"
    smallint position PK "0..4"
    uuid file_id FK "stored_file, RESTRICT"
  }
  sale_sync_op {
    uuid id PK
    uuid sale_id FK "cascade"
    int revision "UK (sale_id, revision)"
    varchar16 kind "CREATE|APPROVE|UPDATE|DELETE"
    varchar10 state "PREPARED|CONFIRMED|DONE|REFUSED|STUCK"
    char64 request_hash
    jsonb payload
    jsonb result
    smallint attempts
    timestamptz next_attempt_at
    varchar64 last_error
    varchar64 created_by
    timestamptz created_at "+ updated_at"
  }
```

Constraints (SQL CHECKs in the migration):

- `sale_status_check`, `sale_sync_state_check`, `sale_revision_count_check (0..1)`, `sale_review_check` (all five review columns null or all set), `sale_submitted_check` (null while DRAFT and on auto-approved rows), `sale_due_date_check`, `sale_exchange_rate_check (exchange_rate IS NULL OR exchange_rate > 0)`, money ≥ 0, `version ≥ 1`.
- `sale_line_source_check`: `(source = 'RESERVE' AND reserve_line_id IS NOT NULL AND reserve_id IS NOT NULL) OR (source = 'STOCK' AND reserve_line_id IS NULL AND reserve_id IS NULL)`.
- `sale_line_qty_check`: `pcs >= 0 AND weight_ct >= 0 AND (pcs > 0 OR weight_ct > 0) AND pcs <= cap_pcs AND weight_ct <= cap_weight_ct`; `unit_price > 0`; `price_unit IN ('PER_CT','PER_PCS')`.
- Unique: `sale_line_reserve_line_key (sale_id, reserve_line_id) WHERE reserve_line_id IS NOT NULL`; `sale_line_stock_key (sale_id, memo_stock_id) WHERE source = 'STOCK'`.
- `sale_sync_op_state_check`, `sale_sync_op_kind_check`.
- `approval_setting_type_check` widened with `'sale'`; `INSERT ('sale', true)`.
- `notification_event` / `stored_file.source_type`: widen any value CHECK to include `sale` / `sale-line` (if present).

Indexes (Daybook, Approve Center, saga — same set as `load_to_stock`):

| Index | Columns / predicate | Used by |
|---|---|---|
| `sale_numbering_running_no_key` UK | `(numbering_id, running_no)`; plain `(running_no) WHERE numbering_id IS NULL` | numbering |
| `sale_list_idx` | `(doc_date DESC, created_at DESC, id DESC) WHERE deleted_at IS NULL AND NOT provisional` | Daybook |
| `sale_deleted_list_idx` | same `WHERE deleted_at IS NOT NULL` | Deleted filter |
| `sale_pending_idx` | `(submitted_at, id) WHERE status = 'PENDING_APPROVAL' AND deleted_at IS NULL` | Approve Center |
| `sale_revision_idx` | `(id) WHERE status = 'REVISION_REQUESTED' AND deleted_at IS NULL` | turn-OFF guard |
| `sale_syncing_idx` | `(sync_state) WHERE sync_state = 'SYNCING'` | start-up re-drive |
| `sale_customer_idx` | `(customer_id, doc_date DESC)` | later Account Outstanding / Sale Report |
| `sale_line_memo_stock_idx`, `sale_line_reserve_line_idx` | `(memo_stock_id)`, `(reserve_line_id)` | later reports / support |
| `sale_line_photo_file_idx` | `(file_id)` | photo read authorization |
| `sale_sync_op_due_idx` | `(next_attempt_at) WHERE state IN ('PREPARED','CONFIRMED')` | sweep |
| `sale_sync_op_done_idx` | `(updated_at) WHERE state = 'DONE'` | housekeeping |

Grants: tables owned by the migrator role; `gms_inventory_app` gets DML (existing default privileges in `provision-inventory-roles.sql`). No grant to other roles.

## Part B — schema `partner` (owner `api-master`, migration `2026111xxxxxxx_sale_consumption`)

```mermaid
erDiagram
  reserve ||--o{ reserve_line : has
  memo_stock ||--o{ reserve_line : "held by"
  sale_consumption ||--o{ sale_consumption_line : has
  reserve_line ||--o{ sale_consumption_line : "consumed by (RESTRICT)"
  memo_stock ||--o{ sale_consumption_line : "consumed by (RESTRICT)"

  reserve_line {
    uuid id PK
    uuid memo_stock_id "NULL = manual line"
    int pcs
    decimal12_3 weight_ct
    int sold_pcs "NEW default 0"
    decimal12_3 sold_weight_ct "NEW default 0"
  }
  memo_stock {
    uuid id PK
    int pending_pcs
    int reserved_pcs
    int sold_pcs "written by sale consumption"
    int purchased_pcs "sold >= purchased"
  }
  sale_consumption {
    uuid sale_id PK "inventory sale id (no FK)"
    varchar40 sale_doc_no
    uuid customer_id
    char3 currency_code
    int revision
    char64 request_hash
    jsonb result
    timestamp applied_at
    varchar64 applied_by
    timestamp updated_at
  }
  sale_consumption_line {
    uuid sale_id PK "FK cascade"
    uuid line_id PK "inventory sale_line id"
    varchar10 source "RESERVE|STOCK"
    uuid reserve_line_id "FK RESTRICT, NULL for STOCK"
    uuid memo_stock_id "FK RESTRICT"
    int pcs
    decimal12_3 weight_ct
  }
```

- `reserve_line_sold_check`: `sold_pcs BETWEEN 0 AND pcs AND sold_weight_ct BETWEEN 0 AND weight_ct AND (memo_stock_id IS NOT NULL OR (sold_pcs = 0 AND sold_weight_ct = 0))`.
- `reserve_line_open_idx`: `(reserve_id, position) WHERE memo_stock_id IS NOT NULL AND (sold_pcs < pcs OR sold_weight_ct < weight_ct)`.
- `reserve_open_customer_idx` on `reserve`: `(customer_id, currency_code, doc_date, id) WHERE status = 'APPROVED' AND deleted_at IS NULL`.
- `sale_consumption_line`: CHECK source shape as inventory; `pcs ≥ 0`, `weight_ct ≥ 0`; indexes `(reserve_line_id)`, `(memo_stock_id)`; unique `(sale_id, reserve_line_id) WHERE reserve_line_id IS NOT NULL`.
- Existing `memo_stock_balance` and `memo_stock_purchased_check` are unchanged and enforce the bucket moves.
- `api-master` runtime role gets DML on the two new tables (existing default privileges).

## Migration, backfill, rollback

- Both migrations are additive; defaults 0 need no backfill (no Sale exists). Run master first (internal API depends on it), then inventory.
- Rollback before the first applied Sale: drop the new tables/columns/indexes and the `approval_setting` row (down scripts provided). After applied sales exist: release auto-approved sales through Delete first; approval-ON sales are final (Q-SL-16), so rollback becomes forward-fix only — recorded in ADR-0054.
- Retention: `stored_file` rows and bytes under `files/sale/` are never deleted by any migration or rollback (ADR-0030).
