# Sequence diagrams: inventory / sale (SA revision 1, approved 2026-11-18)

Main user flow (not copied here): [diagram/sale-flow.md](../../../../diagram/sale-flow.md). No gateway: Nginx routes `/api/inventory/` to `backend-api-inventory` and `/api/master/` to `api-master`. Internal master calls never pass Nginx.

## 1. Save (approval ON → DRAFT)

```mermaid
sequenceDiagram
  autonumber
  participant UI as Browser (Sale page)
  participant N as Nginx
  participant I as backend-api-inventory (sale)
  participant M as api-master (internal)
  participant IDB as PostgreSQL inventory
  participant PDB as PostgreSQL partner
  UI->>N: POST /api/inventory/v1/sale (SaleInput, Origin)
  N->>I: forward
  I->>I: JWT + live grant sale:ADD + CSRF + Zod (≤ 200 lines)
  I->>M: POST /internal/v1/inventory/sale/prepare (party, currency, reserveLineIds, memoStockIds)
  M->>PDB: ≤ 4 bounded reads (customer+addresses, currency, reserve lines+headers, memo stock)
  M-->>I: snapshots, caps (open/pending), status per reference
  I->>M: POST /document-numbering/resolve {transactionKey: sale, markUsed: true}
  M-->>I: numbering row
  alt reference invalid / other customer or currency / qty > cap
    I-->>UI: 422 SALE_REFERENCE_INVALID or VALIDATION_ERROR (lines.N.pcs exceeds_open|exceeds_pending)
  else valid
    I->>IDB: BEGIN, approval_setting 'sale' FOR SHARE (ON), advisory lock numbering, insert sale DRAFT + lines + charges + photo links, COMMIT
    I-->>UI: 201 {id, docNo, version, status: DRAFT}
  end
```

## 2. Approve with From Reserve + From Stock lines (saga, success)

```mermaid
sequenceDiagram
  autonumber
  participant AP as Browser (Approve page)
  participant I as backend-api-inventory
  participant IDB as inventory
  participant M as api-master
  participant PDB as partner
  AP->>I: POST /sale/{id}/approve {expectedVersion}
  I->>I: grant sale:APPROVE+VIEW, CSRF
  I->>IDB: tx0: UPDATE sale SET sync_state=SYNCING, version+1 WHERE id AND version AND status=PENDING_APPROVAL AND deleted_at IS NULL AND sync_state=IDLE, INSERT sale_sync_op (rev n, APPROVE, payload, hash)
  I->>M: PUT /internal/v1/inventory/sale-consumptions/{saleId} {revision n, lines}
  M->>PDB: BEGIN, sale_consumption FOR UPDATE
  M->>PDB: reserve headers FOR SHARE (id order): APPROVED, not deleted, same customer + currency
  M->>PDB: reserve_line FOR UPDATE (id order): open ≥ q
  M->>PDB: memo_stock FOR NO KEY UPDATE (id order): pending ≥ q (STOCK)
  M->>PDB: reserve_line.sold += q, memo_stock reserved −= q, sold += q (RESERVE), pending −= q, sold += q (STOCK)
  M->>PDB: replace sale_consumption_line, store revision + hash + result, COMMIT
  M-->>I: 200 {revision n, replayed: false}
  I->>IDB: tx1: op DONE, sale APPROVED, approved_at/by, applied_revision=n, sync_state=IDLE, notification APPROVED → creator
  I-->>AP: 200 {status: APPROVED}
  I-->>AP: SSE (creator's tab) notification id → refetch
```

## 3. Short at approve (business refusal) and concurrent approvals

```mermaid
sequenceDiagram
  autonumber
  participant A as Approver A (Sale S1)
  participant B as Approver B (Sale S2)
  participant I as inventory
  participant M as api-master
  participant PDB as partner
  par same Reserve line L (open 2 pcs), S1 and S2 each sell 2
    A->>I: approve S1
    I->>M: PUT sale-consumptions/S1
    M->>PDB: lock reserve_line L FOR UPDATE (wins)
  and
    B->>I: approve S2
    I->>M: PUT sale-consumptions/S2
    M->>PDB: lock reserve_line L FOR UPDATE (waits)
  end
  M->>PDB: S1 open 2 ≥ 2 → sold += 2, COMMIT
  M-->>I: 200 (S1)
  I-->>A: APPROVED
  M->>PDB: S2 re-check: open 0 < 2 → ROLLBACK (nothing changed)
  M-->>I: 409 SALE_CONSUMPTION_EXCEEDS_AVAILABLE {lines:[{lineId, field: pcs, code: exceeds_open, availablePcs: 0}]}
  I->>I: tx1′: op REFUSED, S2 back to PENDING_APPROVAL, sync_state=IDLE
  I-->>B: 409 SALE_SOURCE_SHORT {fieldErrors: lines.N.pcs exceeds_open}
```

A Memo Out holding the same item in `reserved` is never touched: S1/S2 consume only through Reserve line L's open quantity.

## 4. Save with approval OFF (auto-approved, provisional create)

```mermaid
sequenceDiagram
  autonumber
  participant UI as Browser
  participant I as inventory
  participant IDB as inventory DB
  participant M as api-master
  UI->>I: POST /sale
  I->>M: prepare + numbering (as diagram 1)
  I->>IDB: tx0: setting FOR SHARE (OFF), insert sale APPROVED provisional, SYNCING, op CREATE rev 1
  I->>M: PUT sale-consumptions/{id} rev 1
  alt 200
    I->>IDB: tx1: provisional=false, auto_approved=true, applied_revision=1, IDLE
    I-->>UI: 201 {status: APPROVED}
  else 409 short / 422 unavailable
    I->>IDB: tx1′: delete provisional sale (never listed)
    I-->>UI: 409 SALE_SOURCE_SHORT / 422 SALE_REFERENCE_INVALID (number consumed, gap allowed as Load to Stock)
  else timeout / 5xx
    I-->>UI: 503 SYNC_PENDING {id}, op stays PREPARED → re-drive on access / start / sweep
  end
```

## 5. Edit or delete an auto-approved Sale (release, in-use guard)

```mermaid
sequenceDiagram
  autonumber
  participant UI as Browser
  participant I as inventory
  participant M as api-master
  participant PDB as partner
  UI->>I: POST /sale/{id}/delete {expectedVersion}
  I->>I: tx0: auto-approved, not deleted, IDLE → SYNCING, op DELETE rev n+1 (lines = [])
  I->>M: PUT sale-consumptions/{id} {revision n+1, lines: []}
  M->>PDB: lock as diagram 2, for each previous line: memo_stock.sold − q ≥ purchased?
  alt every item releasable
    M->>PDB: RESERVE: reserve_line.sold −= q, memo_stock sold −= q, reserved += q, STOCK: sold −= q, pending += q, delete consumption lines, COMMIT
    M-->>I: 200
    I->>I: tx1: soft delete (deleted_at/by), IDLE
    I-->>UI: 200
  else a Purchase already paid the vendor for a sold item
    M-->>I: 409 SALE_CONSUMPTION_IN_USE {stockIds}
    I->>I: tx1′: back to IDLE, unchanged
    I-->>UI: 409 SALE_IN_USE
  end
```

Edit uses the same call with the new line set (increases re-checked, decreases released).

## 6. Reserve edit after a sale (master local)

```mermaid
sequenceDiagram
  autonumber
  participant UI as Browser (Reserve page)
  participant M as api-master
  participant PDB as partner
  UI->>M: reserve.update (auto-approved Reserve)
  M->>PDB: reserve header FOR NO KEY UPDATE (waits for a running consumption holding FOR SHARE)
  M->>PDB: usedBy: any reserve_line.sold > 0 → sale_consumption.sale_doc_no
  M-->>UI: RESERVE_IN_USE (usedBy SL…)
```

## 7. From Reserve picker

```mermaid
sequenceDiagram
  autonumber
  participant UI as Browser (P-01)
  participant N as Nginx
  participant I as inventory
  participant M as api-master
  participant PDB as partner
  UI->>N: GET /api/inventory/v1/sale/reserve-lines?customerId&currency&q&cursor&limit=50
  N->>I: forward
  I->>I: sale:VIEW
  I->>M: POST /internal/v1/inventory/sale/reserve-lines/search
  M->>PDB: 1 keyset query (reserve_open_customer_idx ⋈ reserve_line_open_idx), LIMIT 51
  M-->>I: items + nextCursor
  I-->>UI: 200 / 503 MASTER_UNAVAILABLE (dialog Retry)
```
