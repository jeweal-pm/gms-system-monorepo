# Database: inventory / merge-split (SA revision 1, pending-review)

Schema `inventory` (owner `backend-api-inventory`) plus one table in master schema `partner`. No cross-service FK.

```mermaid
erDiagram
  merge_split ||--o{ merge_split_source : has
  merge_split ||--o{ merge_split_result : has
  merge_split_source ||--o{ merge_split_result : "SPLIT parent"
  merge_split_result ||--o{ merge_split_result_photo : has
  stock ||--o{ merge_split_source : "consumed by"
  stock ||--o| merge_split_result : "created as"
  stored_file ||--o{ merge_split_result_photo : file
  stock ||--o{ stock_movement : ledger

  merge_split {
    uuid id PK
    uuid numbering_id
    int running_no
    varchar40 doc_no UK
    date doc_date
    varchar5 mode "SPLIT|MERGE"
    varchar100 ref
    varchar250 note
    varchar20 status "ADR-0050 set"
    bool auto_approved
    smallint revision_count "0..1"
    int apply_seq "0 = never applied"
    timestamptz applied_at
    int version
    timestamptz deleted_at
    varchar64 created_by
  }
  merge_split_source {
    uuid id PK
    uuid merge_split_id FK
    smallint position "1..200"
    varchar40 client_key
    uuid stock_uuid FK
    varchar10 stock_id "snapshot"
    int avail_pcs "snapshot = take"
    dec12_3 avail_weight_ct
    varchar10 price_unit
    dec18_4 unit_cost_base
    dec18_2 take_cost_base "set at apply"
  }
  merge_split_result {
    uuid id PK
    uuid merge_split_id FK
    smallint position "1..200"
    uuid source_id FK "SPLIT only"
    text attrs "stone_code_id..cer_no columns"
    varchar40 location
    varchar40 lot
    varchar50 parcel
    varchar10 price_unit
    int pcs
    dec12_3 weight_ct
    dec18_4 unit_cost_base
    dec18_2 cost_amount_base
    dec18_2 stock_price
    dec18_2 sale_price
    varchar500 item_note
    uuid stock_uuid FK "set at apply"
    varchar10 stock_id
    int applied_version
  }
  merge_split_result_photo {
    uuid result_id PK
    smallint position PK "1..5"
    uuid file_id FK
  }
```

`merge_split` copies every header column and CHECK of `stock_adjustment` (numbering, review, submitted, deleted) except `location`, and adds `mode` and `apply_seq`.

## Constraints and indexes

- `merge_split`: `mode IN ('SPLIT','MERGE')`; `apply_seq >= 0`; doc no / running no unique indexes and `merge_split_list_idx (doc_date DESC, id DESC) WHERE deleted_at IS NULL`, `merge_split_pending_idx (status) WHERE status = 'PENDING_APPROVAL'` (as stock_adjustment).
- `merge_split_source`: unique `(merge_split_id, stock_uuid)`, `(merge_split_id, position)`, `(merge_split_id, client_key)`; `avail_pcs >= 1`, `avail_weight_ct >= 0`; FK stock `ON DELETE RESTRICT`; **index `merge_split_source_stock_idx (stock_uuid)`** for the Pending exclusion.
- `merge_split_result`: unique `(merge_split_id, position)`; unique `stock_uuid` where not null; `pcs >= 1`, `weight_ct >= 0`, prices/cost ≥ 0; `(stock_uuid IS NULL) = (applied_version IS NULL)`; FK source `ON DELETE CASCADE`, FK stock `ON DELETE RESTRICT`. Mode rules (SPLIT has `source_id`, MERGE has none) are enforced in the service (cross-table).
- `merge_split_result_photo`: FK result `ON DELETE CASCADE`, FK `stored_file` RESTRICT, index `(file_id)`.
- `stock_movement_kind_check`: superset of the latest list + `'SPLIT_OUT','SPLIT_IN','SPLIT_REVERSAL','MERGE_OUT','MERGE_IN','MERGE_REVERSAL'`.
- `stock`: **no column change**. Results reuse `pcs`, `on_hand_*`, `consumed_*` and the generated `lot_key`/`card_key`/`item_key`; `load_row_id` stays NULL on results.
- Grants to `gms_inventory_app` as the stock_adjustment migration.

## Master (`partner`)

```mermaid
erDiagram
  inventory_stock_id_issue {
    varchar40 document_type PK
    uuid document_id PK
    int apply_seq PK
    smallint count
    varchar10_array stock_ids
    timestamptz issued_at
  }
```

CHECK `document_type IN ('merge-split')`, `count BETWEEN 1 AND 200`, `cardinality(stock_ids) = count`. Written in the same master transaction as `issueStockIds`.

## Migrations and rollback

| Service | Migration | Content | Rollback |
|---|---|---|---|
| inventory | `prisma/migrations/20261127100000_merge_split/` | 4 tables, indexes, kind check, grants; Prisma models | `prisma/rollback/20261127100000_merge_split.down.sql`: refuse if any `SPLIT_*`/`MERGE_*` movement exists, else drop the 4 tables and restore the previous kind check |
| master | `prisma/migrations/20261127100000_inventory_stock_id_issue/` | 1 table | drop the table (issued IDs stay consumed in the counter) |

Additive only; no backfill. The approval type row and check already include `merge-split`.
