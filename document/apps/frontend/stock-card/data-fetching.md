# Frontend data flow: stock-card

- UI revision: 1
- Related shared/SA API contract: **none yet**. SA is writing the ADR / contract in parallel; the names below are the frontend's **assumed** contract so SA can align or replace them. Handoff: [stock-card-sa](../../../coordination/handoffs/stock-card-sa.md).
- Backend requirement: **requires-sa** (no stock-card read API exists: checked `backend-api-inventory/src/modules/{load-to-stock,sale,stock}` and `backend-api-master`)
- Transport: whichever service SA selects (the adapter is a thin typed module like `frontend/src/features/sale/api.ts`: REST `/api/inventory/v1/...` if placed in `backend-api-inventory`, or master tRPC). The names below are transport-neutral; Bangkok dates are `YYYY-MM-DD`; weights are decimal strings (as the existing reports).

## Assumed operations

| UI action / TODO ID | Operation | Input | Output | Query key / cache | Loading / error / empty | Backend owner |
|---|---|---|---|---|---|---|
| List page rows (FE-SC-004) | `stockCard.list` | `{ q?: string (max SEARCH_MAX), location?: string, from?: date, to?: date, sort?: "stoneCode"\|"location"\|"lot"\|"balancePcs"\|"balanceWeightCt", dir?: "asc"\|"desc", page: number >= 1, pageSize: 10\|25\|50 }` | `{ items: StockCardRow[], total: number, page, pageSize }` | `["stock-card","list", normalisedState]`; `staleTime` 30 s; keep previous data while paging | skeleton / "No stock to show." / banner + Retry | SA-SC-01 |
| Location filter options (FE-SC-004) | reuse `options.locations` (Location master, ADR-0053) | none | `{ id, name }[]` | existing options key | "Loading…" option / "No locations" | existing (master) |
| Detail header (FE-SC-005) | `stockCard.get` | `{ cardKey }` | `StockCardHeader` | `["stock-card","header",cardKey]` | skeleton / "This stock card no longer exists." | SA-SC-01 |
| Detail rows + totals (FE-SC-006) | `stockCard.transactions` | `{ cardKey, q?, from?, to?, sort?: "date"\|"docNo"\|"stockId"\|"account", dir?, page, pageSize }` | `{ items: StockCardTxn[], total, totals: StockCardTotals }` | `["stock-card","txn",cardKey,normalisedState]` | skeleton / "No transactions…" / banner + Retry | SA-SC-01/05 |
| Refresh (FE-SC-004/006) | invalidate `["stock-card"]` prefix | — | — | — | spinner on the refresh icon | — |
| Menu access (FE-SC-010) | existing permission snapshot | grant `stock-card` VIEW / PRINT | — | existing | no-access text | auth catalog (SA-SC-10) |
| Doc link (FE-SC-006) | none (route push built from `docType` + `docId`) | — | — | — | — | — |

### Assumed shapes (field names for SA to align)

```ts
type StockCardRow = {
  cardKey: string;          // opaque, stable id of (stoneCode, location, lot); used in the detail URL
  stoneCode: string;
  stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
  location: string;         // Location master name
  lot: string;              // "" when none
  vendorName: string;       // second line of the Lot cell; "" when none
  balancePcs: number;
  balanceWeightCt: string;  // decimal string
};
type StockCardHeader = Pick<StockCardRow, "cardKey" | "stoneCode" | "location" | "lot" | "vendorName"> & { description: string };
type StockCardTxn = {
  id: string;
  docType: "load-to-stock" | "memo-receive" | "memo-out-return" | "memo-out" | "memo-return" | "sale" | string; // string: future types render with docTypeLabel
  docTypeLabel: string;     // caption under DOC NO
  docId: string;            // uuid for the route
  docNo: string;
  docDate: string;          // YYYY-MM-DD
  stockId: string | null;   // Q-SC-01; null = none
  stockIdExtra: number;     // count beyond the first, 0 normally
  accountName: string;      // vendor or customer
  inPcs: number | null; inWeightCt: string | null;
  outPcs: number | null; outWeightCt: string | null;
  balancePcs: number; balanceWeightCt: string;   // running balance after this line
};
type StockCardTotals = { inPcs: number; inWeightCt: string; outPcs: number; outWeightCt: string; balancePcs: number; balanceWeightCt: string };
```

## Rules

- The adapter validates the response shape defensively (unknown `docType` still renders; a missing route renders the number as text, not a link).
- Filters are the URL state; a filter change resets `page` to 1; the search is debounced 300 ms; stale responses are dropped by the query key (no manual race handling).
- Bounds: `pageSize` is 10 / 25 / 50 only; `q` is length-limited; the list never requests more than one page; the Total row comes from the server for the **whole filtered card**, never from the page rows.
- Errors: `FORBIDDEN` (no grant) shows the no-access text; `NOT_FOUND` on `get` / `transactions` shows the missing-card text; other failures show the banner with Retry ([error-handling](error-handling.md)).
- No mutation exists in this feature, so there is no optimistic update or invalidation beyond Refresh.
- Planned-but-unbuilt behaviour (Excel, Stock Value) has no operation and is not mocked.

## Independent versus requires-sa

| Work | Status |
|---|---|
| Tokens, routes, table components, URL state, formatters, pager/print reuse, view panel | independent after UI approval (tests use typed fixtures; nothing mocked in the shipped page) |
| `api.ts`, live data in both pages, menu leaf rename | **requires-sa**: SA bundle approval and backend completion |
