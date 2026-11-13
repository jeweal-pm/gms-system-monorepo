# Service architecture: master / purchase

- Feature ID / SA revision: `purchase` / 1
- Source UI revision / TODO: UI rev 1 (approved 2026-11-04) plus the UI rev 2 pickers being specified in parallel / [purchase.md](../../../../task/todo/purchase.md)
- Status: **approved** 2026-11-04. Evidence and SA defaults: [decisions.md](decisions.md).
- ADR / main flow / review bundle: [ADR-0042](../../../../adr/0042-purchase-document-and-stock-deduction.md), [purchase-flow](../../../../diagram/purchase-flow.md), [decisions](decisions.md), [api-contract](api-contract.md), [authorization](authorization.md), [database-diagram](database-diagram.md), [sequence-diagram](sequence-diagram.md), [error-handling](error-handling.md), [dependencies](dependencies.md), [testing](testing.md)

## Domain and service boundaries

- **Owner:** `backend-api-master`, with a new module `src/purchase/` (`purchase.schemas.ts`, `purchase.service.ts`, `purchase-stock.ts` for the take / give-back moves, and `purchase-pickers.ts` for the two picker queries). Data lives in schema `partner`, which master owns (ADR-0027).
- **Reuses, unchanged:** `TradeDocumentEngine` (create, update, list, get and nextNumber via `prepare` and a `LineHook`), `vendorParty` / `vendorDocumentOptions`, the quotation calculator and `discountBoundRules`, `issueStockIds` (shared `YY####` counter), `totalPerItem`, `documentErrors`, `WRITE_TX`, `escapeLike`, cursor helpers and the ADR-0031 auth context.
- **Small, backward-compatible edits:**
  - ~~`issueStockIds` takes an optional `exhausted` error factory for Purchase.~~ Removed by ADR-0051: Purchase issues no Stock IDs; Memo Receive is the only caller.
  - `document-numbering.ts` gains the `purchase` kind.
  - `authorization.ts` `MasterMenu` gains `"purchase"`.
  - `router.ts` gains the `purchase` router and `purchase` in the `currency.options` any-of list.
  - `trpc-handler.ts` passes `PurchaseService` as its new last constructor parameter.
  - `app.module.ts` registers the provider (parent-owned).
- **Writers it adds:** `memo_stock.pending/sold/purchased` (STOCK lines) and `purchase_order_line.purchased_*` (PO lines; SA-PO-05 names Purchase the only writer). Every other writer is unchanged.
- **Not touched:** `backend-api-auth` (the catalog leaf `purchase` already exists), nginx (no photos or uploads), `memoStock.list`, and the Memo Outstanding services. Memo Outstanding › Vendor needs no code change (SA-PU-05).
- **Public interface:** tRPC `purchase.*` only. There is no REST and no photo route.

## Behaviour and operation

- **Timing (SA default D2):** check at Save, cut at Approve (Q-MR-15, as Memo Return, Memo Out and Reserve).
- **Create / update:** the engine transaction. The `prepare` hook completes source lines from the database, by primary key and without a lock. It checks vendor, currency, PO status and duplicates, and checks the quantity against current availability (`exceeds_available`). It moves no stock. The line hook writes source columns, the Stock ID (STOCK lines: the item's; MANUAL / PO: NULL, ADR-0051) and the copied PO stone code id. That id is set after the engine's stone-code check, so a PO line whose stone code became inactive still copies.
- **Delete:** the engine `delete`, unchanged. Pending only, and no stock.
- **Approve:** `PurchaseService.approve`. In one `WRITE_TX`:
  1. A guarded status update.
  2. `takeForPurchase(tx, lines)` in `purchase-stock.ts`, which sums per key, locks `memo_stock`, then `purchase_order_line` (in id order, `FOR UPDATE`), re-checks PO status, vendor and currency, guards every key, and runs at most two `UPDATE … FROM (VALUES …)` statements.

  A short → `PURCHASE_PENDING_SHORT` and the whole transaction rolls back. This is the `memoReturn.approve` / `takeFromMemoStock` pattern. Purchase owns its SQL, because it writes the extra `purchased_*` columns and the PO table.
- **Pickers:** read-only `$queryRaw` with the `Prisma.sql` builder and fixed SQL fragments. No user text is interpolated. One page query (`LIMIT limit + 1`) per call, plus one count query for `purchase.memoStock`.
- **Logging:** `purchase.created|updated|deleted|approved`, `{actorId, id, docNo?, version?, lineCount, memoStockKeys, purchaseOrderKeys}`. `purchase.db_unavailable` with the operation and Prisma code. Never prices, quantities, vendor names or notes.
- **Timeouts and retries:** `WRITE_TX` 4 s / maxWait 2 s. Reads retry once on the client (`retryTransient`). Writes are never retried automatically.

## Capacity and rollout (4 GB / 2 vCPU host, ADR-0024)

- **Load:** a save is one transaction with ≤ 200 lines, ≤ 2 primary-key source reads and the engine inserts. An approve holds ≤ 200 `memo_stock` row locks and ≤ 200 `purchase_order_line` row locks for a few milliseconds and runs ≤ 2 bulk updates. Pickers and the list are keyset ≤ 50 on partial indexes. One `count(*) FILTER` runs over one vendor's open items, which are hundreds to low thousands.
- **Pool and memory:** no new connections (the shared Prisma pool of api-master), no cache, no job, no container. api-master stays at 0.25 vCPU / 384 MiB. The compose total is unchanged ([capacity](../../../../infra/capacity.md)).
- **Data:** see the [database diagram](database-diagram.md). Low MB per year.
- **Rollout order:** migration → master code (BE-PU-002…004) → frontend FE-PU-003…005. Nothing is mounted for the browser before the code ships, and the frontend already shows "not connected" without the API.
- **Measurement still needed:** approve latency at 200 STOCK lines on the disposable DB (target < 500 ms). This is recorded in IT-PU-B06.

## Container infrastructure

Not applicable. There is no service, image, network, volume, writable path, egress, secret or variable change, and no infra bundle (checked against [service-index](../../../../infra/service-index.md): api-master is unchanged). There is no devops handoff beyond the normal rebuild of the existing `backend-api-master` and `frontend` images.

## Upload / storage

Not applicable in revision 1. Line photos are off (Q-PU-11, `photoIds` max 0). A later photo revision must reuse `@gms/storage` with scope `files/purchase-photo/`, source `purchase.line-photo`, ADD/EDIT upload and VIEW read grants, and permanent retention (ADR-0030), as SA-PO-11 does.
