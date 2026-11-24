# Sequence diagram: inventory / stock-value

- Source UI revision / SA revision: UI 1 / **1** (pending-review)
- Main user flow: [diagram/stock-value-flow.md](../../../../diagram/stock-value-flow.md) (owned by ui-spec, not copied here)
- Related API operations / TODO IDs: [api-contract](api-contract.md); BE-SV-003 / 004 (A, B), BE-SV-001 (C)

There is no gateway. The browser calls Nginx on the same origin; Nginx routes `/api/inventory/` to `backend-api-inventory`; the inventory process reads PostgreSQL schema `inventory` only (stock tables and the Sale tables), with no call to master.

## A. Stock Value list (`CURRENT` and `RANGE`)

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant FE as Frontend (stock-value list)
  participant N as Nginx
  participant I as backend-api-inventory<br/>reports/stock-value
  participant A as auth views (read-only role)
  participant DB as PostgreSQL schema inventory

  U->>FE: open Stock Value, search, pick location / Start / Due / sort
  FE->>N: GET /api/inventory/v1/stock-value/cards?q&location&from&to&sort&dir&page&pageSize
  N->>I: forward (cookie, no body)
  I->>I: verify JWT (JWKS), parse + validate query (Zod strict)
  I->>A: live authorization row + license decision (existing chain)
  alt unauthenticated / license denied / auth unavailable
    I-->>FE: 401 / 403 / 503 (fail closed)
  else no stock-value:VIEW
    I-->>FE: 403 PERMISSION_DENIED
  else invalid query (from > to, page > 200, bad sort)
    I-->>FE: 422 VALIDATION_ERROR field details
  else allowed
    I->>I: shared ReportGuard (Stock Card + Stock Value, max 2 in flight)
    alt guard full for 250 ms
      I-->>FE: 503 STOCK_VALUE_BUSY (Retry-After 2)
    else slot acquired
      I->>DB: BEGIN READ ONLY; SET LOCAL statement_timeout = 5s
      I->>DB: ONE statement: cards g (CURRENT: stock GROUP BY card_key / RANGE: entries to Due) + valuation aggregates<br/>+ LATERAL last-sale probe (sale_line_item_key_idx -> sale PK) only for cards without a Price list<br/>+ totals over all cards + top-N page (ORDER BY enumerated keys) + count
      alt statement timeout
        I-->>FE: 503 STOCK_VALUE_TIMEOUT (narrow the filters)
      else rows
        DB-->>I: <= 50 rows + total + totals
        I-->>FE: 200 { items (unit, price, priceSource, priceRef, amount, profitLoss), total, mode, asOf, totals }
        FE-->>U: table with Price + source caption, Unit, Amount, Profit/Loss, Total row, pager
      end
    end
  end
```

## B. Card detail (header + transactions)

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant FE as Frontend (stock-value detail)
  participant N as Nginx
  participant I as backend-api-inventory
  participant DB as PostgreSQL schema inventory

  U->>FE: click a list row (cardKey from the list)
  par header
    FE->>N: GET /api/inventory/v1/stock-value/cards/{cardKey}
    N->>I: forward
    I->>I: auth chain + stock-value:VIEW, cardKey ^SC[0-9a-f]{32}$
    I->>DB: ONE statement: newest stock attributes, vendor count, current balance, valuation (+ last-sale probe if no Price list)
    alt no stock has this key (or malformed key)
      I-->>FE: 404 STOCK_VALUE_NOT_FOUND
    else found
      I-->>FE: 200 ValueHeader (CardHeader + unit, price, priceSource, priceRef, currentAmount, currentProfitLoss)
    end
  and rows
    FE->>N: GET /api/inventory/v1/stock-value/cards/{cardKey}/transactions?q&from&to&sort&dir&page&pageSize
    N->>I: forward
    I->>I: auth chain + VIEW + validate + shared guard
    I->>DB: BEGIN READ ONLY REPEATABLE READ; SET LOCAL statement_timeout = 5s
    I->>DB: statement A: exists, entry count (<= 5,000), opening, totals, closing balance, total rows,<br/>valuation (exact price, avg cost, unit, source, ref)
    alt card unknown
      I-->>FE: 404 STOCK_VALUE_NOT_FOUND
    else entries > 5,000 or movements > 50,000
      I-->>FE: 422 STOCK_VALUE_TOO_LARGE
    else ok
      I->>DB: statement B: page rows with the running balance; amount / profitLoss computed in SQL from the bound exact price and cost of A
      DB-->>I: <= 50 rows
      I-->>FE: 200 { items, total, opening, totals (closing balance valued), valuation }
    end
  end
  U->>FE: click DOC NO
  FE->>FE: route push to the document page (type -> route map); the document enforces its own VIEW
  U->>FE: click the "Last sale" caption (priceRef)
  FE->>FE: route push to the Sale page; the Sale page enforces sale:VIEW
```

## C. Release and rollback of the schema change

```mermaid
sequenceDiagram
  autonumber
  participant Ops as Release (migrate job)
  participant DB as PostgreSQL schema inventory
  participant I as backend-api-inventory
  participant FE as Frontend

  Ops->>DB: migrate 20261123110000_stock_value (stock.item_key, sale_line.item_key, sale_line_item_key_idx)
  Ops->>I: start the new image (routes /stock-value/* registered)
  FE->>I: GET /api/inventory/v1/stock-value/cards
  I->>DB: valuation statement uses item_key
  I-->>FE: 200
  Note over Ops,FE: Rollback: remove the route registration, then run prisma/rollback/20261123110000_stock_value.down.sql (drops the index and both columns); no business data is touched
```

## Alternate and error paths covered

| Case | Where | Outcome |
|---|---|---|
| Not signed in / session expired / license denied | A, B | 401 / 403, the app shell handles it |
| Auth views down | A, B | 503 fail closed |
| Invalid query | A, B | 422 with field details |
| Guard full (Stock Card + Stock Value share 2 slots) / statement timeout | A, B | 503 `STOCK_VALUE_BUSY` / `STOCK_VALUE_TIMEOUT`, UI shows Retry |
| Card disappeared | B | 404 `STOCK_VALUE_NOT_FOUND`, UI "This stock card no longer exists" |
| Card has no Price list and no usable Last sale of the stone | A, B | 200 with `price = null`, `priceSource = NONE`; the UI shows "-" |
| Card has a Price list | A, B | no Sale probe at all (the lateral join is skipped for that card) |
| Last Sale in a foreign currency / other unit | A, B | converted in SQL (Selling Rate, line quantities); unusable only when the needed quantity is 0 -> `NONE` |
| Master down | A, B | unaffected (no master call) |
| Price changes between header and transactions | B | transactions carry their own `valuation`; the UI refetches the header |
