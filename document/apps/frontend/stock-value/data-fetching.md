# Frontend data flow: stock-value

- UI revision: 1
- API contract: **SA revision 1 (pending-review, written concurrently 2026-11-23)**: [inventory/stock-value api-contract](../../backend/inventory/stock-value/api-contract.md), [decisions](../../backend/inventory/stock-value/decisions.md), [ADR-0057](../../../adr/0057-stock-value-report-in-inventory-service.md). The shapes below are **adopted from that contract** (ui-spec first wrote an assumed contract; the differences are listed under "Reconciliation"). Handoff: [stock-value-sa](../../../coordination/handoffs/stock-value-sa.md). Precedent: [stock-card data-fetching](../stock-card/data-fetching.md).
- Backend requirement: **requires-sa** work exists and is designed; no code is implemented yet (BE-SV-001…006 in the [TODO](../../../task/todo/stock-value.md)).
- Transport: REST on `backend-api-inventory`, `GET /api/inventory/v1/stock-value/...`, same conventions as Stock Card (cookie access JWT, GMS error envelope `{error:{code,message,requestId,details?}}`, strict query validation, `no-store`, Bangkok dates `YYYY-MM-DD`, numbered paging `pageSize` 10 | 25 | 50, `page` <= 200). The frontend adapter is a thin typed module (`features/stock-value/api.ts`, same pattern as `features/stock-card/api.ts`).
- Decimals are **strings**: `Weight` 3 places, `UnitPrice` 4 places, `Money` 2 places (negative allowed), all in the company currency. The UI formats them (Decimal Setup `pricePlaces` / `weightPlaces`); it **never calculates money**.

## Operations

| UI action / TODO ID | Operation | Input | Output | Query key / cache | Loading / error / empty | Backend owner |
|---|---|---|---|---|---|---|
| Location filter options (FE-SV-006) | `GET /stock-value/options` | none | `{ locations: string[] }` | `["stock-value","options"]`; long `staleTime` | "Loading…" option / "No locations" | BE-SV-004 |
| List rows + Total (FE-SV-006) | `GET /stock-value/cards` | `ValueCardsQuery`: `q?` (<= 100), `location?`, `from?`, `to?`, `sort?` (`stoneCode` `location` `lot` `balancePcs` `balanceWeightCt` `price` `amount` `profitLoss`), `dir?`, `page`, `pageSize` | `ValueCardsPage` | `["stock-value","list", normalisedState]`; `staleTime` 30 s; keep previous data while paging | skeleton / "No stock to show." / banner + Retry | BE-SV-003/004 |
| Detail header (FE-SV-007) | `GET /stock-value/cards/{cardKey}` | `cardKey` (`^SC[0-9a-f]{32}$`) | `ValueHeader` | `["stock-value","header",cardKey]` | skeleton / "This stock card no longer exists." | BE-SV-003/004 |
| Detail rows + Total (FE-SV-008) | `GET /stock-value/cards/{cardKey}/transactions` | Stock Card's `TransactionsQuery`: `q?`, `from?`, `to?`, `sort?` (`date` `docNo` `stockId` `account`), `dir?`, `page`, `pageSize` | `ValueTransactionsPage` | `["stock-value","txn",cardKey,normalisedState]` | skeleton / "No transactions…" / banner + Retry | BE-SV-003/004 |
| Refresh (FE-SV-006) | invalidate `["stock-value"]` prefix | — | — | — | spinner on the refresh icon | — |
| Menu access (FE-SV-010) | existing permission snapshot, leaf `stock-value` VIEW / PRINT | — | — | existing | no-access text | existing leaf (no catalog change, ADR-0057 D11) |
| Doc link (FE-SV-008) | none (route push from `docType` + `docId`, `docHref` of Stock Card) | — | — | — | — | — |

### Shapes (from the SA contract; Stock Card types reused unchanged)

```ts
type Weight = string;      // "1.240"
type UnitPrice = string;   // "12500.0000"
type Money = string;       // "15500.00"
type ValueUnit = "CT" | "PCS";                         // UI "Cts" | "Pcs"
type PriceSource = "PRICE_LIST" | "LAST_SALE" | "NONE";
type PriceSourceLabel = "Price list" | "Last sale";    // null when NONE
type PriceRef = { docType: "sale"; docId: string; docNo: string; docDate: string };   // LAST_SALE only

type Valuation = {
  unit: ValueUnit;
  price: UnitPrice | null;                 // null when NONE
  priceSource: PriceSource;
  priceSourceLabel: PriceSourceLabel | null;
  priceRef: PriceRef | null;
};

// CardRow, CardHeader, Txn, TransactionsQuery are the Stock Card types (features/stock-card/types.ts).
type ValueRow = CardRow & Valuation & { amount: Money | null; profitLoss: Money | null };
type ValueTotals = {                       // whole filtered set, never the page
  balancePcs: number; balanceWeightCt: Weight;
  amount: Money;                           // sum over priced cards
  profitLoss: Money;                       // sum over cards that have one
  pricedCards: number; unpricedCards: number; noCostCards: number;
};
type ValueCardsPage = { items: ValueRow[]; total: number; page: number; pageSize: number; mode: "CURRENT" | "RANGE"; asOf: string | null; totals: ValueTotals };

type ValueHeader = CardHeader & Valuation & { currentAmount: Money | null; currentProfitLoss: Money | null };

type ValueTxn = Txn & { price: UnitPrice | null; priceSource: PriceSource; amount: Money | null; profitLoss: Money | null };
type ValueTransactionsPage = {
  items: ValueTxn[]; total: number; page: number; pageSize: number;
  opening: { pcs: number; weightCt: Weight; amount: Money | null; profitLoss: Money | null };
  totals: { inPcs: number; inWeightCt: Weight; outPcs: number; outWeightCt: Weight; balancePcs: number; balanceWeightCt: Weight; amount: Money | null; profitLoss: Money | null };
  valuation: Valuation;                    // one source of truth for the page: unit, price, source, priceRef (rows repeat price / priceSource)
};
```

Mapping to the screens: list Price cell = `price` + `priceSourceLabel` (tooltip from `priceRef`), Unit = `unit`, Amount = `amount`, Profit/Loss = `profitLoss`; list Total row = `totals`; detail Price cell = `valuation.price` + `valuation.priceSourceLabel` on every row (row `price` repeats it), detail Amount / PROFIT & LOSS = row `amount` / `profitLoss`; detail Total row Price + caption = `valuation`, Amount / P&L = `totals.amount` / `totals.profitLoss`; the header block uses `ValueHeader` as `CardHeader` (the Current-value strip is not drawn, so `currentAmount` is unused by the UI but equals the list Amount at the same date).

## Reconciliation with the first assumed contract

The UI follows the SA contract. Where ui-spec's first assumption differed:

| First assumption (ui-spec) | SA revision 1 | UI consequence |
|---|---|---|
| `priceSource` `MIXED`, `priceUnit` `MIXED`, `pricesUnavailable` flag, `priceUnit` per row | no Mixed source or unit; price is the quantity-weighted average of the Price-list stocks; unit `CT` unless every priced stock is per piece; no partial state; unit sits in `valuation` / on the row | Caption set is "Price list" / "Last sale" / none ("No price"); unit is "Cts" or "Pcs"; the Mixed and partial-state paths are removed from the spec; the adapter still tolerates an unknown enum value |
| Price net of discounts, 2 places | **gross** line unit price, `UnitPrice` 4 places | Price displayed with the Decimal Setup `pricePlaces` (0–4), rounding for display only |
| List sorts `location stoneCode lot profitLoss` | adds `price`, `amount`, `balance*` | UI sorts only the drawn columns (Q-SV-14); adding icons on Price / Amount is a UI-only change if the owner asks |
| Detail sort on `profitLoss` | detail sorts stay `date docNo stockId account` | **The drawn sort icon on the detail PROFIT & LOSS header is not built** until SA adds the key (SA-SV-06 follow-up, Q-SV-14) |
| `totals.profitLoss` nullable, `unpricedCards` only | `Money`, plus `pricedCards`, `noCostCards` | Total row shows "n without price" under Amount and "n without cost" under Profit/Loss when > 0 |
| `priceRef { docNo, docDate }` | adds `docType`, `docId` | tooltip text uses `docNo` and `docDate` |

## Rules

- The adapter validates the response shape defensively: an unknown `docType` still renders (text, no link); an unknown `priceSource` or `unit` renders "—" caption / unit rather than failing; a missing optional field means "—".
- Filters are the URL state (same parser as Stock Card, list sort keys of this report); a filter change resets `page` to 1; search is debounced 300 ms; stale responses are dropped by the query key.
- Bounds: `pageSize` 10 / 25 / 50 only; `q` length-limited; the list never requests more than one page; every Total comes from the server for the **whole filtered set**, never from the page rows.
- A `null` value renders "—".
- Errors: 403 shows the no-access text; 404 (`STOCK_VALUE_NOT_FOUND`) on header / transactions shows the missing-card text; 503 `STOCK_VALUE_BUSY` / `STOCK_VALUE_TIMEOUT` and other failures show the banner with Retry ([error-handling](error-handling.md)).
- The detail page uses `transactions.valuation` for the Price cells so rows, Total and header strip share one snapshot (a price can change between the header and transactions calls).
- No mutation exists, so no optimistic update or invalidation beyond Refresh. Excel has no operation (Q-SV-17) and nothing is mocked.

## Independent versus contract-dependent

| Work | Status |
|---|---|
| Tokens, value cells, `model.ts` pure functions, view prefs, routes, table components, navigation, print view, Customize view | independent (tests use typed fixtures; nothing mocked in the shipped page) |
| `api.ts` against the live service, live data in both pages | needs the backend (BE-SV-001…004); the frontend ships against the SA contract above and is re-checked when the verified contract arrives (BE-SV-006) |
