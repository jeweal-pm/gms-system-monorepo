# ADR-0056: Stock Card report in `backend-api-inventory`, read from the own-stock ledger

- Status: **Proposed** (SA revision 1, pending owner review; not approved)
- Date: 2026-11-23
- Feature / source UI revision: `stock-card` / UI revision 1 ([ui-spec](../apps/frontend/stock-card/ui-spec.md), owner questions Q-SC-01…24 in [open-questions](../apps/frontend/stock-card/open-questions.md))
- SA revision: 1 ([decisions](../apps/backend/inventory/stock-card/decisions.md))
- Deciders: project owner (approval pending)
- Approval evidence: none. Owner request 2026-11-23 ("Stock Movement menu becomes Stock Card and Stock Value … build Stock Card now", Thai, relayed by the parent) authorizes this design work only.
- Supersedes / related ADRs: **follows** [ADR-0052](0052-load-to-stock-in-backend-api-inventory.md) D1 (the Reports module `Stock Movement` lives in `backend-api-inventory`) and D6 (`inventory.stock` + append-only `stock_movement`); **refines** its D18 (the master → inventory hold call carries two display fields, additive). **Follows** [ADR-0055](0055-lot-based-stock-picking-and-allocation.md) D9 as amended 2026-11-21 (Stock ID is hidden only on Quotation, Reserve, Memo Out, Purchase and Memo Return), [ADR-0053](0053-location-master.md), [ADR-0030](0030-permanent-retention-for-user-uploaded-files.md) (no uploads here), [ADR-0025](0025-gms-domain-routing-and-trpc.md) (inventory = REST), [ADR-0024](0024-production-host-4gb-2vcpu.md).
- Frontend TODO / bundle: [task/todo/stock-card.md](../task/todo/stock-card.md); service bundle [inventory/stock-card](../apps/backend/inventory/stock-card/architecture.md); flow [stock-card-flow](../diagram/stock-card-flow.md).

## Context

The owner wants a **Stock Card** report (Report › Stock Movement › Stock Card). The list shows, per stone code, location and lot, the remaining pieces and weight (BALANCE). A row opens the card of that stone: one line per document with IN, OUT and a running BALANCE, a Total row, the document number as a link to the document, the document type as a caption, the Stock ID and the account (vendor or customer).

Facts from the checkout (2026-11-23, branch `feat/23-11-26-stock-card`):

- **Own stock** is `inventory.stock`: one row per Stock ID with buckets `on_hand / reserved / memo_out / sold / consumed`, CHECK `pcs = Σ buckets`. It has an **append-only ledger** `inventory.stock_movement` (`kind`, `document_type`, `document_id`, `pcs_delta`, `weight_delta`; UPDATE/DELETE revoked). Kinds written today: `LOAD_IN`, `LOAD_ADJUST`, `LOAD_REVERSAL` (Load to Stock) and `HOLD_RESERVE`, `RELEASE_RESERVE`, `MEMO_OUT`, `MEMO_OUT_REVERSAL`, `MEMO_OUT_RETURN`, `MEMO_OUT_RETURN_REVERSAL` (holds from master documents; the deltas are **on-hand** changes).
- **Gaps in that ledger for this report:** (1) a movement has no document date and no counter-party; the hold document row `stock_hold_document` has only the document number; (2) a Sale cannot consume own stock yet (`sale_line.source` is `RESERVE | STOCK`, STOCK = Memo Stock; ADR-0054 D11), so no sale kind exists; (3) Stock Adjustment, Stock Transfer Location and Merge/Split are not built.
- **Memo Stock (consignment)** is `partner.memo_stock` in `backend-api-master`. It has **no movement ledger**: only buckets (`pending/returned/sold/reserved/purchased`), allocation tables per document line, and header tables per document. Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase and the Sale consumption call all change it in different tables. Its location is always `Memo`.
- The auth catalog has leaves `stock-movement-primary` and `stock-movement-consignment`; the sidebar is still a placeholder. No stock-card read API exists.
- The owner boundary (SA skill, ADR-0052 D1) puts the Stock Movement report in `backend-api-inventory`. Grouping modules in one process does not permit reading another service's tables.

## Decision

**D1 — Placement.** The Stock Card is the module `src/modules/reports/stock-card/` of `backend-api-inventory` (Hono, REST `/api/inventory/v1/stock-card`, Compose/DNS `backend-api-inventory`, port 3301). It is read-only. It reads inventory-owned tables only (`stock`, `stock_movement`, `stock_hold_document`) through a read function of the `stock` component (`src/modules/stock/card.ts`), never from another module's private tables and never from `partner`. No new service, gateway, tRPC router, container, network, secret or volume.

**D2 — Source of truth: the own-stock ledger plus the stock row.** Entries come from `stock_movement` (grouped per document); the current balance comes from `stock`. The invariant `Σ card-kind movement deltas of a stock = on_hand + reserved` is enforced by a test. No second ledger table and no balance table is added.

**D3 — A card is (stone code, location, lot).** The key is the stored generated column `stock.card_key = 'SC' || md5(item || chr(31) || upper(btrim(location)) || chr(31) || upper(btrim(lot)))`, where `item` is the stone code, or the seven stone attributes when the stone code is empty. It is not the ADR-0055 `lot_key`. Stocks with the same key but different price, note or vendor are one card (owner words "per stone code + location + lot"; SQ-SC-02).

**D4 — Balance is book stock; the kinds are classified in code.** The balance of a stock is `on_hand + reserved` (the stones in the vault that belong to the company and are not out on memo or sold). A **kind registry** (`CARD_KINDS`) classifies every `stock_movement.kind`:

| Kind | Document type | Caption | Card effect | Stock ID shown |
|---|---|---|---|---|
| `LOAD_IN`, `LOAD_ADJUST`, `LOAD_REVERSAL` | `load-to-stock` | Load to Stock | IN / OUT by net sign | yes |
| `MEMO_OUT`, `MEMO_OUT_REVERSAL` | `memo-out` | Memo Out | OUT / IN by net sign | **no** |
| `MEMO_OUT_RETURN`, `MEMO_OUT_RETURN_REVERSAL` | `memo-out-return` | Memo Out Return | IN / OUT by net sign | yes |
| `HOLD_RESERVE`, `RELEASE_RESERVE` | `reserve` | — | **not a movement** (on-hand ↔ reserved; the stone stays in the vault) | no |
| future: own-stock Sale, Stock Adjustment, Stock Transfer, Merge/Split | their own | per module | added by the module that writes the kind | per ADR-0055 D9 |

A test fails when `stock_movement_kind_check` contains a kind that is not in the registry, so a new module cannot silently drop out of the card.

**D5 — Entries are net per document.** One row per (card, document): the net of that document's card-kind movements on the card's stocks. Net positive = IN, negative = OUT (per dimension: pcs and weight are classified separately). A document whose net is zero (deleted, reversed, edited back) has no row, so voided documents never appear. The date is the **document date**; the running BALANCE is the cumulative sum ordered by (document date, first movement time, document id), computed **before** any search or date filter, so a row always shows its true balance. Stock ID is the smallest visible Stock ID of the document plus a count of the others; it is `null` for the document types the owner hides (D4).

**D6 — Two read modes, one result shape.**

- `CURRENT` (no Start and no Due): the list aggregates `inventory.stock` (`ACTIVE`, grouped by `card_key`, balance `on_hand + reserved`); cards with a zero balance are hidden.
- `RANGE` (Start or Due set): the list aggregates the document-level entries up to Due (`balance = Σ`), and keeps the cards that have an entry between Start and Due (also when the balance is zero) or a non-zero balance at Due.
- The detail always uses the entries query. Both modes return the same fields; the invariant test proves `CURRENT` equals `RANGE` with no dates.

**D7 — Document date and account for hold documents (additive internal API).** `stock_hold_document` gets `doc_date`, `party_id`, `party_name`. The existing `PUT /internal/v1/master/stock-holds/{type}/{id}` accepts them as **optional** fields (absent = unchanged; they are not part of the request hash). A new `PATCH …/metadata` sets them without a revision, so a date or customer edit that changes no quantity still reaches the card, and a one-off backfill can fill existing rows. Load to Stock needs nothing: date, number and vendor are on the `stock` row. Until filled, a hold document falls back to the date of its first movement (Asia/Bangkok) and an empty account.

**D8 — Bounds.** Pages of 10 / 25 / 50 (default 25), `page` ≤ 200 (offset ≤ 10,000), one SQL statement per list page (`count(*) OVER ()` gives the total), at most two per detail call, ≤ 5,000 entries per card (else `422 STOCK_CARD_TOO_LARGE`), a 5 s statement timeout, and at most **2 report queries in flight per process** (excess → `503 STOCK_CARD_BUSY`, retryable) so the pool of 5 stays free for document writes. Sorting uses an enumerated column map, never user text in SQL. Measured p95 targets and the scale-out option are in D12.

**D9 — Permission.** New leaves `stock-card` (VIEW, PRINT, EXCEL) and `stock-value` (placeholder, all nine actions like other leaves) replace `stock-movement-primary` / `-consignment` in the auth catalog; an auth migration copies existing VIEW / PRINT / EXCEL grants of the primary leaf to `stock-card` and of the consignment leaf to `stock-value`. Every read needs `stock-card:VIEW`. Excel stays unavailable (no export library is approved); Print is the browser print.

**D10 — Consignment (Memo Stock) is not in revision 1.** Revision 1 reports **own stock** in every Location Master location. Memo Stock needs a master-owned movement ledger written by six master flows, a backfill from the allocation tables, a master internal read API and a cross-service merge of two paged result sets; it is a separate SA revision (outline in [decisions](../apps/backend/inventory/stock-card/decisions.md#consignment-memo-stock-outline-for-revision-2)). The API and the card key already allow it: `location = Memo` is disjoint from every own location. Owner question SQ-SC-03 (= UI Q-SC-02) decides; this ADR recommends own stock first.

**D11 — Sale and other modules join later through the registry.** Own-stock Sale (ADR-0054 D11), Stock Adjustment, Stock Transfer Location and Merge/Split each add their movement kinds and their `CARD_KINDS` rows in their own revision. A module that changes a stock's card (Transfer, Merge/Split) must also carry the card key on the movement it writes, because this revision derives a movement's card from the stock's current row (an applied Load edit that changes lot or location moves its whole history to the new card, as a correction).

**D12 — Capacity.** No container or limit change: inventory stays at 0.20 vCPU / 256 MiB / heap 160 MiB, pool 5 + authz 1, Compose total 1.75 vCPU / 2880 MiB. The report adds ≤ 2 concurrent queries, ≤ 51 returned rows per call (≈ 25 KiB JSON) and no cache, worker, Redis or package. Assumed data: ≤ 50,000 stock rows and ≤ 200,000 movement rows. **Measure before claiming fit:** `RANGE` list p95 ≤ 300 ms at 200,000 movements / 20,000 cards, `CURRENT` list ≤ 100 ms at 50,000 stocks, detail ≤ 150 ms at 5,000 entries. If `RANGE` misses the target, add a monthly closing-balance table in the later Closing Stock module (a separate ADR); nothing in this design blocks that.

Diagrams: [sequence](../apps/backend/inventory/stock-card/sequence-diagram.md), [database](../apps/backend/inventory/stock-card/database-diagram.md). [tech-stack](tech-stack.md) is unchanged (no package).

## Alternatives

| Alternative | Why not chosen |
|---|---|
| Report in `backend-api-master` | Own stock, its ledger and Load to Stock are in inventory (ADR-0052). Master would read `inventory` tables (forbidden) or call inventory for every page. |
| A new ledger/balance table for the card (`stock_card_entry`, `stock_card_balance`) | Duplicates `stock_movement` and `stock.on_hand/reserved`; two writers of one fact and edit/reversal drift. The ledger is already append-only and indexed by stock. |
| Derive entries from document tables (`load_to_stock_row`, `stock_hold`) | `stock_hold` keeps only the current hold and deletes released rows; future modules would each need their own query. The ledger is the designated place (ADR-0052 D6). |
| Store document date and account on every movement row | The ledger is append-only, but a date or customer edit must update the history; a join to one mutable header row keeps it correct. |
| Maintained balance table updated in every apply transaction | Faster list, but it needs a write in every stock-moving path (and the future ones), and cannot answer "balance at Due". `stock` already holds the current balance and the ledger answers the dated one. |
| Both own stock and Memo Stock in revision 1 | Needs a master ledger and a cross-service merge that cannot page by number across two services; costed in D10. Offered as SQ-SC-03. |
| Keep leaf keys `stock-movement-primary` / `-consignment` and only rename labels | Zero migration (the 2026-11-10 precedent), but code and URLs would say "primary" for the Stock Card. Offered as SQ-SC-07. |
| Card key including vendor or `lot_key` | Splits one stone/location/lot by price or vendor; contradicts the owner's wording. Offered as SQ-SC-02. |
| Excel export now | No export library is approved (the project rejected `exceljs`); a server export also needs its own bounds. Excel stays unavailable like other reports. |

## Consequences and capacity

- **Inventory, additive migration** `…_stock_card`: `stock.card_key` (generated, stored) + index; three nullable/defaulted columns on `stock_hold_document`; no data rewrite except the generated column on a small table. Rollback: drop them (the report is read-only, so nothing depends on them but the report).
- **Master, additive:** `inventory-client.putHolds` and the hold saga send `docDate` / `party`; a `patchHoldMetadata` call; a one-off backfill script. Old queued saga payloads without the fields keep working.
- **Auth:** catalog leaves, one grant-copy migration, menu list in the tRPC router. `backend-api-auth/prisma/**` and the catalog are parent-serialized.
- **Frontend:** a REST adapter for `/api/inventory/v1/stock-card`, menu rename, no Stock Value page.
- **No infra, devops or package change.** Nginx already routes `/api/inventory/`; the routes are GET only, JSON, `no-store`.
- **Risks:** (1) history of a card moves when an applied Load edit changes lot, location or stone code (accepted, D11); (2) hold documents created before the migration show the first-movement date and no account until the backfill runs; (3) Invoice rows of the mock appear only after own-stock Sale exists; (4) `RANGE` scans the movement table and needs the measurement above.

## Owner questions

SA questions SQ-SC-01…14 with recommended defaults are in [decisions](../apps/backend/inventory/stock-card/decisions.md#owner-questions). Several are the same decisions as the UI questions Q-SC-01…24; the mapping is in that file. Approving the bundle "with the defaults" accepts every default.

## Acceptance and approval

**Observable checks** (IT-SC-* in [testing](../apps/backend/inventory/stock-card/testing.md)):

- A Load of 4 pcs, a Memo Out of 2 and a Memo Out Return of 2 give three rows IN 4 / OUT 2 / IN 2 and running balances 4, 2, 4; the list shows 4; the Memo Out row has no Stock ID; the Load and Memo Out Return rows do.
- A Reserve of 1 pc changes no IN/OUT and no balance; deleting the Load gives no rows and removes the card from the list.
- `CURRENT` and `RANGE` agree; the balance at a Due date ignores later documents; with Start set the first row's balance includes earlier movements.
- No permission → 403; unknown or malformed card key → 404; the list and the detail never exceed their statement budgets.
- A date or customer edit without a quantity change updates the card's row through the metadata call.

**Covers:** this ADR; the SA revision 1 bundle `document/apps/backend/inventory/stock-card/**` (decisions, architecture, api-contract, authorization, database-diagram, sequence-diagram, error-handling, dependencies, testing); [main flow](../diagram/stock-card-flow.md); the BE-SC rows in [task/todo/stock-card.md](../task/todo/stock-card.md); the auth catalog change. No packages.

**Order after approval:** BE-SC-001 → 002 → 003 and 004 → 005 → 006 → 007 (auth, parallel after 001) → 008 → 009, then frontend FE-SC-004…010.

## Refinement note (2026-11-23, ADR-0057)

[ADR-0057](0057-stock-value-report-in-inventory-service.md) (Proposed) builds the Stock Value report on this design and refines it without changing any Stock Card contract:

- **D9 / SQ-SC-11:** `stock-value` is no longer only a placeholder leaf; it gates the new `/api/inventory/v1/stock-value` routes (`stock-value:VIEW`). The leaf, its actions and the grant copy stay as ADR-0056 created them.
- **D8 / D12 (concurrency):** the report guard becomes **one shared instance** for Stock Card and Stock Value, so at most 2 report queries are in flight per process **across both reports**. Stock Card keeps its codes `STOCK_CARD_BUSY` / `STOCK_CARD_TIMEOUT`.
- **D1 / D3 (reuse):** `modules/stock/card.ts` exports its cards, entries and balance SQL helpers (`groupedCardsSql`, `entriesSql`, search and sort fragments) for the Stock Value read functions; the exports change no Stock Card behaviour and its tests must pass unchanged. A Stock Card and a Stock Value row of one stone share the same `cardKey`.
- **Schema:** an additive migration `20261123110000_stock_value` adds the generated `item_key` on `stock` and `sale_line` and `sale_line_item_key_idx`; `card_key` is untouched.
- **Measurement note:** the `CURRENT` list target (100 ms) of PF-SC-02 was missed in the first measurement; ADR-0057 D12 states its own looser targets and tries the partial ACTIVE index first.
