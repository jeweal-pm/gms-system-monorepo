# API contract: inventory / stock-value

- Source UI revision / SA revision: UI 1 / **1** (pending-review)
- Existing shared contract: [stock-card api-contract](../stock-card/api-contract.md) (conventions, `CardsQuery`, `CardRow`, `CardHeader`, `TransactionsQuery`, `Txn`, rules for IN/OUT, balance, search, ordering) and the [load-to-stock conventions](../load-to-stock/api-contract.md#conventions) (cookie access JWT, GMS error envelope, strict Zod, decimal strings, `no-store`). **Everything not listed here is identical to Stock Card.** The frontend's shapes ([data-fetching](../../../frontend/stock-value/data-fetching.md)) were reconciled to this contract; the one addition after that reconciliation is listed [below](#additions-after-the-ui-reconciliation).
- Consuming frontend TODO IDs: FE-SV-005 (client), FE-SV-006 (list), FE-SV-007 (header), FE-SV-008 (transactions), FE-SV-010 (menu access) in [task/todo/stock-value.md](../../../../task/todo/stock-value.md)
- Implemented vs proposed: **everything here is proposed** (no stock-value API exists today).

## Conventions (delta to Stock Card)

- Base: `/api/inventory/v1/stock-value`. All operations `GET`, access cookie, no body, no CSRF requirement, `Cache-Control: no-store`.
- Permission `stock-value:VIEW` on every route (`stock-card:VIEW` does not grant it).
- Same `cardKey` (`^SC[0-9a-f]{32}$`, equal to Stock Card's for the same card), the same dates (`YYYY-MM-DD`, Asia/Bangkok), numbered paging (`page` 1...200, `pageSize` 10 | 25 | 50, default 25, `{items, total, page, pageSize}`), search `q` <= 100, strict query, `from <= to`.
- **Decimals (strings, never JSON numbers):** `Weight` 3 places (`"1.240"`), `UnitPrice` 4 places (`"12500.0000"`), `Money` 2 places (`"15500.00"`, negative allowed). All values are in the company currency (no currency field).
- Rounding: half away from zero; `amount` / `profitLoss` are computed from the unrounded price and cost, not from the displayed `price`.

## Operations

| Operation / route | Caller | Input / validation | Output | Permission | Errors | Compatibility |
|---|---|---|---|---|---|---|
| `GET /stock-value/options` | browser | none | `{ locations: string[] }` (same as Stock Card) | `stock-value:VIEW` | 401, 403 | new |
| `GET /stock-value/cards` | browser | `ValueCardsQuery` | `ValueCardsPage` | `stock-value:VIEW` | 401, 403, 422 `VALIDATION_ERROR`, 503 `STOCK_VALUE_BUSY` / `STOCK_VALUE_TIMEOUT` | new |
| `GET /stock-value/cards/{cardKey}` | browser | `cardKey` | `ValueHeader` | `stock-value:VIEW` | 401, 403, 404 `STOCK_VALUE_NOT_FOUND`, 503 busy / timeout | new |
| `GET /stock-value/cards/{cardKey}/transactions` | browser | `cardKey` + `ValueTransactionsQuery` | `ValueTransactionsPage` | `stock-value:VIEW` | 401, 403, 404 `STOCK_VALUE_NOT_FOUND`, 422 `VALIDATION_ERROR` / `STOCK_VALUE_TOO_LARGE`, 503 busy / timeout | new |

No internal (master -> inventory) call, no mutation, no new internal route.

## Types (TypeScript-like)

```ts
// Reused from Stock Card unchanged: Weight, StoneAttrs, CardRow, CardHeader, Txn, IN/OUT fields, TransactionsQuery.
type Money = string;                         // "15500.00"
type UnitPrice = string;                     // "12500.0000"
type ValueUnit = "CT" | "PCS";               // UI caption "Cts" | "Pcs"
type PriceSource = "PRICE_LIST" | "LAST_SALE" | "NONE";

type Valuation = {                           // the card's current value basis
  unit: ValueUnit;                           // CT: amount by weight (cts); PCS: by pieces
  price: UnitPrice | null;                   // null when priceSource = "NONE"
  priceSource: PriceSource;
  priceSourceLabel: "Price list" | "Last sale" | null;    // null when NONE
  priceRef: { docType: "sale"; docId: string; docNo: string; docDate: string } | null;   // LAST_SALE only
};

type ValueCardsQuery = Omit<CardsQuery, "sort"> & {
  sort?: "stoneCode" | "location" | "lot" | "balancePcs" | "balanceWeightCt" | "price" | "amount" | "profitLoss";  // default stoneCode
};

type ValueRow = CardRow & Valuation & {      // CardRow: cardKey, stone attrs, location, lot, vendorName, vendorCount, balancePcs, balanceWeightCt
  amount: Money | null;                      // balance (at Due in RANGE mode) x price; null when NONE
  profitLoss: Money | null;                  // amount - cost of that balance; null without price or without cost
};

type ValueTotals = {                         // over the WHOLE filtered set, not the page
  balancePcs: number; balanceWeightCt: Weight;
  amount: Money;                             // sum of the rows' rounded amounts over priced cards ("0.00" when none)
  profitLoss: Money;                         // sum over cards that have a profit/loss ("0.00" when none)
  pricedCards: number;                       // cards with an amount
  unpricedCards: number;                     // cards with priceSource = NONE (excluded from amount)
  noCostCards: number;                       // priced cards without a cost (excluded from profitLoss)
};

type ValueCardsPage = {
  items: ValueRow[]; total: number; page: number; pageSize: number;
  mode: "CURRENT" | "RANGE"; asOf: string | null;
  totals: ValueTotals;
};

type ValueHeader = CardHeader & Valuation & {   // CardHeader: stone attrs, location, lot, vendor, currentBalancePcs / currentBalanceWeightCt
  currentAmount: Money | null;               // current balance (all documents) x price
  currentProfitLoss: Money | null;
};

type ValueTransactionsQuery = Omit<TransactionsQuery, "sort"> & {
  sort?: "date" | "docNo" | "stockId" | "account" | "profitLoss";   // default date; profitLoss nulls last in both directions
};

type ValueTxn = Txn & {                      // Txn: id, docType, docTypeLabel, docId, docNo, docDate, stockId, stockIdExtra, accountId, accountName, in/out, balancePcs, balanceWeightCt
  price: UnitPrice | null;                   // the card's current price (same on every row)
  priceSource: PriceSource;
  amount: Money | null;                      // running balance after this row x price
  profitLoss: Money | null;                  // amount - cost of that running balance
};

type ValueTransactionsPage = {
  items: ValueTxn[]; total: number; page: number; pageSize: number;
  opening: { pcs: number; weightCt: Weight; amount: Money | null; profitLoss: Money | null };   // balance before `from`, valued
  totals: {                                  // Stock Card totals + the closing balance valued
    inPcs: number; inWeightCt: Weight; outPcs: number; outWeightCt: Weight;
    balancePcs: number; balanceWeightCt: Weight;
    amount: Money | null;                    // closing balance (at `to`, all entries) x price
    profitLoss: Money | null;
  };
  valuation: Valuation;                      // one source of truth for the page (same snapshot as the rows)
};
```

Example `ValueCardsPage` (own stock; one card from the Price list, one from Last sale, one without any price):

```json
{ "items": [
  { "cardKey": "SC3f2a…", "stoneCode": "SAP-OV-6x4", "stone": "Sapphire", "shape": "Oval", "size": "6x4", "color": "Blue", "clarity": "VS", "cutting": "Brilliant", "quality": "AA",
    "location": "Vault A", "lot": "L-2609", "vendorName": "Bangkok Gem Supply Co., Ltd.", "vendorCount": 1,
    "balancePcs": 2, "balanceWeightCt": "1.240",
    "unit": "CT", "price": "12500.0000", "priceSource": "PRICE_LIST", "priceSourceLabel": "Price list", "priceRef": null,
    "amount": "15500.00", "profitLoss": "5580.00" },
  { "cardKey": "SC9b10…", "stoneCode": "RUB-RD-5", "stone": "Ruby", "shape": "Round", "size": "5", "color": "Red", "clarity": "SI", "cutting": "Brilliant", "quality": "A",
    "location": "Vault A", "lot": "", "vendorName": "Siam Stones", "vendorCount": 2,
    "balancePcs": 10, "balanceWeightCt": "4.500",
    "unit": "CT", "price": "9800.0000", "priceSource": "LAST_SALE", "priceSourceLabel": "Last sale",
    "priceRef": { "docType": "sale", "docId": "0192…", "docNo": "SL2611003", "docDate": "2026-11-12" },
    "amount": "44100.00", "profitLoss": null },
  { "cardKey": "SCc7e4…", "stoneCode": "SPN-1", "stone": "Spinel", "shape": "", "size": "", "color": "", "clarity": "", "cutting": "", "quality": "",
    "location": "Vault B", "lot": "X1", "vendorName": "Siam Stones", "vendorCount": 1, "balancePcs": 3, "balanceWeightCt": "0.900",
    "unit": "CT", "price": null, "priceSource": "NONE", "priceSourceLabel": null, "priceRef": null, "amount": null, "profitLoss": null } ],
  "total": 3, "page": 1, "pageSize": 25, "mode": "CURRENT", "asOf": null,
  "totals": { "balancePcs": 15, "balanceWeightCt": "6.640", "amount": "59600.00", "profitLoss": "5580.00", "pricedCards": 2, "unpricedCards": 1, "noCostCards": 1 } }
```

(The second card has no cost, so no profit/loss; the third has no price.)

## Rules

- **Cards, balance, modes, search, location filter, zero-balance rule, key and 404:** exactly Stock Card ([rules](../stock-card/api-contract.md#rules)). `balancePcs` / `balanceWeightCt` of a Stock Value row equal Stock Card's for the same query. List `q` matches stone code, stone, lot, vendor name and Stock ID (Stock Card's helper); detail `q` matches document number, account name and visible Stock IDs.
- **Price (per card, current):** `PRICE_LIST` = quantity-weighted average of the Stock IDs' Sale Price (`sale_price > 0`); else `LAST_SALE` = latest approved, non-deleted Sale line of the same stone; else `NONE`. Rules and worked examples: [decisions](decisions.md#price-per-lot-card-d3) and [architecture](architecture.md#valuation-rules). A `0.00` Sale Price counts as not set.
- **Unit:** `CT` unless every Stock ID holding quantity is priced per piece (then `PCS`); `amount = round(price x (CT ? balance weight : balance pieces), 2)`.
- **Profit/Loss:** `amount - round(avgCost x basis, 2)` with the card's weighted-average purchase cost; `null` without price or cost. The cost itself is never returned.
- **`priceRef`:** present only for `LAST_SALE`; `docNo` / `docDate` are display text, `docId` opens the Sale (the Sale page enforces its own `sale:VIEW`). No customer name is returned.
- **Totals (list):** over the whole filtered set. `amount` = sum of the rows' `amount` (each already rounded); `profitLoss` = sum of the rows' `profitLoss`; cards with `null` are skipped and counted (`unpricedCards`, `noCostCards`). `pricedCards + unpricedCards = total`. The balance totals include unpriced cards.
- **Totals (detail):** Stock Card's IN / OUT sums over the rows matching `from`, `to`, `q`; `balance*` is the closing balance at `to`; `amount` / `profitLoss` value that closing balance, independent of `q` and the page, so with no `q` the Total amount equals the last chronological row's `amount`.
- **Opening:** `opening.pcs` / `weightCt` as Stock Card; `opening.amount` / `profitLoss` value that balance with the same price and cost (`"0.00"` when `from` is absent and the card is priced, `null` when `priceSource = NONE`).
- **Rows:** `amount` / `profitLoss` of a row value that row's running balance (independent of `q`, `from`, `sort`, page) at the card's current price and cost. `price` / `priceSource` repeat the card's value (the same snapshot as `valuation`).
- **Sort (list):** `price`, `amount`, `profitLoss` sort by the numeric value, **nulls last in both directions**, ties by (stone code, location, lot, cardKey); the other keys as Stock Card. `dir` flips the first key.
- **Sort (detail):** Stock Card's keys plus `profitLoss` (nulls last in both directions; ties by the chronological order). Each row keeps its true balance and value.
- **Idempotency / concurrency:** reads only; consistent snapshot per detail call (`REPEATABLE READ`). A price can change between the header and the transactions call; the transactions page carries its own `valuation` for that reason.
- **Unknown `docType`:** unchanged (open string; the Stock Card registry is the only place that maps a kind).

## Additions after the UI reconciliation

The UI documents (data-fetching, handoff reconciliation table) were reconciled to this contract on 2026-11-23. Two points differ from what they record:

| UI document says | Contract |
|---|---|
| Detail sort stays `date docNo stockId account`; the PROFIT & LOSS sort icon is not built until SA adds the key | **Added**: the detail accepts `sort=profitLoss` (nulls last both directions). The drawn icon can be built (FE-SV-008) |
| `priceRef` adds `docType`, `docId` | as stated: `{ docType: "sale", docId, docNo, docDate }` |
| `totals.profitLoss` is `Money` | as stated: `"0.00"` when no card has a value (`noCostCards` / `unpricedCards` say why) |

The first draft of this contract also allowed a "Mixed" source and unit; they are **not** part of revision 1 ([ADR-0057](../../../../adr/0057-stock-value-report-in-inventory-service.md) alternatives, SQ-SV-03). A frontend that tolerates unknown enum values needs no change.

Sequence: [sequence-diagram](sequence-diagram.md). Errors: [error-handling](error-handling.md). Permissions: [authorization](authorization.md).
