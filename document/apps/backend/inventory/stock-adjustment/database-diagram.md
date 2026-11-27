# Database diagram: inventory / stock-adjustment (SA revision 1, approved 2026-11-24)

```mermaid
erDiagram
  stock_adjustment ||--o{ stock_adjustment_line : has
  stock ||--o{ stock_adjustment_line : "adjusted by"
  stock ||--o{ stock_movement : ledger

  stock_adjustment {
    uuid id PK
    varchar doc_no "unique where not null"
    date doc_date
    varchar location "40, Location Master name"
    varchar ref "100"
    varchar note "250"
    varchar status "DRAFT|PENDING_APPROVAL|REVISION_REQUESTED|APPROVED|REJECTED"
    bool auto_approved
    smallint revision_count "0..1"
    timestamptz submitted_at
    uuid submitted_by
    varchar review_action
    varchar review_note
    timestamptz applied_at
    int version
    timestamptz deleted_at
    uuid deleted_by
    uuid created_by
    timestamptz created_at
    timestamptz updated_at
  }
  stock_adjustment_line {
    uuid id PK
    uuid adjustment_id FK
    smallint position
    uuid stock_uuid FK "unique per adjustment"
    varchar stock_id "snapshot"
    varchar lot_key "snapshot"
    int stock_pcs "on hand when picked"
    decimal stock_weight_ct "12,3"
    decimal stock_price "18,2 snapshot"
    int physical_pcs "check >= 0"
    decimal physical_weight_ct "check >= 0"
    decimal physical_price "nullable, check >= 0"
    varchar remark "250"
    int applied_version "stock.version after apply"
    decimal prev_stock_price "for reverse"
  }
```

## Migration (one file, `backend-api-inventory/prisma/migrations/<ts>_stock_adjustment/`)
1. Create both tables with these constraints:
   - FK `stock_adjustment_line.stock_uuid → stock.id` with `ON DELETE RESTRICT`.
   - Unique `(adjustment_id, stock_uuid)` and unique `(adjustment_id, position)`.
   - Checks on the status values, quantities ≥ 0, and `revision_count` between 0 and 1.
2. Indexes:
   - `stock_adjustment (doc_date desc, id desc) WHERE deleted_at IS NULL` for the daybook.
   - `stock_adjustment (status) WHERE status = 'PENDING_APPROVAL'`.
   - `stock_adjustment_line (stock_uuid)`.
3. Replace `stock_movement_kind_check` with the current list plus `'ADJUST', 'ADJUST_REVERSAL'`. Copy the list from `20261123120000_sale_own_stock` and re-check the latest migration first.
4. Widen the `approval_setting` type check with `'stock-adjustment'`.
5. Grants: the same pattern as the sale tables (app role DML; the ledger stays append-only).

`stock` itself gets no new column.
