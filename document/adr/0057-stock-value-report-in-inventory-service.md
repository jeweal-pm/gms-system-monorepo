# ADR-0057: Stock Value report in `backend-api-inventory`, valued from the Stock ID price list and the latest Sale

- Status: **Proposed** (SA revision 1; work authorized by the owner instruction below, formal approval fields are recorded by the parent)
- Date: 2026-11-23
- Feature / source UI revision: `stock-value` / UI revision 1 (ui-spec, approved by the owner instruction below; [ui-spec](../apps/frontend/stock-value/ui-spec.md), questions Q-SV-01...28 in [open-questions](../apps/frontend/stock-value/open-questions.md))
- SA revision: 1 ([decisions](../apps/backend/inventory/stock-value/decisions.md))
- Deciders: project owner
- Approval evidence: owner instruction 2026-11-23 (Thai, relayed by the parent): "uxui ช่วยทำ ui spec ให้หน่อย sa ทำ adr เสร็จแล้ว frontend ทำ ui และ backend ทำ api". It authorizes the chain ui-spec -> SA -> frontend and backend without a separate approval stop; open questions below take their stated defaults. The parent records `approved-by` / `approved-at`. Status stays Proposed until then.
- Supersedes / related ADRs: **extends** [ADR-0056](0056-stock-card-report-in-inventory-service.md) (Stock Value is the valuation twin of Stock Card; it replaces ADR-0056 SQ-SC-11 "Stock Value out of scope"; the permission leaf `stock-value` created by ADR-0056 D9 is reused unchanged). **Follows** [ADR-0052](0052-load-to-stock-in-backend-api-inventory.md) D1 (Reports live in `backend-api-inventory`) and D6, [ADR-0054](0054-sale-document.md) (Sale = the Invoice; its lines are the "Last sale"), [ADR-0055](0055-lot-based-stock-picking-and-allocation.md) (lot, per-Stock-ID cost and price), [ADR-0025](0025-gms-domain-routing-and-trpc.md) (inventory = REST), [ADR-0024](0024-production-host-4gb-2vcpu.md), [ADR-0030](0030-permanent-retention-for-user-uploaded-files.md) (no uploads here).
- Frontend TODO / bundle: [task/todo/stock-value.md](../task/todo/stock-value.md) (FE-SV by ui-spec, BE-SV by SA); service bundle [inventory/stock-value](../apps/backend/inventory/stock-value/architecture.md); flow [stock-value-flow](../diagram/stock-value-flow.md) (ui-spec).

## Context

The owner wants a **Stock Value** report next to Stock Card (Report › Stock Movement). The **list** shows one row per (stone code, location, lot) with BALANCE (Pcs, Weight), **Price**, Unit (Cts), **Amount** and **Profit/Loss**, plus a Total row over the whole filtered set. The **detail** shows the Stock Card transaction rows (IN / OUT / running BALANCE) plus a **Current value** group (Price, Amount) and a Profit/Loss per row, with a Total row. Owner formula:

```
price : current unit price per unit; under the number show its source.
        Price list = sell price of the Stock ID
        Last sale  = price from the latest Invoice, used when there is no Price list
amount: remaining quantity in Balance x current price. The unit cts is computed by weight.
```

Profit/Loss has no owner formula yet.

Facts from the checkout (2026-11-23, branch `feat/23-11-26-stock-card`):

- **Both price sources already live in `backend-api-inventory` (schema `inventory`).** The **Price list** is `inventory.stock.sale_price` (the Sale Price typed on the Load to Stock row, required, company currency, per the row's `price_unit` `PER_CT | PER_PCS`; owner Q-LS-13/23). `stock.unit_cost_base` (company currency, per `price_unit`, 4 decimals) is the purchase cost. The **Invoice** is `inventory.sale` / `sale_line` (ADR-0054 D1/D2: Sale is an inventory module; `sale_line.unit_price` per `price_unit`, header `currency_code` + `exchange_rate` (Selling Rate, null for the company currency), statuses `DRAFT … APPROVED`, soft delete `deleted_at`, `provisional`). The master `partner` schema holds no price list and no Invoice; `partner.memo_stock` is consignment (not in Stock Card revision 1 either).
- The Stock Card read model exists in code: `stock.card_key` (stone code or attributes, location, lot), `card.ts` list (`CURRENT` / `RANGE`), header and transactions with a running balance, the report guard (≤ 2 in flight, 5 s timeout) and `stock-card:VIEW`.
- `stock_movement.cost_delta_base` is `0` on hold movements (Reserve, Memo Out, Memo Out Return), so the ledger cannot give the cost of a historical balance; the cost of a balance comes from the stock rows.
- `sale_line` has the same item columns as `stock` (stone code and the seven attributes) but **no index** on them, and `sale` is indexed by customer and date only. A Sale cannot consume own stock yet (ADR-0054 D11), so today's invoices are Reserve and Memo Stock sales; their stones still match by stone code.
- The auth leaf `stock-value` exists (all nine actions; ADR-0056 D9) with the old consignment grants copied to it.

## Decision

**D1: Placement and no price feed.** Stock Value is the module `src/modules/reports/stock-value/` of `backend-api-inventory` (Hono, REST `/api/inventory/v1/stock-value`, port 3301), read-only, with its SQL in `src/modules/stock/value.ts` next to `card.ts`. Because the Price list (`stock.sale_price`), the cost (`stock.unit_cost_base`) and the Invoice (`sale`, `sale_line`) are all inventory tables, the report needs **no call to master, no price feed and no snapshot**: it reads them in the same statement as the balance. No new service, gateway, tRPC router, container, network, secret, volume, cache, worker or package.

**D2: Same cards as Stock Card.** A card is `stock.card_key` (stone code, location, lot) with the same balance rules (book stock = on-hand + reserved; ADR-0056 D3-D6), the same `CURRENT` / `RANGE` modes, location filter, search, paging, zero-balance rule, key format, 404 behaviour and kind registry. A Stock Value row and a Stock Card row of one stone have the same `cardKey`, so the UI can link them. The list balance at Due is exactly the Stock Card balance (invariant test); only the valuation columns are new.

**D3: One unit price per card = the Price list weighted by remaining quantity.** For the ACTIVE Stock IDs of the card (stone code + location + lot) that have `sale_price > 0` and a quantity, the card Price is the quantity-weighted average: `Σ(sale_price x remaining quantity in the Stock ID's own price unit) / Σ(remaining quantity in the card unit)`, where "remaining" is the current book balance (on-hand + reserved) and, only when the whole card holds nothing now (a past `RANGE` date), the loaded quantity. With one price or one Stock ID it equals that price exactly. A Stock ID with `sale_price = 0` is "no Price list" (owner Q-LS-13 only requires >= 0; SQ-SV-02). Unpriced Stock IDs of a priced card are valued at the card price (the owner's "one current price x Balance"). `priceSource = PRICE_LIST`.

**D4: Last sale, indexed per stone.** When the card has no Price list, Price = the unit price of the **latest approved Sale line of the same stone**: `sale.status = 'APPROVED'`, `deleted_at IS NULL`, not `provisional`, newest by (`doc_date`, `created_at`, line position) desc. "Same stone" = a new stored generated `item_key` (`'SI' || md5(upper(btrim(stone code or the seven attributes)))`, the item part of `card_key`) on `sale_line` and on `stock`, matched on equality, with the index `sale_line_item_key_idx`; lot and location are not part of the match (SQ-SV-04). The line's `unit_price` (gross, before line discount) x the Sale's `exchange_rate` (1 when null) gives the company-currency price per the line's unit, converted to the card unit by that line's own pcs and weight when the units differ. It is looked up only for cards without a Price list, in the same statement (indexed lateral lookup). `priceSource = LAST_SALE` plus `priceRef` (Sale id, number, date). With neither, `price`, `amount` and `profitLoss` are `null` (`priceSource = NONE`, shown as "-").

**D5: Unit and Amount.** Card unit `CT` unless every Stock ID of the card that holds quantity is priced per piece (then `PCS`). `CT` multiplies the **balance weight (cts)**, `PCS` the balance pieces; a per-piece Stock ID inside a `CT` card is converted value-preservingly (its value is spread over its own weight). `amount = round(price x basis, 2)` from the unrounded price. Money is a decimal string with 2 places, unit price with 4 places (so the UI can show 0-4 Decimal Setup places), weights 3, pieces integers; rounding is half away from zero (PostgreSQL `numeric`), all in the company currency, no float anywhere.

**D6: Profit/Loss (owner formula pending; recommended).** `profitLoss = amount - cost of the remaining balance`, where cost = the card's **weighted-average purchase cost** (`stock.unit_cost_base` of the Stock IDs with cost > 0, weighted exactly like D3) x the same balance basis, rounded to 2 places. It is the unrealised result if the balance sold at today's price. `null` when the card has no price or no cost. Totals sum the cards that have a value. SQ-SV-06 asks the owner to confirm or replace the formula; the API shape does not change if only the formula does.

**D7: Detail rows.** Each Stock Card transaction row also carries `price`, `priceSource`, `amount` and `profitLoss`: the card's **current** price (D3/D4) and current average cost applied to **that row's running balance** (the valuation is "what this balance is worth today"; the ledger holds no historical price or cost). The page returns the `valuation` block (unit, price, source, reference) once; the Total row is the closing balance (at Due) valued the same way. The transaction filters are Stock Card's; the sorts add `profitLoss` (nulls last).

**D8: API.** `GET /api/inventory/v1/stock-value/{options,cards,cards/{key},cards/{key}/transactions}`, `stock-value:VIEW`, `Cache-Control: no-store`, Stock Card's key, paging (10/25/50, `page` <= 200), sort map plus `price`, `amount`, `profitLoss` on the list and `profitLoss` on the detail (nulls last), error envelope and 404 rule. Field names adopt the frontend's reconciled shapes ([data-fetching](../apps/frontend/stock-value/data-fetching.md)); new fields and totals are in the [api-contract](../apps/backend/inventory/stock-value/api-contract.md). There is no partial "prices unavailable" answer: balances and prices come from one statement, so a failure is a normal 5xx. New error codes `STOCK_VALUE_NOT_FOUND`, `STOCK_VALUE_TOO_LARGE`, `STOCK_VALUE_BUSY`, `STOCK_VALUE_TIMEOUT`.

**D9: Schema (additive only).** Migration `20261123110000_stock_value`: `stock.item_key` and `sale_line.item_key` (`VARCHAR(34)`, stored generated, written by PostgreSQL only) and `sale_line_item_key_idx`. No new table, no backfill (generated), no change to applied migrations. Rollback script drops the index and the two columns. A partial index on ACTIVE stocks for the `CURRENT` list is a measured contingency (BE-SV-101, decided after the BE-SV-005 measurements), not part of the base migration.

**D10: Bounds.** Pages <= 50 rows, `page` <= 200, `q` <= 100, **one statement per list page, one for the header, two for the detail, one for options**, 5 s statement timeout, a read-only transaction. **One shared `ReportGuard` instance for Stock Card and Stock Value**: at most 2 report queries in flight per process in total (not 2 each), so the pool of 5 keeps three connections for document writes; excess waits 250 ms then `503 STOCK_VALUE_BUSY`. The detail keeps Stock Card's cap of 5,000 entries per card.

**D11: Permission.** Every route needs `stock-value:VIEW`; no catalog or grant change (the leaf and its migrated grants exist). The leaf is **not** narrowed to VIEW / PRINT / EXCEL (the optional narrowing row of the UI draft is dropped: the extra actions are inert, and narrowing would put an auth migration and the parent-serialized catalog on the critical path for no behaviour; the `PRICE` action is unused). Print is the browser print; Excel stays unavailable (no library approved), so there is no endpoint for it. The report exposes the sale price list, the last invoice price (number and date, no customer) and, through Profit/Loss, an implied cost; it never returns the cost itself (details in [authorization](../apps/backend/inventory/stock-value/authorization.md)).

**D12: Capacity.** No container or limit change: inventory stays at 0.20 vCPU / 256 MiB / heap 160 MiB, pool 5 + authz 1, Compose total 1.75 vCPU / 2880 MiB. The report adds no connection and no cache. Assumed data: <= 50,000 stock rows, <= 20,000 cards, <= 200,000 movements, <= 200,000 sale lines. The list must value every card of the filtered set (the Total row and the price/amount sorts need it), so it costs more than Stock Card's list. **Measure before claiming fit** (PF-SV-01...05): `CURRENT` list p95 <= 600 ms at 50,000 stocks, `RANGE` list <= 800 ms at 200,000 movements, detail <= 200 ms at 5,000 entries, last-sale lookup for 20,000 unpriced cards <= 250 ms of the list. Stock Card's own `CURRENT` target was missed in its measurement (about 393 ms vs 100 ms, [testing](../apps/backend/inventory/stock-card/testing.md)); Stock Value inherits that base cost, so BE-SV-005 first tries the partial ACTIVE index before any relaxed target is proposed.

Diagrams: [sequence](../apps/backend/inventory/stock-value/sequence-diagram.md), [database](../apps/backend/inventory/stock-value/database-diagram.md). [tech-stack](tech-stack.md) is unchanged (no package).

## Alternatives

| Alternative | Why not chosen |
|---|---|
| Price feed from master / read through an internal master API | Nothing to feed: Price list, cost and Invoice are inventory-owned. A master call adds a network hop, an availability dependency and a second consistency point to every page. |
| A price snapshot or `inventory.item_price` table maintained on Load and Sale | Two writers of one fact; every Load edit, Sale approve and delete would have to recompute "latest". The live read is correct by construction. Kept as the scale-out for the last-sale lookup only (BE-SV-101). |
| Report in `backend-api-master` | It would read inventory tables (forbidden) or call inventory per page; ADR-0052 D1 and ADR-0056 D1 place Stock Movement reports in inventory. |
| Price = the newest Stock ID's sale price | Hides the others; a lot loaded in two receipts with different prices would be valued at one of them. The quantity-weighted average keeps Amount = the sum of the Stock IDs' own values when the units agree. |
| Resolve Price list / Last sale per Stock ID and report a "Mixed" source and unit | The more literal reading of "used when there is no Price list", but it needs per-unit aggregates, a `MIXED` unit with no single price and an effective rate on detail rows, for a case (one lot with some Stock IDs priced 0) that Load to Stock's required Sale Price makes rare. The card-level rule gives the same result whenever the Stock IDs of a card are priced, and one price x the Balance is the owner's formula. Revisit if SQ-SV-03 is answered otherwise. |
| Price weighted by loaded (original) quantity | Ignores what is left; a lot mostly sold at the old price would keep the old price. Used only as the fallback when nothing is left. |
| Net (after-discount) invoice price for "Last sale" | Needs line and document discount, tax and charges allocation; the owner said "price from the latest Invoice". Gross line price is the number on the invoice (SQ-SV-12). |
| Last sale matched on stone + lot + location | A lot rarely has its own invoice; most cards would show no price. Stone-level is the owner's "latest Invoice" (SQ-SV-04). |
| Historical price as at Due (price history table) | There is no price history; Stock Value is a current valuation (SQ-SV-07). |
| Cost from `stock_movement.cost_delta_base` | Zero on hold kinds; cannot value a running balance. |
| Per-row price = the row's own Stock ID price | Hidden Stock ID types (Memo Out) would need a price without an ID, and the owner's formula says remaining Balance x current price (SQ-SV-08). |
| Keep Stock Value a placeholder | Owner asked for it. |

## Consequences and capacity

- **Inventory, additive migration** `20261123110000_stock_value` (two generated columns, one index; `stock` is rewritten once like the `card_key` migration, `sale_line` is small). Rollback: drop them; nothing else reads them. Compatibility: no contract of an existing endpoint changes; Stock Card is untouched except for non-behavioural refactors (move of the guard, exported helpers) with its tests unchanged.
- **Master, auth, frontend infra:** no master or auth change; no infra or devops change (no container, image, network, secret, volume, Nginx or workflow edit; GET JSON under the existing `/api/inventory/` route). Frontend: a REST adapter for `/api/inventory/v1/stock-value` and the Stock Value pages (ui-spec).
- **Risks:** (1) the list valuation cost at the assumed size is an estimate until PF-SV runs; (2) a stone sold very often makes the per-card last-sale probe read many lines (index + sort in memory; scale-out BE-SV-101); (3) valuing history at the current price can surprise users comparing two dates (UI caption, SQ-SV-07); (4) P/L is a recommended formula, not an owner rule; (5) unpriced stones show "-" and are counted in `totals.unpricedCards`, not valued at zero; (5b) the Last sale rule differs from the ui-spec default in two points (gross price instead of net, stone-level instead of lot-aware match; SQ-SV-04/12) and the first UI assumption of a "Mixed" source / unit is not adopted (SQ-SV-03); (6) Memo Stock is not valued, as it is not in Stock Card revision 1.

## Owner questions

SQ-SV-01...18 with recommended defaults are in [decisions](../apps/backend/inventory/stock-value/decisions.md#owner-questions). The open ones that change numbers: **SQ-SV-06 Profit/Loss formula**, SQ-SV-02 (Price list = Sale Price, 0 = not set), SQ-SV-04 (Last sale by stone), SQ-SV-07 (current price at any Due). The owner instruction above lets work proceed on the defaults.

## Acceptance and approval

**Observable checks** (IT-SV-* in [testing](../apps/backend/inventory/stock-value/testing.md)):

- A card with one Stock ID (2 pcs, 1.240 ct, Sale Price 12,500 per ct, cost 8,000 per ct) lists Price `12500.0000` (Price list), Unit CT, Amount `15500.00`, Profit/Loss `5580.00`; with two Stock IDs priced 10,000 and 14,000 per ct and 1 ct each the price is `12000.0000`.
- A card without a Price list but with an approved Sale of the same stone shows that Sale's price (converted by Selling Rate) with source Last sale and the Sale number; a deleted or unapproved Sale is ignored; with no Sale the row shows `price = null`, `amount = null`, and counts in `totals.unpricedCards`.
- The list Total row equals the sum of all filtered cards (not the page); the list balance equals Stock Card's; the detail Total amount equals the last row's amount of an unfiltered card; list Amount = detail header `currentAmount`.
- No `stock-value:VIEW` -> 403; unknown or malformed key -> 404; statement counts per call stay 1 / 1 / 2 / 1 regardless of rows; a third concurrent report call (Stock Card or Stock Value) gets `503 ..._BUSY`.
- Rollback script restores the old shape; Stock Card tests still pass unchanged.

**Covers:** this ADR; the SA revision 1 bundle `document/apps/backend/inventory/stock-value/**` (decisions, architecture, api-contract, authorization, database-diagram, sequence-diagram, error-handling, dependencies, testing); the BE-SV rows in [task/todo/stock-value.md](../task/todo/stock-value.md); the handoff [stock-value-sa](../coordination/handoffs/stock-value-sa.md) and [stock-value-backend](../coordination/handoffs/stock-value-backend.md). No packages.

**Order:** BE-SV-001 (migration) and BE-SV-002 (shared guard, codes) in parallel -> BE-SV-003 (value functions) -> BE-SV-004 (module, registration) -> BE-SV-005 (tests, measurements) -> BE-SV-006 (reviews, handoff); then the frontend integrates the live contract.
