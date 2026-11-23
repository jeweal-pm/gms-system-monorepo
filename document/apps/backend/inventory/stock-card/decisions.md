# SA decisions: inventory / stock-card, SA revision 1

- Feature ID / SA revision / source UI: `stock-card` / **1** / [UI revision 1](../../../frontend/stock-card/ui-spec.md) (pending-review)
- Status: **pending-review** (2026-11-23). Approval fields: `none`. The owner request of 2026-11-23 authorizes design only.
- ADR: [ADR-0056](../../../../adr/0056-stock-card-report-in-inventory-service.md) (Proposed).
- Bundle: this file, [architecture](architecture.md), [api-contract](api-contract.md), [authorization](authorization.md), [database-diagram](database-diagram.md), [sequence-diagram](sequence-diagram.md), [error-handling](error-handling.md), [dependencies](dependencies.md), [testing](testing.md). Main flow: [diagram/stock-card-flow.md](../../../../diagram/stock-card-flow.md). TODO: [task/todo/stock-card.md](../../../../task/todo/stock-card.md) (BE-SC-*).
- Reused designs (unchanged): [inventory/load-to-stock](../load-to-stock/decisions.md) (own stock, ledger, hold API, saga), [shared/lot-based-stock](../../shared/lot-based-stock/decisions.md) (Stock ID visibility), [inventory/sale](../sale/decisions.md) (Sale is Memo-Stock-only today).
- Inspected code (2026-11-23): `backend-api-inventory/{prisma/schema.prisma, prisma/migrations/*, src/app.ts, src/modules/stock/{stock,holds,lots,picker}.ts, src/internal/master-routes.ts, src/platform/auth/principal.ts}`, `backend-api-master/{prisma/schema.prisma (MemoStock, MemoReceiveLine, *LineAlloc, SaleConsumption*), src/trade-document/inventory-hold-saga.ts, src/inventory-client/inventory-client.ts}`, `backend-api-auth/{prisma/schema.prisma (UserPermission), src/permission/catalog.ts, src/trpc/auth-trpc.router.ts}`, `frontend/src/app/(app)/**` routes.

## Does a movement ledger exist? (the question the parent asked)

| Stock | Ledger today | Enough for the card? |
|---|---|---|
| Own stock (`inventory.stock`) | **Yes**: `inventory.stock_movement`, append-only, kinds for Load to Stock and for master holds (Reserve, Memo Out, Memo Out Return) | **Yes for Load / Memo Out / Memo Out Return**, after two additive gaps are closed: document date + account for hold documents (D7), and the card key on `stock`. **No sale kind**: own-stock Sale is not built. |
| Memo Stock (`partner.memo_stock`, master) | **No.** Buckets and per-document allocation tables only | **No.** A ledger or a derived read from six document families is needed (outline below) |

Decision: **balances and entries come from the existing inventory ledger and stock row; no new ledger or balance table.** Memo Stock needs its own owner-side ledger and is revision 2.

## Answers to the UI questions that need the service (Q-SC-xx are the ui-spec's)

| UI ID | SA answer |
|---|---|
| Q-SC-01 Stock ID | Shown for Load to Stock, Memo Out Return (and later Sale, Memo Receive); `null` for Memo Out, Reserve, Quotation, Purchase, Memo Return. This is ADR-0055 D9 **as amended 2026-11-21** (owner Q3: hide only on those five). The ui-spec fact F-01 quotes the earlier "shown nowhere" text; the amendment already allows the column. Only **searching** by Stock ID is a new exception to Q-LOT-10a; the search matches visible Stock IDs only, so a hidden ID is never confirmed by search (SQ-SC-09). |
| Q-SC-02 Which stock | **Own stock now; Memo Stock in revision 2** (differs from the UI default "both"). Reason and cost below. |
| Q-SC-03 Documents and IN/OUT | Table "IN / OUT by document" below. Reserve is not a movement. Purchase never touches own stock (it pays for Memo Stock; its manual/PO lines enter own stock through Load to Stock, which is the IN). |
| Q-SC-04 Mock labels | "Memo Return" (IN, customer) = **Memo Out Return**; "Invoice" = **Sale**. The caption comes from the registry (`Sale`, not `Invoice`; Document Setup may give it the code `IV`, the caption stays the module name). |
| Q-SC-05 Location filter | Single, exact (case-insensitive). Options: the distinct locations present in `inventory.stock` (≤ 500), so a deactivated location that still holds stock stays selectable. |
| Q-SC-06 List dates | As the UI default: balance as at Due (empty = all documents, `CURRENT` mode); with Start, only cards that have an entry in [Start, Due]. |
| Q-SC-07 Detail dates / Total | The API returns `opening` (balance before Start) and `totals`. Running BALANCE is always cumulative. `totals.in*` / `out*` sum the rows that match all filters; `totals.balance*` is the **closing balance at Due** (all entries, ignoring `q`). No separate opening row unless the owner asks (SQ-SC-10). |
| Q-SC-08 Zero balance | `CURRENT`: hidden. `RANGE`: shown when an entry falls in [Start, Due] or the balance at Due is not zero. A negative balance cannot occur in own stock (CHECK buckets ≥ 0) but is returned as is. |
| Q-SC-10 Paging | Numbered `page` + `pageSize` 10/25/50, `page` ≤ 200, total by `count(*) OVER ()`; bounds in D8. |
| Q-SC-11 Print / Excel | Print = browser print of the loaded page; Excel unavailable. No endpoint beyond the paged GETs. |
| Q-SC-14 Leaves | `stock-card` (VIEW, PRINT, EXCEL), `stock-value` (placeholder); grants copied by an auth migration (D9). |
| Q-SC-15 Lot second line | `vendorName` = the vendor of the newest stock of the card, `vendorCount` = number of distinct vendors. Location has no second line. |
| Q-SC-17 Search | List: stone code, stone, lot, vendor name, Stock ID. Detail: document number, account name, Stock ID of visible rows. Contains-match, case-insensitive, `%`/`_`/`\` escaped, ≤ 100 chars. |
| Q-SC-19 Card | Exactly (stone code, location, lot). See SQ-SC-02. |
| Q-SC-21/22/23 | Frontend only. The API sorts by `date` (default asc) / `docNo` / `stockId` / `account`; the running balance always follows the chronological order, not the chosen sort. Dates are `YYYY-MM-DD` Asia/Bangkok. |
| Frontend shapes | The assumed `StockCardRow / Header / Txn / Totals` of [data-fetching](../../../frontend/stock-card/data-fetching.md) are adopted with these changes: no `description` (the frontend builds it from the attributes), `vendorCount` added, `stockIdExtra` kept (0 when ≤ 1 visible Stock ID), `accountId` added, `id` = `documentType:documentId`. |

## Answers to the SA handoff SA-SC-01…14 ([stock-card-sa](../../../../coordination/handoffs/stock-card-sa.md))

| ID | Decision |
|---|---|
| SA-SC-01 | Service: **`backend-api-inventory`**, module `reports/stock-card`, REST `/api/inventory/v1/stock-card` (`options`, `cards`, `cards/{key}`, `cards/{key}/transactions`) — the UI's `list` / `get` / `transactions`. One source (own stock), so **no partial-source banner** in revision 1; with Memo Stock in revision 2 the question returns. |
| SA-SC-02 | Card = (stone code, location, lot) by `stock.card_key`. BALANCE = `on_hand + reserved` (Memo Out leaves, Memo Out Return returns; Reserve stays). **List BALANCE = the last running BALANCE of the detail** at the same Due date (`CURRENT` mode counts every document, as the last row of an unfiltered detail does); proven by IT-SC-L4. |
| SA-SC-03 | Source per type: own `stock_movement` (Load kinds, hold kinds), classified by `CARD_KINDS`; Memo Receive / Memo Return are revision 2 (no ledger in master); Sale joins when own-stock Sale exists; Merge/Split, Transfer, Adjustment add rows when built. Label, document id, number, date, account: see D4/D5/D7. Draft, pending, rejected and deleted documents never produce a row (net zero / never applied). |
| SA-SC-04 | `q`, `location`, `from`, `to`, the five sorts, `cardKey` tie-break, numbered paging (10/25/50, `total`), zero-balance rule, as in the [api-contract](api-contract.md). Index: `stock_card_key_idx` (+ existing `stock_movement_stock_idx`). |
| SA-SC-05 | True running balance in (document date, apply time, document id) order, computed before `q`, `from` and `sort`; `totals` IN/OUT over the whole filtered set, closing balance at Due; `opening` returned. |
| SA-SC-06 | Stock ID = smallest visible Stock ID of the document + `stockIdExtra`; `null` on Memo Out (ADR-0055 D9 amended 2026-11-21); search matches visible IDs only. Public API carries no allocation data. |
| SA-SC-07 | `pageSize` ∈ {10, 25, 50}, `page` ≤ 200, `q` ≤ 100, one statement per list page, two per detail, 5 s statement timeout, ≤ 2 concurrent report queries, ≤ 5,000 entries per card. Cost at the assumed size and at 10×: measured in BE-SC-008 (PF-SC-01…04); estimate only until then. |
| SA-SC-08 | `vendorName` (newest stock) + `vendorCount`. |
| SA-SC-09 | The filter value is the Location **name** (stock rows store the name); options come from the distinct locations in stock via `GET /stock-card/options` (not from master). |
| SA-SC-10 | Leaves `stock-card` (VIEW, PRINT, EXCEL) and `stock-value`; grant copy migration; router menu list and user-permission contract updated (BE-SC-007); every read checks `stock-card:VIEW`. |
| SA-SC-11 | Codes: `PERMISSION_DENIED` 403, `STOCK_CARD_NOT_FOUND` 404, `VALIDATION_ERROR` 422, `STOCK_CARD_TOO_LARGE` 422, `STOCK_CARD_BUSY` / `STOCK_CARD_TIMEOUT` 503 ([error-handling](error-handling.md)). |
| SA-SC-12 | Excel: not in revision 1; no endpoint, no package. |
| SA-SC-13 | The card does not use `lot_key`. Master's FIFO allocation tables are not read: the hold PUT already carries one quantity per own stock, and the ledger records it once, so nothing is double-counted. Legacy lines have the same holds as new ones. |
| SA-SC-14 | [testing](testing.md): running balance with filters (IT-SC-L5/L7, UT-SC-05), totals, empty lot (IT-SC-M1), negative balance (UT-SC-05), unknown document type (open `docType` string, UT-SC-01), bounds (IT-SC-B1/B2, IT-SC-L7), permission denial (IT-SC-A1). |

## IN / OUT by document (own stock, revision 1)

| Document | Own-stock effect | Card row | Direction | Stock ID | Account |
|---|---|---|---|---|---|
| Load to Stock (approved / auto-approved) | creates stock (`LOAD_IN`), edits (`LOAD_ADJUST`), delete (`LOAD_REVERSAL`) | yes | IN | shown | vendor of the load |
| Memo Out (own stock lines) | on-hand → memo_out (`MEMO_OUT`) | yes | OUT | hidden | customer |
| Memo Out Return (own stock lines) | memo_out → on-hand | yes | IN | shown | customer |
| Reserve | on-hand → reserved | **no** (the stone stays in the vault; balance unchanged) | — | — | — |
| Quotation | none | no | — | — | — |
| Memo Receive / Memo Return / Purchase | none (Memo Stock only) | no (revision 2 for Memo Receive and Memo Return) | — | — | — |
| Sale | none yet (own-stock Sale not built) | **later**: OUT, Stock ID shown, customer | OUT | shown | customer |
| Stock Adjustment, Stock Transfer Location, Merge/Split | not built | later, per module | — | per ADR-0055 D9 | — |

Balance = Σ IN − Σ OUT = `on_hand + reserved` per stock. A stone on Memo Out leaves the balance and returns with the Memo Out Return. A stone only reserved still counts.

## How the balance at a date is computed

Entries are the net per document of the card's movements (D5), dated by the **document date**: `stock.ref_doc_date` for Load kinds, `stock_hold_document.doc_date` for hold kinds, falling back to the first movement's Bangkok date when the hold row has none (documents applied before the metadata existed). Balance at Due = Σ of net entries dated ≤ Due. A back-dated edit changes the history from its date on, as documents do. A document dated after Due is not counted.

## Voided, deleted, rejected and edited documents

- Draft, pending, revision-requested and rejected documents never apply, so they have no movement.
- A deleted applied document is reversed by the existing saga; its net is zero and **no row is shown** (no strike-through). Restoring it applies it again.
- An edit shows as the document's new net (for example Memo Out 5 → 3 pcs shows OUT 3). The ledger keeps every step for audit; the card shows the net.

## Consignment (Memo Stock): outline for revision 2

Not designed in detail here, so it can be costed after the owner answers SQ-SC-03.

1. **Master ledger** `partner.memo_stock_movement` (append-only; memo stock id, kind, document type/id/no/date, party id/name, pcs/weight delta, revision), written in the same transactions that change `memo_stock` buckets: Memo Receive apply/edit/delete, Memo Return, Memo Out, Memo Out Return, Purchase (`IN_STOCK` part), and the Sale consumption call (master needs the Sale's date and customer name added to the call).
2. **Backfill** from `memo_stock`, `*_line_alloc`, `sale_consumption_line` and the document headers for already applied documents.
3. **Master internal read API** (`POST /internal/v1/inventory/stock-card/memo/…`, service token) for cards and entries; inventory merges it with its own result.
4. **Paging:** numbered pages cannot be merged across two services for arbitrary sorts. Options for that revision: own-first-then-Memo ordering (a Memo location is one value), or a keyset "Load more" list. Decided there.
5. **Card key:** `location = Memo`, stone code from `memo_receive_line.stone_code_snapshot`.
6. Cost: six master write paths, one migration with backfill, one internal API, a merge, plus tests; about as large as ADR-0055's master half. Meaning of Purchase of in-stock consignment goods (ownership, not a physical movement) needs an owner decision first.

## Owner questions

Each has a recommended default; approving "with the defaults" accepts them. "= Q-SC-n" marks the same decision as the ui-spec's question, answered once.

| ID | Question | Recommended default | Alternative |
|---|---|---|---|
| SQ-SC-01 | Service for the report | **`backend-api-inventory`**, module `reports/stock-card` (ADR-0052 D1, ADR-0056 D1) | `backend-api-master` (reads inventory over HTTP for every page; amends ADR-0052 D1) |
| SQ-SC-02 | What is one card? (= Q-SC-19) | **(stone code, location, lot)**; same key with a different price, note or vendor is one card; the vendor of the newest stock is shown, with "+n" | include the vendor in the key (the mock shows two identical-looking rows 7 and 8, which this default merges); or per Stock ID |
| SQ-SC-03 | Own stock and Memo Stock (= Q-SC-02) | **Own stock now; Memo Stock as SA revision 2** with its own ledger | Both now: one larger revision with the master ledger, backfill and a cross-service merge (several days more; a Memo location would show empty until it ships if split) |
| SQ-SC-04 | What is "BALANCE", and does Reserve move it? (= Q-SC-03) | **Book stock = on-hand + reserved.** Reserve is not a movement. Memo Out is OUT, Memo Out Return is IN, Load is IN | Count Reserve as OUT (balance = available stock) and show it as a document row; or add an "Available" column later |
| SQ-SC-05 | Which date orders and filters the card | **Document date** (the date on the document), tie-break by apply time; back-dated edits change history | Apply (posting) time |
| SQ-SC-06 | Deleted or edited documents | **Net only, no row for a zero net, no strike-through** | Show a deleted document struck through with a Deleted badge; show every edit step |
| SQ-SC-07 | Permission keys (= Q-SC-14) | **New leaves `stock-card` / `stock-value`**, VIEW/PRINT/EXCEL actions for the card, existing grants copied | Keep `stock-movement-primary` / `-consignment` and rename labels only (no migration; code says "primary") |
| SQ-SC-08 | Sale and "Invoice" rows | **Registry-ready; rows appear when own-stock Sale (ADR-0054 D11) is built, a separate feature.** Caption "Sale". Until then no OUT by sale exists, so the mock's Invoice row cannot occur | Build own-stock Sale first (large: stock lock, price, saga) |
| SQ-SC-09 | Stock ID in the card and in search (= Q-SC-01, Q-SC-17) | **Show on Load / Memo Out Return (and later Sale); null on Memo Out, Reserve, Quotation, Purchase, Memo Return; search matches visible IDs only** | Hide the column and the search term everywhere (Q-LOT-10 original) |
| SQ-SC-10 | Opening balance when Start is set (= Q-SC-07) | **No extra row**; BALANCE is cumulative and `totals.balance` is the closing balance. The API also returns `opening` | An "Opening balance" first row (Total balance = opening + IN − OUT) |
| SQ-SC-11 | Stock Value | **Out of scope** (menu placeholder, leaf created) | — |
| SQ-SC-12 | Print and Excel (= Q-SC-11) | **Print current page, Excel unavailable** | Server Excel later with its own library review and bounds |
| SQ-SC-13 | Existing Reserve / Memo Out / Memo Out Return documents that already hold own stock | **Run the one-off metadata backfill** (re-runnable script). Without it they show the first-movement date and an empty account | Accept the fallback; re-save the few documents by hand |
| SQ-SC-14 | Is the report allowed to read the whole movement table when a date is set | **Yes, bounded:** ≤ 5,000 entries per card, 5 s timeout, 2 concurrent; p95 targets measured at 200,000 movements before sign-off | Add a balance snapshot table now (more write paths; the Closing Stock feature will need it anyway) |
