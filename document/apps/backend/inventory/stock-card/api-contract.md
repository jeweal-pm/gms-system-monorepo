# API contract: inventory / stock-card

- Source UI revision / SA revision: UI 1 / **1** (pending-review)
- Existing shared contract: conventions of [load-to-stock api-contract](../load-to-stock/api-contract.md#conventions) (cookie access JWT, GMS error envelope `{error:{code,message,requestId,details?}}`, strict Zod, decimal strings, `no-store`); the assumed shapes in [frontend data-fetching](../../../frontend/stock-card/data-fetching.md) are adopted with the changes listed in [decisions](decisions.md#answers-to-the-ui-questions-that-need-the-service).
- Consuming frontend TODO IDs: FE-SC-004 (list), FE-SC-005 (header), FE-SC-006 (transactions), FE-SC-009 (Stock ID), FE-SC-010 (menu access) in [task/todo/stock-card.md](../../../../task/todo/stock-card.md)
- Implemented vs proposed: **everything here is proposed** (no stock-card API exists today). Internal calls extend the implemented `/internal/v1/master/stock-holds`.

## Conventions

- Base: `/api/inventory/v1/stock-card` (Nginx keeps the full path). All operations are `GET`, authenticated by the access cookie, no body, no CSRF requirement (no mutation), `Cache-Control: no-store`.
- Dates are `YYYY-MM-DD` (Asia/Bangkok calendar day). Weights are decimal strings with 3 decimals (the scale of `stock.weight_ct`; it becomes 4 only if ADR-0047 is accepted and migrated). Pieces are integers. Unknown query keys are rejected (`strict`).
- Pagination is **numbered**: `page` 1…200, `pageSize` 10 | 25 | 50 (default 25), response `{items, total, page, pageSize}`. `total` is exact for the filtered set (`count(*) OVER ()`); `page × pageSize` can never address beyond 10,000 rows (the UI narrows with filters).
- Search `q`: trimmed, 1…100 characters, contains-match, case-insensitive, `\ % _` escaped.
- Sorting is an enumerated list; the direction `dir` is `asc | desc` (default `asc`); ties break by `cardKey` / document id.

## Operations

| Operation / route | Caller | Input / validation | Output | Permission | Errors | Compatibility |
|---|---|---|---|---|---|---|
| `GET /stock-card/options` | browser | none | `{ locations: string[] }` (distinct `stock.location`, ≤ 500, sorted) | `stock-card:VIEW` | 401, 403 | new |
| `GET /stock-card/cards` | browser | `CardsQuery` | `CardsPage` | `stock-card:VIEW` | 401, 403, 422 `VALIDATION_ERROR`, 503 `STOCK_CARD_BUSY` / `STOCK_CARD_TIMEOUT` | new |
| `GET /stock-card/cards/{cardKey}` | browser | `cardKey` matches `^SC[0-9a-f]{32}$` | `CardHeader` | `stock-card:VIEW` | 401, 403, 404 `STOCK_CARD_NOT_FOUND` | new |
| `GET /stock-card/cards/{cardKey}/transactions` | browser | `cardKey` + `TransactionsQuery` | `TransactionsPage` | `stock-card:VIEW` | 401, 403, 404 `STOCK_CARD_NOT_FOUND`, 422 `VALIDATION_ERROR` / `STOCK_CARD_TOO_LARGE`, 503 `STOCK_CARD_BUSY` / `STOCK_CARD_TIMEOUT` | new |
| `PUT /internal/v1/master/stock-holds/{type}/{id}` | api-master | existing body + optional `docDate`, `party` | existing result | token `MASTER_INVENTORY_SERVICE_TOKEN` | existing + 422 on a bad field | **additive** (absent fields = unchanged) |
| `PATCH /internal/v1/master/stock-holds/{type}/{id}/metadata` | api-master | `HoldMetadata` | `{ updated: true }` | same token | 401, 404 `NOT_FOUND` (no hold document), 422 | new |

## Types (TypeScript-like)

```ts
type Weight = string;                       // "1.240"
type StoneAttrs = { stoneCode: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string };

type CardsQuery = {
  q?: string;                               // ≤ 100: stone code, stone, lot, vendor name, visible Stock ID
  location?: string;                        // ≤ 40, exact, case-insensitive
  from?: string; to?: string;               // Start / Due; from <= to (else 422 field "to", code "before_from")
  sort?: "stoneCode" | "location" | "lot" | "balancePcs" | "balanceWeightCt";   // default stoneCode
  dir?: "asc" | "desc";
  page?: number; pageSize?: 10 | 25 | 50;
};

type CardRow = StoneAttrs & {
  cardKey: string;                          // opaque, "SC" + 32 hex; stable until an applied edit changes stone/location/lot
  location: string;
  lot: string;                              // "" when none
  vendorName: string;                       // vendor of the newest stock of the card
  vendorCount: number;                      // distinct vendors in the card (UI shows "+n" when > 1)
  balancePcs: number;
  balanceWeightCt: Weight;
};
type CardsPage = {
  items: CardRow[]; total: number; page: number; pageSize: number;
  mode: "CURRENT" | "RANGE";                // RANGE when from or to is set
  asOf: string | null;                      // Due date used for the balance; null = all documents
};

type CardHeader = StoneAttrs & {
  cardKey: string; location: string; lot: string; vendorName: string; vendorCount: number;
  currentBalancePcs: number; currentBalanceWeightCt: Weight;   // all documents, ACTIVE stocks
};

type TransactionsQuery = {
  q?: string;                               // ≤ 100: document no, account name, visible Stock ID
  from?: string; to?: string;
  sort?: "date" | "docNo" | "stockId" | "account";               // default date
  dir?: "asc" | "desc";                     // default asc
  page?: number; pageSize?: 10 | 25 | 50;
};

type Txn = {
  id: string;                               // `${docType}:${docId}`, stable React key
  docType: string;                          // "load-to-stock" | "memo-out" | "memo-out-return" | later "sale" … (open set)
  docTypeLabel: string;                     // "Load to Stock" | "Memo Out" | "Memo Out Return" | "Sale"
  docId: string;                            // uuid for the document route
  docNo: string;                            // "" only for a hold document applied before its number was stored
  docDate: string;                          // YYYY-MM-DD
  stockId: string | null;                   // null on Memo Out and on any hidden type
  stockIdExtra: number;                     // visible Stock IDs of the document beyond the first (0 normally)
  accountId: string | null;                 // vendor / customer id when known
  accountName: string;                      // "" when unknown
  inPcs: number | null; inWeightCt: Weight | null;
  outPcs: number | null; outWeightCt: Weight | null;
  balancePcs: number; balanceWeightCt: Weight;   // running balance after this document, chronological
};
type TransactionsPage = {
  items: Txn[]; total: number; page: number; pageSize: number;
  opening: { pcs: number; weightCt: Weight };    // balance before `from` (0 / "0.000" when `from` is absent)
  totals: {                                      // see the rules below
    inPcs: number; inWeightCt: Weight; outPcs: number; outWeightCt: Weight;
    balancePcs: number; balanceWeightCt: Weight;
  };
};

type HoldMetadata = {                       // both optional; null clears, absent leaves unchanged
  docDate?: string | null;                  // YYYY-MM-DD
  party?: { id: string; name: string } | null;   // uuid, 1…200 chars
};
```

Example `TransactionsPage` (values from the design, own stock, one card):

```json
{ "items": [
  { "id": "load-to-stock:0192…", "docType": "load-to-stock", "docTypeLabel": "Load to Stock", "docId": "0192…", "docNo": "LS2609014", "docDate": "2026-09-04",
    "stockId": "260214", "stockIdExtra": 0, "accountId": "0191…", "accountName": "Bangkok Gem Supply Co., Ltd.",
    "inPcs": 4, "inWeightCt": "1.240", "outPcs": null, "outWeightCt": null, "balancePcs": 4, "balanceWeightCt": "1.240" },
  { "id": "memo-out:0192…", "docType": "memo-out", "docTypeLabel": "Memo Out", "docId": "0192…", "docNo": "MO2609021", "docDate": "2026-09-18",
    "stockId": null, "stockIdExtra": 0, "accountId": "0191…", "accountName": "Khun Nida Jewelry",
    "inPcs": null, "inWeightCt": null, "outPcs": 2, "outWeightCt": "0.620", "balancePcs": 2, "balanceWeightCt": "0.620" } ],
  "total": 2, "page": 1, "pageSize": 25, "opening": { "pcs": 0, "weightCt": "0.000" },
  "totals": { "inPcs": 4, "inWeightCt": "1.240", "outPcs": 2, "outWeightCt": "0.620", "balancePcs": 2, "balanceWeightCt": "0.620" } }
```

## Rules

- **IN / OUT:** per document, per dimension. Net pieces > 0 → `inPcs`, net < 0 → `outPcs`; weight likewise. The other side is `null`. A document with a net of zero in both dimensions is not returned.
- **Balance:** `balance*` is the cumulative net of every entry of the card up to and including that row in (docDate, apply time, docId) order, **independent of `q`, `from`, `sort` and the page**. `opening` is the cumulative net of the entries dated before `from`.
- **Totals:** `inPcs`, `inWeightCt`, `outPcs`, `outWeightCt` sum the rows that match `from`, `to` and `q` (the whole filtered set, not the page). `balancePcs` / `balanceWeightCt` are the closing balance at `to` (all entries dated ≤ `to`; every entry when `to` is absent). With `q` set the identity `opening + IN − OUT = balance` need not hold; the UI shows the closing balance.
- **Cards list:** `CURRENT` (neither `from` nor `to`): cards whose current balance is not zero. `RANGE`: balance at `to` (all dates when only `from` is set), cards with at least one entry dated in [`from`, `to`] or a non-zero balance. A card with a zero balance and no entry in the range is hidden.
- **Search:** list `q` matches the card if any of its stocks matches stone code, stone, lot, vendor name or Stock ID; the balance always covers the whole card. Detail `q` matches document number, account name or the Stock ID of a row whose Stock ID is visible.
- **Stock ID visibility** is decided by the server (D4): `null` for `memo-out` (and `reserve`, `quotation`, `purchase`, `memo-return` when they ever appear). Search never confirms a hidden ID.
- **Ordering of the list:** `stoneCode` sorts by (stone code or attribute text, location, lot, cardKey); `location` by (location, stone code, lot); `lot` by (lot, stone code, location); `balance*` by (balance, stone code, location, lot); `dir` flips the first key.
- **Idempotency / concurrency:** reads only; consistent snapshot per call (`REPEATABLE READ READ ONLY` for the detail). A card key can disappear (all its stocks reversed) → 404 on the next call.
- **Unknown `docType`:** the registry is the only place that maps a kind to a label; a future module adds its row and the contract does not change (open string set).

## Internal call details (master → inventory)

- `PUT …/stock-holds/{type}/{id}`: body is the existing `{revision, documentNo, holds[]}` plus optional `docDate` and `party`. When present they are stored with the hold document in the same transaction; they are **not** in the request hash, so a replay of the same revision stays a replay (the stock result is replayed unchanged; the metadata, if sent, is still applied). `type` ∈ `reserve | memo-out | memo-out-return`.
- `PATCH …/metadata`: for an applied document whose date or customer changed without a hold change, and for the backfill. Idempotent (same body twice → same state). Needs an existing `stock_hold_document`; otherwise `404` (the document holds no own stock, so there is nothing to show).
- Both use the existing service-token check; the token, network and 5 s client timeout are unchanged.

Sequence: [sequence-diagram](sequence-diagram.md). Errors: [error-handling](error-handling.md). Permissions: [authorization](authorization.md).
