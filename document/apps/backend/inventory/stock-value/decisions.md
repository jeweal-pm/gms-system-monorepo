# SA decisions: inventory / stock-value, SA revision 1

- Feature ID / SA revision / source UI: `stock-value` / **1** / [UI revision 1](../../../frontend/stock-value/ui-spec.md) (approved by direct owner instruction, recorded in the [TODO](../../../../task/todo/stock-value.md))
- Status: **pending-review**. The owner instruction of 2026-11-23 ("uxui ช่วยทำ ui spec ให้หน่อย sa ทำ adr เสร็จแล้ว frontend ทำ ui และ backend ทำ api", relayed by the parent) authorizes this bundle and the backend work with no approval stop; the defaults below apply. The parent records `sa-approved-revision` and the approval fields in the TODO.
- ADR: [ADR-0057](../../../../adr/0057-stock-value-report-in-inventory-service.md) (Proposed). Extends [ADR-0056](../../../../adr/0056-stock-card-report-in-inventory-service.md).
- Bundle: this file, [architecture](architecture.md), [api-contract](api-contract.md), [authorization](authorization.md), [database-diagram](database-diagram.md), [sequence-diagram](sequence-diagram.md), [error-handling](error-handling.md), [dependencies](dependencies.md), [testing](testing.md). Main flow: [diagram/stock-value-flow.md](../../../../diagram/stock-value-flow.md) (ui-spec). TODO: [task/todo/stock-value.md](../../../../task/todo/stock-value.md) (BE-SV-*).
- Reused designs (unchanged): [inventory/stock-card](../stock-card/decisions.md) (card key, balance, `CURRENT` / `RANGE`, entries, hidden Stock ID, guard, error envelope), [inventory/load-to-stock](../load-to-stock/decisions.md) (own stock, Sale Price / cost fields), [inventory/sale](../sale/decisions.md) (the Invoice), [shared/lot-based-stock](../../shared/lot-based-stock/decisions.md) (lot, per-Stock-ID rows).
- Inspected code (2026-11-23): `backend-api-inventory/prisma/schema.prisma` (`stock`, `stock_movement`, `stock_hold_document`, `sale`, `sale_line`), migrations `20261117100000_inventory_init`, `20261119090000_sale`, `20261123090000_stock_card`, `src/modules/stock/{card.ts,card-kinds.ts,holds.ts,stock.ts}`, `src/modules/reports/stock-card/{routes,schemas,guard}.ts`, `src/app.ts`; `backend-api-master/prisma/schema.prisma` (searched for a price list: none; unit prices exist only on documents) and migration `20261118090000_sale_consumption` (consumption bookkeeping, no prices); `backend-api-auth/src/permission/catalog.ts` (`stock-value` leaf present). UI documents read: `ui-spec`, `open-questions` (Q-SV-01...28), `data-fetching`, the SA handoff and the TODO.

## Where does the price data live? (the question the parent asked)

| Data | Stored today | Evidence | Decision |
|---|---|---|---|
| **Price list** = sell price of the Stock ID | `inventory.stock.sale_price` `numeric(18,2)`, company currency, per `stock.price_unit` (`PER_CT` / `PER_PCS`). Typed as "Sale Price" on the Load to Stock row (required, >= 0; owner Q-LS-13/23), copied to `stock` at apply, updated by a Load edit (`LOAD_ADJUST`). `stock.stock_price` ("Stock Price") is a different field. | `schema.prisma` model `stock`; `stock.ts` apply/edit; ADR-0055 D2 lists both in the merge key | Use `sale_price`. No master `partner` table holds a price list. Purchase prices are costs, not sell prices. |
| **Cost** of the remaining balance (for Profit/Loss) | `stock.unit_cost_base` `numeric(18,4)` per price unit, company currency (cost by the PU line's price unit, Q-LS-12); `cost_amount_base` is the cost of the whole loaded quantity | `schema.prisma`; `stock.ts` | Use `unit_cost_base` x remaining quantity (not `cost_amount_base`, which is rounded to 2 places and does not shrink with the balance). `stock_movement.cost_delta_base` is `0` on every hold kind, so the ledger is not a cost source. |
| **Invoice** / Sale prices | `inventory.sale` + `sale_line` (`unit_price`, `price_unit`, `pcs`, `weight_ct`, item columns; header `currency_code`, `exchange_rate`, `status`, `deleted_at`, `provisional`, `doc_date`) | `20261119090000_sale`, ADR-0054 D1/D2 | Same service and schema: read directly. |
| Location, lot, balance | `inventory.stock` / ledger | Stock Card | Reuse unchanged |

**Service decision:** the report stays in `backend-api-inventory`. Everything it needs is inventory-owned, so it needs **no price feed from master, no internal API and no snapshot**; a snapshot or feed would add a second writer and a network dependency for no gain. The production budget is kept by reading in one bounded statement behind the shared report guard.

## Answers to the SA handoff SA-SV-01...10 ([stock-value-sa](../../../../coordination/handoffs/stock-value-sa.md))

| ID | Decision |
|---|---|
| SA-SV-01 | **Sibling module** `reports/stock-value`, REST `/api/inventory/v1/stock-value` (`options`, `cards`, `cards/{key}`, `cards/{key}/transactions`); the Stock Card endpoints are **not** extended (a separate permission, response shape and error codes). SQL in `modules/stock/value.ts` reusing `card.ts`. Same `cardKey`. Permission `stock-value:VIEW`. |
| SA-SV-02 | Price per card: the quantity-weighted average of the Stock IDs' Price list (`sale_price` > 0), else the Last sale of the stone, else none; `priceSource` `PRICE_LIST` / `LAST_SALE` / `NONE`; unit `CT` unless every Stock ID is per piece (then `PCS`); no `MIXED` source or unit in revision 1. Valued balance = Stock Card's BALANCE (on-hand + reserved). Rules in [architecture](architecture.md#valuation-rules). |
| SA-SV-03 | Last sale = latest approved, live Sale line of the same stone (`item_key`), gross `unit_price` x Selling Rate, `priceRef {docType, docId, docNo, docDate}`, one indexed lateral probe per card **without a Price list** inside the page statement. Differs from the ui-spec default in two points (SQ-SV-04, SQ-SV-12). |
| SA-SV-04 | List: balance at Due (empty = all documents = `CURRENT`), current prices; sorts `stoneCode`, `location`, `lot`, `balancePcs`, `balanceWeightCt`, `price`, `amount`, `profitLoss` (nulls last); `totals` over the whole filtered set. List search matches stone code, stone, lot, vendor name and Stock ID (Stock Card's helper; the UI placeholder does not advertise the Stock ID). |
| SA-SV-05 | `profitLoss = amount - round(avgCost x basis, 2)`, null without price or cost ([below](#profit--loss-owner-formula-pending-d6)). |
| SA-SV-06 | Transactions = Stock Card's plus per row `price`, `priceSource`, `amount`, `profitLoss`; the page carries `valuation`; `totals` add the closing values; detail sort adds `profitLoss` (nulls last), an addition to what the UI reconciliation recorded. |
| SA-SV-07 | Within Stock Card's limits plus the shared guard; indexes: `sale_line_item_key_idx` only (write cost: one btree entry per sale line insert, negligible); contingency partial index measured first ([database-diagram](database-diagram.md)). No new container. |
| SA-SV-08 | Codes `STOCK_VALUE_NOT_FOUND` / `_TOO_LARGE` / `_BUSY` / `_TIMEOUT`. **No `pricesUnavailable` partial answer**: balances and prices are read in the same statement, so there is no state where balances load and prices do not; the frontend treats an absent flag as false and its banner stays unused (Q-SV-27 resolved). |
| SA-SV-09 | `stock-value:VIEW` on every route. **The leaf is not narrowed** (no BE row; the optional narrowing row of the first TODO draft is dropped): the extra actions are inert, no auth migration, catalog or router edit, and the unrelated uncommitted CSRF files are untouched. `PRICE` action unused. |
| SA-SV-10 | Excel: no endpoint. A later export would be a bounded streamed `GET /stock-value/cards/export` over the same list statement with `pageSize` removed and a row cap; it needs its own library review, so the read contract here does not change. |

## Answers to the UI questions that need the service (Q-SV-xx are the ui-spec's)

| UI ID | SA answer |
|---|---|
| Q-SV-01 multi-stock price | One quantity-weighted average of the Stock IDs that have a Price list; Last sale only when the card has none. **Differs from the first UI default** (per Stock ID with a "Mixed" caption); the UI reconciliation already removed Mixed. See SQ-SV-03 and the ADR alternatives. |
| Q-SV-02 Price list | `stock.sale_price` > 0; `0.00` = not set. As the UI default. |
| Q-SV-03 Last sale | **Differs:** gross line `unit_price`, stone-level match (lot ignored). The UI default says net price and "same lot when the line carries one". Reason: a lot rarely has its own invoice, and the net price needs document discount / tax allocation. One SQL fragment changes if the owner picks the UI default (SQ-SV-04, SQ-SV-12). |
| Q-SV-04 units | `unit` `CT` unless every Stock ID is per piece (`PCS`); a per-piece Stock ID in a `CT` card is converted value-preservingly. No `MIXED` unit. |
| Q-SV-05 rounding | Half away from zero (PostgreSQL), 2 places; Total = sum of the cards' rounded amounts. The unit price is a decimal string with **4** places (not 2) so a weighted average is not rounded twice; the UI formats with `pricePlaces`. |
| Q-SV-06 dates | Balance as at Due, current price, as the UI default. |
| Q-SV-07 / Q-SV-10 Profit/Loss | As the UI default; formula and null rules below. |
| Q-SV-09 detail row price | Card's current price on every row; amount = running balance x price. As the UI default. |
| Q-SV-11 Total row | Pcs, weight, amount, profit/loss and counts from `totals`; Price and Unit blank is a UI choice. |
| Q-SV-12 search | List `q` also matches the Stock ID (shared helper); detail `q` as Stock Card (visible Stock IDs only). |
| Q-SV-14 sorts | The API supports the UI's keys and adds `balancePcs`, `balanceWeightCt`, `price`, `amount` on the list and `profitLoss` on the detail; rows without a value sort last in both directions. |
| Q-SV-19 leaf | Not narrowed (SA-SV-09). |
| Q-SV-20 stock scope | Own stock only, same cards and ledger as Stock Card; Memo Stock not valued. |
| Q-SV-24 / Q-SV-25 | Zero balance rule as Stock Card; unpriced cards listed with nulls and counted. |
| Q-SV-27 partial | No partial state (SA-SV-08). |

## Price per lot card (D3)

A card has several Stock IDs (own lots are per Stock ID, ADR-0055), each with its own `sale_price`, `price_unit`, cost and remaining quantity. The card price is the **average of the Stock IDs' prices weighted by their remaining quantity**:

- remaining quantity of a Stock ID = current book balance (`on_hand + reserved`); if the **whole card** has no balance now (a `RANGE` date before the stones left), the loaded quantity (`pcs`, `weight_ct`) is the weight, so a past Due still gets a price;
- only ACTIVE Stock IDs with `sale_price > 0` and a positive quantity in the card unit take part (a `0.00` Sale Price means "not set", SQ-SV-02);
- unpriced Stock IDs of a priced card are valued at the card price (one price x the whole Balance, as the owner's formula);
- the card has one price in one unit, so a per-piece Stock ID inside a `CT` card is normalised value-preservingly (see [architecture](architecture.md#valuation-rules)).

Worked example (CT card): Stock ID A 1.000 ct left at 10,000 per ct, Stock ID B 1.000 ct left at 14,000 per ct -> price 12,000; Amount for Balance 2.000 ct = 24,000.00. The same lot loaded in one receipt: price = that price exactly.

`MIXED` is not used: the first UI assumption priced each Stock ID separately and showed "Mixed" when the sources differed. The card-level rule gives the same numbers whenever the Stock IDs of a card are priced (Sale Price is required on every Load row) and avoids a mixed-unit price with no single value; SQ-SV-03 keeps the alternative.

## Last sale lookup (D4)

- **Which Sale:** `sale.status = 'APPROVED' AND deleted_at IS NULL AND NOT provisional` (an applied, live Invoice), newest by (`doc_date` desc, `created_at` desc, line `position` desc). A Sale in `DRAFT`, `PENDING_APPROVAL`, `REVISION_REQUESTED`, `REJECTED` or deleted never prices a stone.
- **Which line:** the same stone = equal `item_key` (stone code, or the seven attributes when the code is empty; trimmed, upper-cased). Lot and location of the line are ignored.
- **Which number:** the line's `unit_price` (gross, before line / document discount, tax and charges) x `exchange_rate` (1 when null, i.e. the company currency), per the line's `price_unit`. When the card unit differs (card `CT`, line `PER_PCS` or the reverse) the price is converted with that line's own quantities: `u x pcs / weight_ct` or `u x weight_ct / pcs`; if the needed quantity is 0 the Last sale is unusable and the card is `NONE`.
- **Lookup:** an indexed probe per card **only for cards that have no Price list**, inside the list / header / detail statement (no N+1; no separate call). `sale_line_item_key_idx (item_key)`; the probe reads the stone's lines, joins `sale` by primary key and sorts in memory. Scale-out if a stone has thousands of invoice lines: an `item_last_sale` table maintained by the Sale apply transaction (BE-SV-101, separate ADR).
- **Captions:** "Price list", "Last sale" (labels come from the server like `docTypeLabel`; the UI shows "No price" for `NONE`).

## Amount unit rule and rounding (D5)

| Rule | Value |
|---|---|
| Card unit | `PCS` when **every** ACTIVE Stock ID of the card that holds quantity has `price_unit = PER_PCS`; otherwise `CT` (weight). UI caption: `CT` -> "Cts", `PCS` -> "Pcs". |
| Basis | `CT`: balance weight in cts; `PCS`: balance pieces. A balance weight of 0 in a `CT` card values to 0.00 (a piece-only line priced per ct has no value). |
| Amount | `round(price_unrounded x basis, 2)`, half away from zero (PostgreSQL `numeric`); negative balances give negative amounts. |
| Price | the weighted unit price rounded to 4 places for display; the amount is computed from the **unrounded** price, so `amount` can differ from `price x basis` by a cent only in the weighted-average case. |
| Wire format | `price` decimal string 4 places (`"12500.0000"`), `amount` / `profitLoss` 2 places (`"15500.00"`, negative `"-120.50"`), weights 3 places (4 only if ADR-0047 is accepted and migrated), pieces integers. Never a JSON number for money. The UI formats with Decimal Setup (price places 0-4). |
| Currency | the company currency (Load Sale Price and cost are in it, Q-LS-23); the API returns no currency code. Last sale prices are converted with the Sale's Selling Rate. |

## Profit / Loss (owner formula pending, D6)

**Recommended formula:** `profitLoss = amount - cost`, `cost = round(avgCost x basis, 2)`, `avgCost` = the card's weighted-average purchase cost per card unit, computed exactly like the price (Stock IDs with `unit_cost_base > 0`, weights = remaining quantity, fallback loaded quantity, each Stock ID's cost x its remaining quantity in its own price unit). It is the **unrealised** profit if the remaining balance sold at today's price. `null` ("-") when the card has no price or no cost. Totals: `totals.profitLoss` sums the cards that have a value; `totals.noCostCards` counts priced cards without cost. Alternatives are listed under SQ-SV-06; the API does not change if the owner picks another.

## Owner questions

Defaults apply (the owner instruction lets work proceed); an answer changes only the stated item. "= Q-SV-n" marks the same decision as the ui-spec's question.

| ID | Question | Recommended default | Alternative |
|---|---|---|---|
| SQ-SV-01 | Where does the report live and does it need a price feed? | **`backend-api-inventory`, module `reports/stock-value`; no feed (all data inventory-owned)** | master report with an inventory price call (rejected) |
| SQ-SV-02 | "Price list" = which Load to Stock field, and is `0.00` a price? (= Q-SV-02) | **`sale_price` (Sale Price); `0.00` = not set** (falls to Last sale) | `stock_price` (Stock Price); treat `0.00` as a real price |
| SQ-SV-03 | One price for a card with several Stock IDs (= Q-SV-01) | **Quantity-weighted average of the Stock IDs with a Price list; Last sale only when none has one; no "Mixed" caption; fallback weights = loaded quantity when nothing is left** | per Stock ID (Price list, else Last sale) with a `MIXED` source and unit (the first UI assumption); newest Stock ID's price; a price range |
| SQ-SV-04 | What is "latest Invoice" (= Q-SV-03) | **Latest approved, non-deleted Sale line of the same stone (stone code or attributes); lot and location ignored** | same stone + lot (the ui-spec default: "same lot when the line carries a lot"); same stone + location + lot |
| SQ-SV-05 | Unit rule (= Q-SV-04) | **Cts (weight) unless every Stock ID is per piece, then Pcs (pieces)** | owner-chosen unit per stone; always Cts; a `MIXED` unit |
| SQ-SV-06 | **Profit/Loss formula** (none given; = Q-SV-07) | **Amount - weighted-average purchase cost x remaining balance; null without cost** | Amount - Stock Price valuation; sale price - last cost; realised profit from sales (a different report) |
| SQ-SV-07 | Which date is the price (= Q-SV-06) | **Current price and cost at any Due date**; only the quantity is as at Due | historical price (needs a price history table, not available) |
| SQ-SV-08 | Price on a detail row (= Q-SV-09) | **The card's current price applied to the row's running balance** | the price of that row's own Stock ID (hidden on Memo Out; no history) |
| SQ-SV-09 | Cost visibility | **Return Profit/Loss only, never the cost** (a VIEW holder could infer cost = Amount - P/L; accepted, same permission) | add a Cost column; or a separate permission for the cost |
| SQ-SV-10 | Rounding and format (= Q-SV-05) | **Money 2 places, unit price 4 places, half away from zero, decimal strings** | 2-place price |
| SQ-SV-11 | Foreign-currency Sale | **Convert with the Sale's Selling Rate to the company currency** | ignore foreign-currency Sales |
| SQ-SV-12 | Gross or net invoice price | **Gross line `unit_price` (the number on the invoice line)** | net: `amount` / basis of the line (the ui-spec default), or after document discount |
| SQ-SV-13 | Memo Stock (consignment) (= Q-SV-20) | **Not valued: own stock only, like Stock Card revision 1 (SQ-SC-03)** | value Memo Stock in a later revision with Stock Card |
| SQ-SV-14 | Totals when some cards have no price (= Q-SV-25) | **Total sums priced cards; `unpricedCards` / `noCostCards` returned so the UI can say "n without price"** | treat unpriced as 0 (rejected: hides the gap) |
| SQ-SV-15 | Sorting by Price / Amount / Profit-Loss (= Q-SV-14) | **List: `price`, `amount`, `profitLoss`; detail: `profitLoss`; nulls last in both directions** | only the UI's drawn keys |
| SQ-SV-16 | Print and Excel (= Q-SV-17/18) | **Print = browser print of the loaded page; Excel unavailable** (as Stock Card) | server Excel later with its own library review |
| SQ-SV-17 | Capacity targets | **List p95 <= 600 ms (`CURRENT`, 50,000 stocks) / 800 ms (`RANGE`), detail <= 200 ms; measured in BE-SV-005; partial ACTIVE index first if missed** | relax after measurement; or a maintained valuation snapshot (separate ADR) |
| SQ-SV-18 | Narrow the `stock-value` leaf (= Q-SV-19) | **No** (inert actions, no auth change) | narrow to VIEW / PRINT / EXCEL with an auth catalog edit |

## Reconciliation with the UI spec

The ui-spec bundle was read and then reconciled to this contract by ui-spec (see the "Reconciliation" sections of its data-fetching and the SA handoff). Adopted: the names `price`, `unit`, `priceSource`, `priceRef`, `amount`, `profitLoss`, `totals` and `valuation` on the detail. One addition after that reconciliation: the detail accepts `sort=profitLoss` ([api-contract](api-contract.md#additions-after-the-ui-reconciliation)). Facts the ui-spec could not know: the unit price has 4 decimal places; `priceRef` carries `docId`; the detail needs no `pricesUnavailable`; the error codes are `STOCK_VALUE_*`.
