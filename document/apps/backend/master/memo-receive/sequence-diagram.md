# Sequence diagrams: memo-receive (SA revision 1, 2026-10-29, approved 2026-10-29)

- Source UI revision / SA revision: memo-receive UI 3 / SA 1
- Main user flow: [memo-receive-flow.md](../../../../diagram/memo-receive-flow.md)
- Operations: [api-contract.md](api-contract.md); TODO FE-MR-007…010, BE-MR-001…006 in [memo-receive.md](../../../../task/todo/memo-receive.md)

Every call goes through nginx `:8080` to `api-master` with the session cookie. Mutations carry the CSRF token. Authorization is read live from the auth view (ADR-0031). Not shown each time: `UNAUTHORIZED` → sign-in, `PERMISSION_DENIED` → no-access message, `AUTHORIZATION_UNAVAILABLE` (503) → "try again", no retry of mutations.

## 1. Save a new Memo Receive (number and Stock IDs issued)

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Frontend (/memo/memo-receive)
  participant NG as nginx :8080
  participant M as api-master (tRPC memoReceive.*)
  participant A as auth view (ADR-0031)
  participant DB as PostgreSQL schema partner

  U->>FE: Save
  FE->>FE: zod validate, drop empty rows, map to MemoReceiveInput (no location, no Stock ID)
  FE->>NG: POST /api/master/trpc/memoReceive.create
  NG->>M: proxy
  M->>A: memo-receive:ADD + CSRF
  alt denied
    M-->>FE: PERMISSION_DENIED / CSRF_INVALID
  end
  M->>M: strict zod, ≤ 200 lines, discount bounds
  M->>DB: BEGIN (WRITE_TX)
  M->>DB: read vendor + address, currency (checks + snapshots)
  alt vendor/address/currency invalid
    M->>DB: ROLLBACK
    M-->>FE: MEMO_RECEIVE_REFERENCE_INVALID (field)
  end
  M->>DB: Document Setup row in effect on doc_date FOR UPDATE (or advisory lock → plain number)
  M->>DB: SELECT max(running_no) → docNo
  M->>DB: INSERT memo_stock_id_counter(year of now, Asia/Bangkok) ON CONFLICT DO UPDATE last_no = last_no + n RETURNING last_no
  alt last_no > 9999
    M->>DB: ROLLBACK
    M-->>FE: MEMO_RECEIVE_STOCK_ID_EXHAUSTED (409)
  end
  M->>M: stockIds = YY + 4 digits per new line · totals (Decimal)
  M->>DB: INSERT memo_receive (status PENDING_APPROVAL), lines, charges
  M->>DB: COMMIT
  M-->>FE: {id, docNo, version, stockIds}
  FE->>FE: replace URL /memo/memo-receive/{id} · invalidate list · table shows Stock IDs
```

## 2. Edit a pending Memo Receive

```mermaid
sequenceDiagram
  participant FE as Frontend
  participant M as api-master
  participant DB as PostgreSQL partner

  FE->>M: memoReceive.update {id, expectedVersion, lines[{id?…}]} (memo-receive:EDIT + CSRF)
  M->>DB: BEGIN · SELECT status, version, line ids FOR UPDATE
  alt missing
    M-->>FE: MEMO_RECEIVE_NOT_FOUND (404)
  else status APPROVED
    M-->>FE: MEMO_RECEIVE_STATUS_INVALID (409) → page reloads read-only
  else version differs
    M-->>FE: MEMO_RECEIVE_CHANGED (409) → banner "reload latest"
  else line id not in this document
    M-->>FE: VALIDATION_ERROR lines.N.id
  end
  M->>DB: counter += count(lines without id) (same lock as §1)
  M->>DB: UPDATE header (version + 1) · DELETE lines · INSERT lines (kept ids keep stock_id) · replace charges
  M->>DB: COMMIT
  M-->>FE: {id, version, stockIds}
```

Delete is the same guard (`DELETE … WHERE id AND version AND status = 'PENDING_APPROVAL'`, 0 rows → re-read for 404/409). Stock IDs of deleted lines are not reused.

## 3. Approve (temporary button on the Memo Receive page)

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Frontend (/memo/memo-receive/{id})
  participant M as api-master
  participant A as auth view
  participant DB as PostgreSQL partner

  U->>FE: Approve (shown for PENDING_APPROVAL, no unsaved changes, memo-receive:APPROVE)
  FE->>U: Confirm "Approve and move N items to Memo Stock?"
  U->>FE: Confirm
  FE->>M: memoReceive.approve {id, expectedVersion}
  M->>A: memo-receive:APPROVE + CSRF
  M->>DB: BEGIN (WRITE_TX)
  M->>DB: UPDATE memo_receive SET status APPROVED, approved_at/by, version + 1 WHERE id, version, status PENDING_APPROVAL
  alt 0 rows
    M->>DB: SELECT status, version
    M-->>FE: NOT_FOUND 404 / STATUS_INVALID 409 (already approved) / CHANGED 409
  end
  M->>DB: SELECT lines + header snapshots
  M->>DB: INSERT memo_stock × lines (location Memo, pending = received, net price after line discount)
  Note over M,DB: UNIQUE memo_receive_line_id / stock_id → a repeat can never duplicate stock
  M->>DB: COMMIT
  M-->>FE: {id, version, status APPROVED, memoStockCount}
  FE->>FE: toast "Approved — N items in Memo Stock" · page read-only · invalidate list/detail
```

## 4. Memo Return › Add Memo Stock dialog (read only in this revision)

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Frontend (Memo Return, future page)
  participant M as api-master (memoStock.list)
  participant DB as PostgreSQL partner

  U->>FE: + Add Memo Stock (vendor already chosen)
  FE->>M: memoStock.list {vendorId, q?, from?, to?, limit 50}
  M->>M: memo-return:VIEW or memo-receive:VIEW
  M->>DB: SELECT … FROM memo_stock WHERE vendor_id AND (pending_pcs > 0 OR pending_weight_ct > 0) [AND q, dates] ORDER BY received_doc_date DESC, stock_id DESC LIMIT 51
  M-->>FE: {items (location "Memo", pending pcs/weight, amount), nextCursor}
  U->>FE: tick rows → OK
  FE->>FE: rows added to the Memo Return lines (saving and pending deduction: later revision)
```

## 5. Add a line photo (SA revision 2, approved 2026-10-29)

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Frontend row panel
  participant NG as nginx :8080 (6 MB)
  participant M as api-master /api/v1/memo-receive/photos
  participant S as "@gms/storage" files/memo-receive-photo
  participant DB as PostgreSQL partner

  U->>FE: drop or choose JPEG/PNG (≤ 5 per line)
  FE->>FE: type and ≤ 5 MB check
  FE->>NG: POST raw bytes + x-gms-csrf
  NG->>M: proxy
  M->>M: memo-receive ADD or EDIT, shared limiter slot (else 503 PARTNER_UNAVAILABLE)
  M->>M: magic bytes match content-type (else 422 MEMO_RECEIVE_PHOTO_INVALID)
  M->>S: put immutable object
  M->>DB: INSERT stored_file (source memo_receive.line-photo, ready)
  M-->>FE: 201 {photoId}
  FE->>NG: GET /api/v1/memo-receive/photos/{id} (memo-receive VIEW) → thumbnail
  U->>FE: Save
  FE->>M: memoReceive.create/update with lines[].photoIds
  M->>DB: check ids are ready memo-receive photos, then replace memo_receive_line_photo rows in the save transaction
```
