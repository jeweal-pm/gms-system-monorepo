# Sequence diagram: purchase (SA revision 1, approved 2026-11-04)

Main user flow: [diagram/purchase-flow.md](../../../../diagram/purchase-flow.md) (it is not copied here). Decisions: [SA-PU-04…13](decisions.md). Timing is SA default D2: **check at Save, cut at Approve** (Q-MR-15). Every call goes UI → Next same-origin `/api/master/trpc` → nginx → `api-master`. The master auth context checks JWT, current authorization and license, then the grant (and CSRF on mutations), before any domain code runs.

## Open, pickers and save

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Purchase page
  participant NX as Next proxy / nginx
  participant API as api-master (purchase)
  participant AZ as master auth context
  participant DB as PostgreSQL partner

  U->>FE: Open /purchase-order/purchase
  FE->>NX: purchase.options, purchase.nextNumber, purchase.list, currency.options
  NX->>API: tRPC queries
  API->>AZ: purchase:VIEW (JWT, current authz, license)
  AZ-->>API: ok / UNAUTHORIZED / PERMISSION_DENIED / AUTHORIZATION_UNAVAILABLE
  API->>DB: vendors+addresses, currencies, stone lists, numbering, daybook keyset ≤ 50
  API-->>FE: options / PU-n preview / daybook

  U->>FE: Memo Stock (vendor + currency chosen)
  FE->>API: purchase.memoStock {vendorId, currency, status, q, from, to, cursor}
  API->>DB: SOLD rows (sold − purchased > 0, memo_stock_sold_open_idx; empty in rev 1)<br/>UNION ALL IN_STOCK rows (pending > 0, memo_stock_pending_idx), LIMIT 51 + counts FILTER
  API-->>FE: rows (sale = null, locationType = null), nextCursor, counts {all, sold, inStock}

  U->>FE: Purchase Order
  FE->>API: purchase.purchaseOrderLines {vendorId, currency, status, q, from, to, cursor}
  API->>DB: purchase_order (APPROVED, vendor, currency) JOIN open lines (purchase_order_line_open_idx), LIMIT 51 + counts FILTER
  API-->>FE: PO lines with available pcs/weight, net unit price

  U->>FE: Save (rows STOCK / PURCHASE_ORDER / MANUAL; edits pcs, weight, price)
  FE->>API: purchase.create(PurchaseInput) [ADD + CSRF]  (update: {id, expectedVersion, …} [EDIT + CSRF])
  API->>API: strict zod (sources, duplicates, pcs/weight, price > 0, discounts)
  API->>DB: BEGIN (WRITE_TX 4 s); update: status PENDING_APPROVAL + version check (engine)
  API->>DB: read memo_stock / purchase_order_line (+ purchase_order) by id, no lock
  alt foreign vendor/currency, PO not APPROVED, missing
    API-->>FE: 422 PURCHASE_REFERENCE_INVALID [lines.N.memoStockId | purchaseOrderLineId]
  else quantity above current availability
    API-->>FE: 400 VALIDATION_ERROR [lines.N.pcs|weightCt exceeds_available]
  else ok
    API->>API: copy stone fields, price unit, Stock ID (STOCK) from the source
    API->>DB: lock document_numbering (create) → running no (no Stock ID for MANUAL / PO lines, ADR-0051)
    API->>DB: INSERT / replace purchase (PENDING_APPROVAL), purchase_line, purchase_charge. No stock change
    API->>DB: COMMIT
    API-->>FE: {id, docNo, version, stockIds}
  end

  U->>FE: Delete (confirm)
  FE->>API: purchase.delete({id, expectedVersion}) [DELETE + CSRF]
  API->>DB: DELETE purchase WHERE id AND version AND status PENDING_APPROVAL (CASCADE); no stock change
  API-->>FE: {ok: true} / NOT_FOUND / STATUS_INVALID / CHANGED
```

## Approve (the stock cut)

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Purchase page
  participant API as api-master (purchase)
  participant DB as PostgreSQL partner

  U->>FE: Approve (confirm: "takes N items off Memo Stock / Purchase Orders; read-only after")
  FE->>API: purchase.approve({id, expectedVersion}) [APPROVE + CSRF]
  API->>DB: BEGIN (WRITE_TX); UPDATE purchase SET APPROVED, approved_at/by, version+1<br/>WHERE id AND version AND status PENDING_APPROVAL
  alt 0 rows
    API->>DB: re-read status
    API-->>FE: 404 NOT_FOUND / 409 STATUS_INVALID / 409 CHANGED
  else 1 row
    API->>DB: read lines; sum per key (memo stock item × group, PO line)
    API->>DB: SELECT memo_stock WHERE id = ANY(..) ORDER BY id FOR UPDATE
    API->>DB: SELECT purchase_order_line JOIN purchase_order WHERE id = ANY(..) ORDER BY id FOR UPDATE OF purchase_order_line
    alt any key short (IN_STOCK q > pending; SOLD q > sold − purchased; PO q > ordered − purchased) or PO no longer valid
      API->>DB: ROLLBACK (status stays PENDING_APPROVAL)
      API-->>FE: 409 PURCHASE_PENDING_SHORT [every short lines.N.pcs|weightCt exceeds_available]
      FE-->>U: rows marked; edit quantity or remove row, save, approve again
    else enough
      API->>DB: UPDATE memo_stock … FROM (VALUES…) (IN_STOCK: pending−q, sold+q, purchased+q; SOLD: purchased+q; version+1)
      API->>DB: UPDATE purchase_order_line … FROM (VALUES…) (purchased_pcs/weight + q)
      API->>DB: COMMIT
      API-->>FE: {id, version, status: APPROVED, lineCount}
      FE-->>U: read-only; Memo Outstanding › Vendor shows the quantity in Sold; PO outstanding reduced
    end
  end
```

## Failure and timing notes

- Lock waits count against `WRITE_TX` (4 s, maxWait 2 s). A timeout, or a pool or connection failure, → `PARTNER_UNAVAILABLE` 503. The client keeps the edits and does not retry a write automatically.
- A number race (P2002 on running no) → `PURCHASE_CHANGED`. The user saves again (the engine rule).
- Two pending purchases may name the same quantity. The approvals serialize on the `memo_stock` / `purchase_order_line` row locks, and the second one gets `PURCHASE_PENDING_SHORT`.
- The other `memo_stock` writers (approvals of Memo Return, Memo Out, Reserve and Memo Out Return) lock only `memo_stock`, in id order. Purchase approve locks the purchase row, then `memo_stock`, then `purchase_order_line`. No writer takes these in reverse order, so there is no deadlock.

## SA revision 2 (proposed 2026-11-05): approve a merged line

```mermaid
sequenceDiagram
  participant API as api-master (purchase.approve)
  participant DB as PostgreSQL partner
  API->>DB: guarded UPDATE purchase → APPROVED
  API->>DB: SELECT memo_stock … FOR UPDATE (id order)
  Note over API: per MERGED line: soldOpen = sold − purchased,<br/>stockTake = q − soldOpen;<br/>q < soldOpen or stockTake > pending → PURCHASE_PENDING_SHORT (rollback)
  API->>DB: UPDATE memo_stock SET pending −= stockTake, sold += stockTake, purchased += q
  API->>DB: UPDATE purchase_line SET sold_part_pcs / sold_part_weight_ct = soldOpen
```
