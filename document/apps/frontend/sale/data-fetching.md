# Frontend data flow: sale

- UI revision: 1 (pending-review)
- Related shared/SA API contract: **none yet**. Requested in the [SA handoff](../../../coordination/handoffs/sale-sa.md) (SA-SL-01…12). Patterns: [reserve contract](../../backend/master/reserve/api-contract.md), [purchase decisions](../../backend/master/purchase/decisions.md), [memo-out-return decisions](../../backend/master/memo-out-return/decisions.md) (picking lines of another approved document), [ADR-0052 D15](../../../adr/0052-load-to-stock-in-backend-api-inventory.md) (own stock).
- Backend requirement: **requires-sa**. No Sale table, router, `MasterMenu` entry or approval type exists (C, 2026-11-18). Procedure names below assume master tRPC (`sale.*`); if SA places Sale in inventory (Q-SL-02), the same operations become inventory REST calls behind the same hooks.

| UI action / TODO ID | Existing or proposed operation | Input / output | Query key / cache | Loading / error / empty | Backend owner |
|---|---|---|---|---|---|
| Customer + addresses, stone lists (I-02…04) | **proposed** `sale.options` (Quotation options shape, as `reserve.options`) | `{ customerId? }` / `{ customers[], stone… }` | tRPC key | Field message | SA-SL-02 |
| Currency, Selling Rate (I-06/07) | **existing** `currency.options`, grant `sale:VIEW` | — / `{ items, baseCode }` | staleTime 60 s (C) | Field message | SA-SL-02 (grant) |
| Number preview (H-01) | **proposed** `sale.nextNumber` (Document Setup key `sale`, exists) | `{ docDate }` / `{ docNo }` | new document only; staleTime 10 s (C) | "—" | SA-SL-02 |
| Daybook (R-01) | **proposed** `sale.list` | `{ limit ≤ 50, cursor?, deleted? }` / items + `nextCursor` | invalidated after each write | `DocumentDaybook` states (C) | SA-SL-02 |
| Open saved (H-*) | **proposed** `sale.get` | `{ id }` / document + `version` + flow status + deleted info | keyed by id; remount on `id:version` (C) | Loading / not found / error | SA-SL-02 |
| Save (H-05) | **proposed** `sale.create` / `sale.update` | header + ≤ 200 lines (each with `source` and `reserveLineId` or `memoStockId`) + charges; update `expectedVersion` | invalidate `sale.list/get/nextNumber`, `sale.reserveLines`, `memoStock.list` | "Saving…", Save disabled while busy | SA-SL-03 |
| Send to approve / Restore / Delete | **proposed** `sale.submit`, `sale.restore`, `sale.delete` (ADR-0050 / ADR-0045 shapes) | `{ id, expectedVersion }` | as Save | confirm modal (C) | SA-SL-07 |
| Approve / Revise / Reject | **proposed** Approve Center registry entry `sale` (existing `approval.*` procedures) | as other documents | invalidate approve-center queries | Approve page | SA-SL-07/08 |
| From Reserve picker (P-01) | **proposed** `sale.reserveLines` | `{ customerId, currency, limit 50, cursor?, q?, from?, to? }` / rows `{ reserveLineId, reserveId, reserveNo, reserveDate, dueDate, stockId, lot, location, stone…, cerType, cerNo, priceUnit, netUnitPrice, openPcs, openWeightCt }` + `nextCursor` | infinite query, enabled only with customer + currency; staleTime 10 s | dialog loading / "No open reservations for this customer in {currency}." / error + Retry | SA-SL-04 |
| From Stock picker (P-02), phase 1 | **existing** `memoStock.list`, grant `sale:VIEW` | as Reserve today | infinite query (C `useMemoStock`) | "No stock with anything pending." (C) | SA-SL-05 (grant) |
| From Stock own stock, phase 2 | **planned** inventory `GET /api/inventory/v1/stock/available` (ADR-0052 D15) + a sale consume path | keyset ≤ 50 | separate section/tab | — | SA-SL-06 (later revision) |
| Line photos (T-05) | **proposed** sale line photo routes (ADR-0048 pattern) | upload / read | as Reserve | as Reserve | SA-SL-09 |
| Decimal places | **existing** `decimalSetup.get` via `NumberFormatProvider` | — | provider (C) | defaults | none |

## Bounds and races

- Pickers page 50 rows; search debounced 250 ms; a document holds ≤ 200 lines (C `LINES_MAX`).
- `expectedVersion` on update, submit, delete, restore and approve; a stale version shows the conflict message and keeps edits.
- Save checks availability without a lock and moves nothing. Approve re-checks under row locks (Reserve line and Memo Stock rows, in id order). Two sales may name the same reserve line or stock item; only the first approval succeeds; the second gets the "not enough available" error (Reserve / Purchase pattern, C).
- Independent UI (FE-SL-001/003/004/005 layout and form model) can be built against typed fixtures in tests only; **no mock store or fake Save** (Purchase Q-PU-01 rule). Wiring waits for the approved SA bundle and backend completion.
