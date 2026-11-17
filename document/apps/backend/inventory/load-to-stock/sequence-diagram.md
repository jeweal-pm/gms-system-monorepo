# Sequence diagrams: inventory / load-to-stock (SA revision 1, pending-review)

Main user flow: [diagram/load-to-stock-flow.md](../../../../diagram/load-to-stock-flow.md) (not copied here). Participants: browser (UI), Nginx, `backend-api-inventory` (INV) with schema `inventory` (IDB), `api-master` (MS) with schema `partner` (PDB). No gateway. "authz" = JWT + auth view + license + CSRF (mutations) + grant, see [authorization](authorization.md).

## 1. Picker (P-01) and the mode dialog

```mermaid
sequenceDiagram
  autonumber
  participant UI
  participant NG as Nginx
  participant INV as backend-api-inventory
  participant MS as api-master internal
  participant PDB as partner schema
  UI->>NG: POST /api/inventory/v1/load-to-stock/purchase-lines/search {vendorId?, q, from, to, excludeLineIds, cursor}
  NG->>INV: proxy
  INV->>INV: authz load-to-stock:VIEW, Zod
  alt denied
    INV-->>UI: 401 / 403 / 503
  end
  INV->>MS: POST /internal/v1/inventory/purchase-lines/loadable/search (service token, 5 s)
  MS->>PDB: 1 page query on purchase_line_loadable_idx JOIN purchase (APPROVED, not deleted, vendor, date) LIMIT 51 + 1 capped count
  PDB-->>MS: rows
  MS-->>INV: items + nextCursor + total
  INV-->>UI: 200 items (remaining pcs/weight, amount in company currency)
  alt master unavailable / timeout
    INV-->>UI: 503 MASTER_UNAVAILABLE (dialog error + Retry)
  end
  Note over UI: user ticks lines, OK → mode dialog (None/Split/Merge, client-side),<br/>Create → for each distinct PU line: POST …/photos/from-purchase-line (≤ 3 in parallel)
  UI->>INV: POST /load-to-stock/photos/from-purchase-line {purchaseLineId}
  INV->>MS: GET /internal/v1/inventory/purchase-lines/{id}/photos
  loop each PU photo not yet copied (≤ 5, dedupe on origin_file_id)
    INV->>MS: GET /internal/v1/inventory/files/{fileId}/content (stream)
    INV->>INV: @gms/storage putStream files/load-to-stock/… (sha256 verify) then insert stored_file READY
  end
  INV-->>UI: {ids ≤ 5}
```

## 2. Save with approval ON (Draft) and Send to approve

```mermaid
sequenceDiagram
  autonumber
  participant UI
  participant INV as backend-api-inventory
  participant IDB as inventory schema
  participant MS as api-master internal
  UI->>INV: POST /load-to-stock {docDate, vendorId, mode, rows}
  INV->>INV: authz ADD + CSRF, Zod, mode shape rules
  INV->>MS: POST purchase-lines/batch {ids} + master-data/resolve (stone codes + locations) + document-numbering/resolve markUsed=true
  MS-->>INV: lines (status, vendor, remaining), stone codes + locations (active, code, name), numbering row
  INV->>INV: validate vendor, Σ per source ≤ remaining, location, prices, photos (no lock)
  alt invalid
    INV-->>UI: 422 VALIDATION_ERROR fieldErrors rows.N.*
  end
  INV->>IDB: BEGIN, approval_setting FOR SHARE → ON
  INV->>IDB: advisory lock numbering, max(running_no)+1, insert header DRAFT, sources, rows, row_sources, photos, COMMIT
  INV-->>UI: 201 {id, docNo, version 1, status DRAFT, stockIds [null…]}
  UI->>INV: POST /load-to-stock/{id}/submit {expectedVersion}
  INV->>INV: authz ADD or EDIT + CSRF
  INV->>MS: POST purchase-lines/batch (re-validate, no lock)
  INV->>IDB: BEGIN, setting FOR SHARE (ON), UPDATE … SET status PENDING_APPROVAL WHERE id, version, status IN (DRAFT, REVISION_REQUESTED), deleted_at IS NULL, insert notification approval.pending (+ recipients from auth.permission_holders), COMMIT
  INV-->>UI: 200 PENDING_APPROVAL (locked)
  INV-)UI: SSE to approvers: notification {id, type, documentType}
```

## 3. Save with approval OFF (applied at once) — saga

```mermaid
sequenceDiagram
  autonumber
  participant UI
  participant INV as backend-api-inventory
  participant IDB as inventory schema
  participant MS as api-master internal
  participant PDB as partner schema
  UI->>INV: POST /load-to-stock {rows}
  INV->>MS: batch reads (lines, stone codes, numbering markUsed)
  INV->>IDB: tx0 BEGIN, setting FOR SHARE → OFF, insert header APPROVED provisional, sync_state SYNCING, rows, insert master_sync_op(rev 1, payload, hash, PREPARED), COMMIT
  INV->>MS: PUT /internal/v1/inventory/load-allocations/{loadId} {revision 1, vendorId, lines, newStockIdCount = rows}
  MS->>PDB: BEGIN, lock load_allocation (insert), purchase FOR SHARE (id order), purchase_line FOR UPDATE (id order)
  MS->>PDB: check APPROVED, not deleted, vendor, MANUAL/PO, delta ≤ remaining
  alt exceeds remaining / unavailable
    MS->>PDB: ROLLBACK
    MS-->>INV: 409 LOAD_ALLOCATION_EXCEEDS_REMAINING {lines}
    INV->>IDB: tx1' delete provisional header (cascade), op REFUSED→DONE, COMMIT
    INV-->>UI: 409 LOAD_TO_STOCK_EXCEEDS_REMAINING rows.N {remainingPcs, remainingWeightCt}
  else ok
    MS->>PDB: UPDATE purchase_line loaded_* (one statement), replace load_allocation_line, pg_advisory_xact_lock(stock-id) then issueStockIds(n) with clock read after lock, insert load_stock_id, set applied_revision 1 + result, COMMIT
    MS-->>INV: 200 {revision 1, stockIds, remaining}
    INV->>IDB: tx1 BEGIN, op CONFIRMED, rows.stock_id = ids, insert stock + stock_photo + stock_movement LOAD_IN (set-based), header provisional=false, auto_approved, applied_revision 1, IDLE, op DONE, COMMIT
    INV-->>UI: 201 {status APPROVED, stockIds}
  end
  alt timeout / 5xx / process dies after tx0
    Note over INV,MS: op stays PREPARED. Re-drive (next access, start-up, 60 s sweep) resends rev 1 + same payload.<br/>Master replays the stored result if already applied → tx1 completes. The UI got 503 SYNC_PENDING and refreshes.
  end
```

## 4. Approve in Approve Center (ON) and concurrent approve race

```mermaid
sequenceDiagram
  autonumber
  participant A1 as Approver 1
  participant A2 as Approver 2
  participant INV as backend-api-inventory
  participant IDB as inventory schema
  participant MS as api-master internal
  participant PDB as partner schema
  Note over A1,A2: LS-1 and LS-2 are both PENDING and both load 7 of PU line L (remaining 10)
  par
    A1->>INV: POST /load-to-stock/LS-1/approve {expectedVersion}
  and
    A2->>INV: POST /load-to-stock/LS-2/approve {expectedVersion}
  end
  INV->>IDB: LS-1: UPDATE … SET sync_state SYNCING WHERE status PENDING, version, IDLE, insert op rev 1
  INV->>IDB: LS-2: same (different row → both succeed)
  INV->>MS: PUT allocations/LS-1 {L: 7}
  INV->>MS: PUT allocations/LS-2 {L: 7}
  MS->>PDB: LS-1 tx locks purchase_line L FOR UPDATE first → loaded 0→7, IDs issued, COMMIT
  MS->>PDB: LS-2 tx waits on L, then sees remaining 3 < 7 → ROLLBACK
  MS-->>INV: LS-1 200 {stockIds}
  MS-->>INV: LS-2 409 EXCEEDS_REMAINING {L: remaining 3}
  INV->>IDB: LS-1 tx1: APPROVED, stocks, notification document.approved → creator, IDLE
  INV->>IDB: LS-2 tx1': back to PENDING, IDLE, op REFUSED (nothing changed)
  INV-->>A1: 200 APPROVED
  INV-->>A2: 409 LOAD_TO_STOCK_EXCEEDS_REMAINING "Row n: only 3 pcs left on PU…"
  Note over A1,INV: Same document approved twice at once: the guarded UPDATE lets only one set SYNCING,<br/>the other gets 409 LOAD_TO_STOCK_CHANGED (or BUSY while syncing).
```

## 5. Revise (once) and Reject

```mermaid
sequenceDiagram
  autonumber
  participant AP as Approver
  participant INV as backend-api-inventory
  participant IDB as inventory schema
  participant MK as Maker
  AP->>INV: POST /{id}/request-revision {expectedVersion, note 1–500}
  INV->>IDB: UPDATE … SET status REVISION_REQUESTED, revision_count = revision_count + 1, review_* WHERE status PENDING, version, revision_count = 0, IDLE, + notification document.revision_requested → creator
  alt revision_count already 1
    INV-->>AP: 409 LOAD_TO_STOCK_REVISE_LIMIT (Approve or Reject only)
  end
  INV-->>AP: 200 REVISION_REQUESTED
  MK->>INV: PUT /{id} (edit) then POST /{id}/submit → PENDING_APPROVAL
  AP->>INV: POST /{id}/reject {expectedVersion, reason 1–500}
  INV->>IDB: UPDATE … SET status REJECTED, review_* WHERE status PENDING, version, + notification document.rejected
  INV-->>AP: 200 REJECTED (final, nothing was ever applied)
```

## 6. Edit / Delete of an auto-approved load (OFF) — reversal until used

```mermaid
sequenceDiagram
  autonumber
  participant UI
  participant INV as backend-api-inventory
  participant IDB as inventory schema
  participant MS as api-master internal
  participant PDB as partner schema
  UI->>INV: PUT /load-to-stock/{id} {rows', expectedVersion}  (or POST /{id}/delete)
  INV->>MS: batch reads with excludeAllocationOf = id (own allocation counts as remaining)
  INV->>IDB: tx0 BEGIN, setting FOR SHARE, SELECT stock FOR UPDATE WHERE load_id (id order)
  alt any stock in use (on-hand differs from pcs/weight)
    INV->>IDB: ROLLBACK
    INV-->>UI: 409 LOAD_TO_STOCK_IN_USE
  end
  INV->>IDB: guarded UPDATE header SET sync_state SYNCING, version+1 WHERE version, auto_approved, IDLE, store desired rows in op payload (rev n+1), COMMIT
  INV->>MS: PUT allocations/{id} {revision n+1, lines' (delete: []), newStockIdCount = new rows}
  MS->>PDB: lock, compute delta old→new per line, guard, update loaded_*, replace lines, issue IDs for new rows, COMMIT
  alt refused (e.g. increase beyond remaining)
    INV->>IDB: tx1' restore IDLE (document and stock unchanged)
    INV-->>UI: 409 EXCEEDS_REMAINING
  else ok
    INV->>IDB: tx1 apply rows': kept rows update stock (+LOAD_ADJUST movement), removed rows stock REVERSED (+LOAD_REVERSAL), new rows insert stock (+LOAD_IN), delete: all REVERSED + soft delete header, IDLE, COMMIT
    INV-->>UI: 200 {version, stockIds}
  end
```

The PU side (master): once a line has loaded > 0, `purchase.update` / `purchase.delete` of that Purchase return `PURCHASE_IN_USE` (ADR-0052 D9). A Draft/Pending load naming a line does not block the PU; its later Approve fails with `LOAD_TO_STOCK_LINE_UNAVAILABLE` if the PU changed.

## 7. Approval setting turn-OFF guard (inventory-owned, Q-LS-25)

```mermaid
sequenceDiagram
  autonumber
  participant AD as Admin (Approval Setup)
  participant INV as backend-api-inventory
  participant IDB as inventory schema
  AD->>INV: PUT /approval-settings/load-to-stock {requireApproval false, expectedVersion}
  INV->>IDB: BEGIN, SELECT … FOR UPDATE (setting row)
  INV->>IDB: count PENDING_APPROVAL / REVISION_REQUESTED not deleted
  alt waiting > 0
    INV-->>AD: 409 APPROVAL_SETTING_HAS_WAITING {pending, revision}
  else
    INV->>IDB: UPDATE setting, version+1, COMMIT
    INV-->>AD: 200
  end
  Note over INV,IDB: every create/update/submit reads the row FOR SHARE in its own tx, so it follows the committed value (ADR-0050 D5).
```
