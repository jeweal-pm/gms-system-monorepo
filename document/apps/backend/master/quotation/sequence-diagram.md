# Sequence diagrams: quotation (SA revision 1, approved 2026-10-26)

## Save a new quotation (number issued)

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Frontend (/pre-sale/quotation)
  participant NG as nginx :8080
  participant M as api-master (tRPC quotation.*)
  participant A as auth view (ADR-0031)
  participant DB as PostgreSQL schema partner

  U->>FE: Save
  FE->>FE: zod validate, drop empty rows, map to QuotationInput
  FE->>NG: POST /api/master/trpc/quotation.create
  NG->>M: proxy
  M->>A: current authorization (quotation:ADD)
  alt not allowed
    M-->>FE: PERMISSION_DENIED
  end
  M->>M: validate input (strict zod, bounds)
  M->>DB: BEGIN
  M->>DB: read customer + addresses, stone codes, photo files (checks + snapshots)
  M->>DB: SELECT numbering row (latest effective_date <= doc_date) FOR UPDATE
  alt no row in effect (owner 2026-10-26)
    M->>DB: pg_advisory_xact_lock; SELECT max(running_no) WHERE numbering_id IS NULL
    M->>M: docNo = plain running number (1, 2, 3 …), numbering_id null
  end
  M->>DB: SELECT max(running_no) FROM quotation WHERE numbering_id
  M->>M: running_no = max + 1 (or start_no); docNo = prefix + separator + running_no; compute totals (Decimal)
  M->>DB: INSERT quotation, lines, charges, line photos
  M->>DB: COMMIT
  M-->>FE: {id, docNo, version}
  FE->>FE: router.replace(/pre-sale/quotation/{id}); invalidate list
```

## Approval flow

```mermaid
sequenceDiagram
  actor S as Sales (EDIT)
  actor P as Approver (APPROVE, Approve page)
  participant M as api-master
  participant DB as partner schema

  S->>M: quotation.submit {id, expectedVersion}
  M->>DB: UPDATE … SET status=PENDING_APPROVAL, version+1 WHERE id AND version AND status IN (DRAFT, REJECTED)
  alt 0 rows
    M-->>S: QUOTATION_CHANGED or QUOTATION_STATUS_INVALID
  end
  Note over P,M: From the separate Approve page (built later), not the Quotation page (Q-QT-02)
  P->>M: quotation.approve / reject {id, expectedVersion, reason?}
  M->>M: authorize quotation:APPROVE (the creator may approve)
  M->>DB: UPDATE status=APPROVED (approved_by/at) or REJECTED (status_reason)
  M-->>P: {status, version}
  Note over S,M: REJECTED can be edited and submitted again; CANCELLED is final.
```

## Photo upload

```mermaid
sequenceDiagram
  participant FE as Frontend (ItemPhotoBox)
  participant NG as nginx
  participant M as api-master REST
  participant ST as @gms/storage (files/quotation-photo/)
  participant DB as partner.stored_files

  FE->>NG: POST /api/v1/quotation/photos (image/jpeg, ≤ 5 MB)
  NG->>M: proxy (client_max_body_size 5m)
  M->>M: authorize quotation:ADD or EDIT; check type + magic bytes + size
  M->>ST: put immutable object
  M->>DB: INSERT stored_files (status ready, source quotation.line-photo)
  M-->>FE: 201 {photoId}
  FE->>FE: line.photoIds += photoId (saved with the quotation)
```
