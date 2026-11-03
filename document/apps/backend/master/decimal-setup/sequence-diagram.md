# Sequence diagrams: master / decimal-setup (SA revision 1, pending-review)

- Source UI revision / SA revision: 2 / 1
- Main flow: [decimal-setup-flow](../../../../diagram/decimal-setup-flow.md)
- Operations: [api-contract](api-contract.md); TODO BE-DEC-001…005, FE-DEC-101…106

## 1. App load: every page gets the setting

```mermaid
sequenceDiagram
  actor U as Signed-in user
  participant SH as App Shell (DecimalSetupProvider)
  participant PG as Any page (quotation, memo, report…)
  participant NG as Next /api/master/trpc → nginx
  participant M as api-master decimalSetup.get
  participant A as auth.current_authorization (ADR-0031)
  participant DB as PostgreSQL partner.decimal_setup

  U->>SH: open any (app) route
  SH->>SH: remove localStorage gms.decimal-setup.v1 (once, try/catch)
  SH->>NG: decimalSetup.get (staleTime 10 min)
  PG->>SH: useNumberFormat() → defaults 2/2 until loaded
  NG->>M: proxy (session cookie → access token)
  M->>A: session current? license ELIGIBLE? (no grant check)
  M->>DB: SELECT … WHERE id = 1
  DB-->>M: row
  M-->>SH: {setup: {weightPlaces, pricePlaces, version, …}}
  SH-->>PG: context update → formatWeight/formatMoney/NumberInput use the places
  alt 401 / 403 LICENSE_REQUIRED / 503 / network
    M-->>SH: error
    SH-->>PG: keep defaults 2/2; no banner (existing session/licence handling applies)
  end
```

## 2. Admin saves a new setting

```mermaid
sequenceDiagram
  actor AD as Admin (decimal-setup:EDIT)
  participant FE as Decimal Setup page
  participant M as api-master decimalSetup.save
  participant A as auth view
  participant DB as partner.decimal_setup
  participant QC as React Query cache (this browser)

  AD->>FE: Edit → choose weight 0–4, price 0–4 → Save
  FE->>M: save({weightPlaces, pricePlaces, expectedVersion}) + CSRF
  M->>A: decimal-setup:EDIT, CSRF verified
  alt not permitted / CSRF
    M-->>FE: 403 PERMISSION_DENIED / CSRF_INVALID
  end
  M->>M: zod strict (ranges) else 400 VALIDATION_ERROR
  M->>DB: BEGIN; UPDATE … SET …, version = version + 1 WHERE id = 1 AND version = expected
  alt 0 rows updated
    DB-->>M: count 0
    M-->>FE: 409 DECIMAL_SETUP_CHANGED → banner "changed by someone else", reload latest
  else updated
    DB-->>M: COMMIT
    M-->>FE: {setup}
    FE->>QC: setQueryData(get, setup) + invalidate
    QC-->>FE: all open tabs re-render with the new places; toast "Decimal setup saved"
  end
  Note over QC: Other users' browsers pick it up on the next load or focus after 10 min stale
```
