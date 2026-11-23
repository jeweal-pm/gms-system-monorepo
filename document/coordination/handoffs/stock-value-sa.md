# Handoff: stock-value -> SA (service design request)

- Feature ID / UI revision: `stock-value` / UI revision 1 (**approved by direct owner instruction**, evidence in the [TODO](../../task/todo/stock-value.md))
- Status (2026-11-23): written by ui-spec; **answered the same day by the concurrent SA revision 1 bundle** ([ADR-0057](../../adr/0057-stock-value-report-in-inventory-service.md), [inventory/stock-value](../../apps/backend/inventory/stock-value/decisions.md), SQ-SV-01…17); reconciliation below. The owner's instruction authorizes the chain ui-spec -> SA (ADR) -> frontend UI and backend API without an extra approval step. This file lists what the UI needs so SA can write the bundle quickly; it does not replace SA's design review of the contract.
- SA revision / source UI revision: none yet / 1
- From role/scope: ui-spec (documents only)
- To role/scope / parent integration owner: `sa`; the parent serializes shared files (auth permission catalog, `frontend/src/features/home/navigation.ts`, `document/adr/tech-stack.md`, task pointers, Compose / nginx if any)
- Exact TODO IDs and source documents: FE-SV-005/006/007/008/010 and BE-SV-001…006 (requires-sa) in [todo/stock-value.md](../../task/todo/stock-value.md); [ui-spec](../../apps/frontend/stock-value/ui-spec.md), [open-questions](../../apps/frontend/stock-value/open-questions.md) (Q-SV-01…28), [data-fetching](../../apps/frontend/stock-value/data-fetching.md), [error-handling](../../apps/frontend/stock-value/error-handling.md), flow [stock-value-flow](../../diagram/stock-value-flow.md)
- Approval status, approved revision, and owner evidence: UI revision 1 approved by the instruction quoted in the TODO. The SA bundle (revision 1, pending-review) exists; the same instruction authorizes it, so the parent records its SA revision and approval fields (no second review handoff for the same bundle).
- Required contract / diagrams / ADRs: SA bundle under `document/apps/backend/inventory/stock-value/` (the Stock Card bundle is the precedent), an ADR (next free number after ADR-0056), sequence and database diagrams only if a table, index or read model is added, BE-SV-* items refined in `document/task/todo/stock-value.md`.
- Dependency ledger entries and installation status: none proposed by the UI (no Excel library, Q-SV-17).
- Allowed code/document paths: SA writes `document/apps/backend/**`, `document/adr/**`, `document/diagram/**`, the BE section of the central TODO; **no application code**.
- Integration-owned changes: `backend-api-auth/src/permission/catalog.ts` and `auth-trpc.router.ts` only if the leaf `stock-value` is narrowed (BE-SV-004; the leaf exists today with all nine actions); `frontend/src/features/home/navigation.ts`. **Do not touch `backend-api-auth/src/trpc/auth-trpc.csrf.ts` or its test** (unrelated uncommitted changes).
- Infra service bundle / DevOps: none expected from the UI (no new container). If SA adds an index (for example on the Sale lines for the Last-sale lookup) or a read model, state it for infra review.
- Resource budget / capacity impact (4 GB RAM / 2 vCPU total): reads only; at most 50 rows per call; Stock Card limits apply (<= 2 report queries in flight, 5 s timeout, `no-store`). The price lookups must be bounded and indexed, with no unbounded scan of Sale lines or `stock_movement` per request.
- Expected output and acceptance criteria: one SA bundle answering SA-SV-01…10 below, adopting or replacing the assumed shapes of [data-fetching](../../apps/frontend/stock-value/data-fetching.md), so the frontend can integrate without further design rounds.
- Verification completed / not run: none (design request).
- Blocking item, if any: none. Owner answers to Q-SV-03 (Last sale), Q-SV-07 (Profit/Loss) and Q-SV-01/04 (multi-stock price, units) change SA scope; SA proceeded with the applied defaults.
- Resume action and destination: SA bundle -> backend (BE-SV-001…006) -> frontend integrates FE-SV-005/006/007/008 against the verified contract. Frontend UI work that does not need the contract (FE-SV-001…004, 009…014) starts in parallel.
- Corrective work ID / root-cause ledger link: not applicable (new work).
- Existing pass limit / allocated passes / active pass: not applicable.
- Changed evidence, contract, or prerequisite justifying this handoff: new feature; the Stock Card API returns balances only (no price, amount or cost).
- Concrete receiving-role output / next fact needed: delivered (sibling module `reports/stock-value`, Last sale from `sale_line`). Open for SA: one follow-up key, `profitLoss`, for the detail transaction sorts if the owner wants the drawn sort icon (Q-SV-14).
- Stop reason / terminal outcome / explicit extension evidence: none.

## Facts found by ui-spec (C)

- `inventory.stock` (one row per Stock ID) already has the inputs: `sale_price` (Load to Stock "Sale Price", required, >= 0, THB per `price_unit` PER_CT / PER_PCS), `stock_price`, `unit_cost_base`, `cost_amount_base` (base currency), `price_unit`, `on_hand_*`, `reserved_*`, `memo_out_*`, `lot`, `location`, `card_key` (Stock Card, ADR-0056 D3), `vendor_name_snapshot`.
- The Stock Card module (`backend-api-inventory/src/modules/stock/card.ts`, `reports/stock-card`) already computes cards, the running balance and totals; Stock Value needs the same cards plus value fields. The architecture note of Stock Card says later reports reuse the stock component.
- Sale (ADR-0054) lives in `inventory.sale`; it does not move own stock yet (D11) but its approved lines carry unit price, price unit, currency and exchange rate. The owner's "Invoice" is read as Sale (F-02).
- Auth catalog: `stock-value` is a leaf with all nine actions (a placeholder created by Stock Card BE-SC-007); `stock-card` has VIEW / PRINT / EXCEL.
- The frontend never computes money; every amount and total must come from the server (conventions).

## SA must design

| ID | Topic | UI expectation / applied default |
|---|---|---|
| SA-SV-01 | **Service placement + ADR; one read API** | Same service as Stock Card (`backend-api-inventory`). Operations the UI assumes: options, cards (list + totals), card header, transactions (+ totals). Decide: extend the Stock Card endpoints with value fields (and a `value=1`-style variant) or a sibling module `reports/stock-value` reusing `modules/stock/card.ts`. Authorization `stock-value:VIEW` either way. Same `cardKey`. |
| SA-SV-02 | **Price resolution per Stock ID** (Q-SV-01/02/04) | Price list = `sale_price` > 0, else Last sale, else none. Card price = weighted average (`amount ÷ balance weight`); caption `PRICE_LIST` / `LAST_SALE` / `MIXED` / `NONE`; per-piece stocks valued `pcs x price`; mixed units give `priceUnit: "MIXED"` and `price: null`. State which balance buckets are valued (Stock Card BALANCE = on hand + reserved, ADR-0056). |
| SA-SV-03 | **Last-sale lookup** (Q-SV-03) | Latest approved, not deleted Sale line of the same stone code (and lot when the line carries one), by document date then approval time; net unit price per price unit, converted to THB with that Sale's exchange rate; returns `priceRef { docNo, docDate }`. Bounded and indexed; one set-based lookup per page, never per row. |
| SA-SV-04 | **List query + totals** (Q-SV-05/06/11/14/24) | Balance as at Due (empty = today, Bangkok) at **current** prices; sort keys `location`, `stoneCode`, `lot`, `profitLoss` with "—" rows last in both directions; `totals` for the whole filtered set (`balancePcs`, `balanceWeightCt`, `amount` = sum of rounded card amounts, `profitLoss`, `unpricedCards`); hide zero-balance cards as Stock Card; list search matches stone code, stone, lot, vendor. |
| SA-SV-05 | **Profit/Loss definition** (Q-SV-07) | `amount − remaining quantity x weighted-average unit cost` (own stock `unit_cost_base` per price unit); `null` when Amount is null or no cost; the owner confirms or replaces the formula. Document it in the contract. |
| SA-SV-06 | **Transactions with value** (Q-SV-09/10) | Stock Card transactions plus, per row, `price`, `priceUnit`, `priceSource`, `priceRef`, `amount` (running BALANCE x current price) and `profitLoss`; `totals` add the closing values; sort key `profitLoss` added. |
| SA-SV-07 | **Capacity and indexes** | Within Stock Card's limits; measure with `EXPLAIN` on realistic volumes; propose an index only with a stated write cost; no new container. |
| SA-SV-08 | **Errors and the partial state** (Q-SV-27) | Stock Card codes (401, 403, 404 `STOCK_CARD_NOT_FOUND` or a Stock Value equivalent, 422, 503 busy / timeout); a failing price lookup with readable balances returns 200 with `pricesUnavailable: true` and null value fields. |
| SA-SV-09 | **Authorization** (Q-SV-19) | `stock-value:VIEW` for every read; `PRINT` is a UI gate; decide whether to narrow the leaf to VIEW / PRINT / EXCEL (BE-SV-004, optional, grant migration not needed because the actions only shrink). `PRICE` action unused unless the owner says otherwise. |
| SA-SV-10 | **Excel (later)** (Q-SV-17) | Out of revision 1; note the shape a server-side export would take so a revision 2 can be designed without changing the read contract. |

## Reconciliation with SA revision 1 (2026-11-23)

The UI adopts the SA contract ([data-fetching](../../apps/frontend/stock-value/data-fetching.md) was rewritten to its shapes). Where the first UI assumption differed:

| UI assumption | SA revision 1 | Result in the UI documents |
|---|---|---|
| SA-SV-01 placement: extend Stock Card or a sibling module | sibling module `reports/stock-value`, shared `ReportGuard`, same `cardKey` | adopted |
| SA-SV-02 / Q-SV-01: caption "Mixed" for a multi-source card | one quantity-weighted Price-list average; no Mixed | Mixed removed from the UI spec |
| SA-SV-02 / Q-SV-04: Unit "Mixed", per-piece valuation per stock | unit `CT` unless every priced stock is per piece, then `PCS` | adopted; Mixed removed |
| SA-SV-03 / Q-SV-03: net Last-sale price | **gross** line unit price x Selling Rate, same stone, lot and location ignored | adopted |
| SA-SV-04 / Q-SV-14: list sorts location, stoneCode, lot, profitLoss | adds `price`, `amount`; nulls last | UI builds only the drawn sorts; extra icons are a UI-only change on request |
| SA-SV-06: detail sort `profitLoss` | not in the detail sorts | **open**: the drawn sort icon on the detail PROFIT & LOSS header is not built until SA adds the key |
| SA-SV-08 / Q-SV-27: `pricesUnavailable` partial answer | no partial state; any failure is a normal error | removed from the UI spec |
| SA-SV-09: narrow the `stock-value` leaf | no catalog or grant change (D11) | BE-SV-004 (leaf) dropped from the TODO; `PRICE` action unused |
| Totals: `unpricedCards` | adds `pricedCards`, `noCostCards`; `profitLoss` is `Money` | Total row shows "n without price" and "n without cost" |
| `priceRef { docNo, docDate }`, price 2 places | adds `docType`, `docId`; `UnitPrice` 4 places | tooltip from `docNo` + `docDate`; Price shown with the Decimal Setup `pricePlaces` |
