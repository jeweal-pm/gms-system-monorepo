# Sequence diagrams: inventory / stock-adjustment (SA revision 1, approved 2026-11-24)

## Save with approval OFF (takes effect)

```mermaid
sequenceDiagram
  participant B as Browser
  participant I as backend-api-inventory
  participant M as api-master (internal)
  participant DB as inventory DB
  B->>I: POST /stock-adjustment {docDate, location, lines}
  I->>I: requireGrant ADD, Zod, ≤200 distinct stockUuid
  I->>M: reference() (cached) → locations valid?
  I->>M: document-numbering/resolve {stock-adjustment, docDate}
  I->>DB: BEGIN
  I->>DB: INSERT stock_adjustment (+ lines)
  I->>DB: SELECT … FROM stock WHERE id = ANY($ids) ORDER BY id FOR UPDATE
  alt on hand ≠ snapshot / not ACTIVE / other location
    I->>DB: ROLLBACK
    I-->>B: 409 STOCK_ADJUSTMENT_STOCK_CHANGED / 422 LINE_UNAVAILABLE
  else ok
    I->>DB: UPDATE stock SET on_hand=physical, pcs+=Δ, price, cost, version+1
    I->>DB: INSERT stock_movement kind ADJUST (changed lines only)
    I->>DB: UPDATE lines applied_version, prev_stock_price; doc APPROVED auto
    I->>DB: COMMIT
    I-->>B: 201 {id, docNo, version, status: APPROVED}
  end
```

## Approval ON
`POST` creates a DRAFT (no stock lock). `submit` sets PENDING_APPROVAL after a read-only stale check. Approve runs the same lock → check → update → ledger block as above, then APPROVED. Revise and reject only change the status.

## Edit or delete an effective document
In one transaction:
1. Lock the stocks.
2. Check that every stock still has `version = applied_version`. If not, return 409 STOCK_ADJUSTMENT_IN_USE.
3. Reverse: on hand goes back to `stock_pcs`/`stock_weight_ct`, the price goes back to `prev_stock_price`, and an `ADJUST_REVERSAL` row is written.
4. Then either re-apply the new lines (edit) or soft delete (delete).
