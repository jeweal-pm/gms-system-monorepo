# Handoff: stock-card -> SA (service design request)

- Feature ID / UI revision: `stock-card` / UI revision 1 (**pending-review**, not approved)
- Status (2026-11-23): **written by ui-spec; the parent states SA is already writing an ADR / API contract in parallel.** This file lists what the UI needs so SA can align names or replace them. It does not authorize implementation.
- SA revision / source UI revision: none yet / 1
- From role/scope: ui-spec (documents only)
- To role/scope / parent integration owner: `sa`; parent serializes shared files (auth permission catalog, `frontend/src/features/home/navigation.ts`, `document/adr/tech-stack.md`, task pointers, Compose / nginx if any)
- Exact TODO IDs and source documents: FE-SC-004/005/006/009/010 (requires-sa) in [todo/stock-card.md](../../task/todo/stock-card.md); [ui-spec](../../apps/frontend/stock-card/ui-spec.md), [open-questions](../../apps/frontend/stock-card/open-questions.md) (Q-SC-01…24), [data-fetching](../../apps/frontend/stock-card/data-fetching.md) (assumed field names), [error-handling](../../apps/frontend/stock-card/error-handling.md), [flow](../../diagram/stock-card-flow.md)
- Approval status, approved revision, and owner evidence: **none**. SA design is allowed as a draft; dependent code needs owner approval of UI rev 1 and separate approval of the SA bundle.
- Required contract / diagrams / ADRs: SA bundle under `document/apps/backend/<service>/stock-card/`, ADR (next free number after ADR-0055, or the number SA already holds), sequence + database diagrams if a table or read model is added, BE-SC-* items in `document/task/todo/stock-card.md`.
- Dependency ledger entries and installation status: none proposed by UI (no Excel library, Q-SC-11).
- Allowed code/document paths: SA writes `document/apps/backend/**`, `document/adr/**`, `document/diagram/**`, the BE section of the central TODO; **no application code**.
- Integration-owned changes: `backend-api-auth/src/permission/catalog.ts` + `auth-trpc.router.ts` menu list (new leaves `stock-card`, `stock-value`, replacing `stock-movement-primary` / `stock-movement-consignment`) and a grant migration; `frontend/src/features/home/navigation.ts`.
- Infra service bundle / DevOps: none expected from the UI. If SA adds an index, read model or cross-service internal API, state it for infra review (no new container requested).
- Resource budget / capacity impact (4 GB RAM / 2 vCPU total): reads only. The UI requests at most 50 rows per call. SA must keep every query bounded and indexed: no unbounded scan of `stock_movement` or of documents per request; the running-balance window runs over one card only; the Total row is an aggregate over one card; no cache or worker unless justified against [infra/capacity.md](../../infra/capacity.md).
- Expected output and acceptance criteria: one SA bundle the owner can approve in one review, answering SA-SC-01…14, with the UI's assumed names adopted or replaced (then the UI data-fetching document is updated by ui-spec in a revision 1.1 or by frontend at integration).
- Verification completed / not run: none (design request).
- Blocking item, if any: owner answers to Q-SC-01 (Stock ID), Q-SC-02 (scope), Q-SC-03 (documents) change SA scope; SA can proceed with the recommended defaults.
- Resume action and destination: SA bundle -> parent presents UI rev 1 + SA rev 1 for owner approval -> backend -> frontend FE-SC-004/005/006/009/010.
- Corrective work ID / root-cause ledger link: not applicable (new work).
- Existing pass limit / allocated passes / active pass: not applicable.
- Changed evidence, contract, or prerequisite justifying this handoff: new feature; no stock-card read API exists (checked `backend-api-inventory/src/modules`, `backend-api-master`).
- Concrete receiving-role output / next fact needed: the service placement (SA-SC-01) and the ledger source for IN / OUT lines (SA-SC-03).
- Stop reason / terminal outcome / explicit extension evidence: none.

## Facts found by ui-spec (C)

- `inventory.stock` holds own stock (one row per Stock ID: `location`, `stone_code`, `lot`, `on_hand_*`, `reserved_*`, `memo_out_*`, `sold_*`, `lot_key`, `vendor_name_snapshot`, `ref_doc_no`, `ref_doc_date`); `inventory.stock_movement` has `kind`, `document_type`, `document_id`, `pcs_delta`, `weight_delta`, `created_at` per stock. Memo Stock (`partner.memo_stock`) and the master documents (Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase) live in `backend-api-master`; Sale and Load to Stock live in `backend-api-inventory` (ADR-0052, ADR-0054).
- `lot` is free text, optional, up to 40 chars; Stock rows are never merged; allocations (ADR-0055) keep Stock ID snapshots server-side. The approved lot-based-stock decision hides the Stock ID in the UI (Q-LOT-10); the Stock Card design shows it (Q-SC-01).
- The Location master is Name only (ADR-0053); stock rows store `location` as a string.
- Auth catalog today: `report` section -> `stock-movement` group -> leaves `stock-movement-primary` and `stock-movement-consignment` (`backend-api-auth/src/permission/catalog.ts`; also listed in `auth-trpc.router.ts` and documented in `apps/backend/auth/user-permission/api-contract.md`).
- Document Setup default codes: Load to Stock LS, Memo Receive MR, Memo Return MRT, Memo Out MO, Memo Out Return MOR, Sale SL. The design's mock numbers and its "Invoice" type do not match (ui-spec F-02).

## SA must design

| ID | Topic | UI expectation / recommended default |
|---|---|---|
| SA-SC-01 | **Service placement + ADR; one read API** | Operations the UI assumes: `stockCard.list`, `stockCard.get`, `stockCard.transactions` (shapes in [data-fetching](../../apps/frontend/stock-card/data-fetching.md)). Decide which service owns them and how own stock (inventory) and Memo Stock (master) combine (one service reads the other through an internal API, or a read model). Compare capacity and failure modes; define the partial-source behaviour if two services answer (UI has a "some stock couldn't be loaded" banner, only needed if sources stay separate). |
| SA-SC-02 | **Card identity and BALANCE** (Q-SC-02/19) | One card per (stone code, location, lot) as the owner says; empty lot is one group; `cardKey` opaque and stable. BALANCE = physical quantity in the company's hands (on hand incl. reserved/held? SA decides and states which buckets: own `on_hand` versus `on_hand + reserved + memo_out`; Memo Stock `pending` versus `pending + reserved`). The UI only shows one BALANCE; the definition must make list BALANCE = last running BALANCE of the detail. |
| SA-SC-03 | **Ledger of IN / OUT lines** (Q-SC-03/04) | Document types, sign and the moment a line exists (approval time). UI default: IN = Load to Stock, Memo Receive, Memo Out Return; OUT = Memo Out, Memo Return, Sale; no Reserve / Quotation / Purchase. State the source per type (own `stock_movement`, memo documents, sale lines), how Merge/Split, Transfer and Adjustment will plug in, and what `docTypeLabel`, `docId`, `docNo`, `docDate` (Bangkok date), `accountName` (vendor or customer) come from. Soft-deleted and unapproved documents are excluded. |
| SA-SC-04 | **List query** (Q-SC-06/08/17) | Filters `q` (stone code, stone, lot, vendor, Stock ID if Q-SC-01), `location`, `from`, `to`; BALANCE as at `to` (default today Bangkok); with `from` only cards that moved in the range; default hides zero balance. Sort keys `stoneCode`, `location`, `lot`, `balancePcs`, `balanceWeightCt`; stable tie-break on `cardKey`. Paged (10/25/50), `total`. Needed indexes stated. |
| SA-SC-05 | **Transactions query and totals** (Q-SC-07/22) | `cardKey`, `q`, `from`, `to`, sort (`date`, `docNo`, `stockId`, `account`), page. Each row carries the **true running balance** after it (chronological order: document date, then approval time, then id), independent of the current sort or filter. `totals` = sum of IN and OUT of all filtered rows (not the page) and the closing balance after the last filtered row. Bound the cost: one card only. |
| SA-SC-06 | **Stock ID in the report** (Q-SC-01) | If the owner keeps the column: which Stock ID per line (allocation snapshot; one value or the first + count `stockIdExtra`); searchable by Stock ID in list and detail. If hidden: omit the field. Public API must not leak other Stock ID data. |
| SA-SC-07 | **Bounds and capacity** | `pageSize` in {10, 25, 50}; `q` max length; one query per call with a statement timeout; no heavy scan; no cache or worker unless justified; state the expected cost at the current data size and at 10x (estimate vs measured). |
| SA-SC-08 | **Vendor line of the Lot cell** (Q-SC-15) | `vendorName` per card (several vendors -> first + count). |
| SA-SC-09 | **Location filter** | Reuse `options.locations`; the filter value is the Location name (stock rows store the name). State if it is an id instead. |
| SA-SC-10 | **Permissions and menu** (Q-SC-14) | New leaves `stock-card` (VIEW, PRINT) and `stock-value` (placeholder, VIEW) replacing `stock-movement-primary` / `-consignment`; migration of existing grants (default: holders of either old leaf with VIEW get `stock-card` VIEW); update `auth-trpc.router.ts` menu list and the user-permission API contract; every read endpoint checks `stock-card:VIEW`. |
| SA-SC-11 | **Errors** | Transport statuses the UI maps: FORBIDDEN, NOT_FOUND (unknown `cardKey`), BAD_REQUEST (bad range / page size), others. List any domain codes. |
| SA-SC-12 | **Excel** (Q-SC-11) | Not in revision 1 (UI disabled). If SA wants to pre-design a bounded streamed export, mark it as a later revision with its dependency proposal. |
| SA-SC-13 | **Interaction with approved lot-based-stock** | Confirm the card does not depend on `lot_key`; confirm FIFO allocations and existing legacy lines do not double-count a movement. |
| SA-SC-14 | **Test and verification plan** | Contract tests for the running balance (including filters), totals, empty lot, negative balance, a document type with no route, bounds, and permission denial. |

## SA response (2026-11-23, SA revision 1, pending-review)

Answered in one bundle: [inventory/stock-card decisions](../../apps/backend/inventory/stock-card/decisions.md#answers-to-the-sa-handoff-sa-sc-114) (SA-SC-01…14), [ADR-0056](../../adr/0056-stock-card-report-in-inventory-service.md) (Proposed), contract [api-contract](../../apps/backend/inventory/stock-card/api-contract.md), backend items BE-SC-001…009 in [todo/stock-card.md](../../task/todo/stock-card.md). Differences the UI must know: own stock only in revision 1 (Memo Stock later, SQ-SC-03); no partial-source banner needed; Stock ID shown on Load / Memo Out Return and `null` on Memo Out (ADR-0055 D9 as amended 2026-11-21, which narrows ui-spec fact F-01); `description` is not sent; `vendorCount` and `accountId` added; leaf `stock-card` has VIEW, PRINT, EXCEL. No approval is implied.
