# Handoff: load-to-stock phase 2 (ADR-0052 D15 2a + 2b) → SA

- feature-id: `load-to-stock` (Phase 2); UI revisions: quotation 3, reserve 2, memo-out 4, memo-out-return 5 — **pending-review** (no approval yet)
- owner 2026-11-18 (verbatim): "2a + 2b เลย", "งั้นทำ ก" (Q-LS-36 A: inventory stays stock owner), "ตามFrom Stock เดิมให้ user ดูที่ location เองว่าเป็น memo หรือ ของจากคลังเรา" (one list, no tabs)
- UI source: [quotation ui-spec Revision 3](../../apps/frontend/quotation/ui-spec.md#revision-3--own-stock-in-from-stock-load-to-stock-phase-2--pending-review) (shared picker), reserve/memo-out/memo-out-return revisions; TODO [load-to-stock Phase 2](../../task/todo/load-to-stock.md#phase-2--own-stock-in-from-stock)
- allowed SA paths: `document/apps/backend/inventory/load-to-stock/**` (or a new `.../stock-picker/` bundle), `document/apps/backend/master/{quotation,reserve,memo-out,memo-out-return}/**`, `document/adr/0052-*` (D15 revision), `document/task/todo/load-to-stock.md` (backend rows, via parent)

## Required SA design (SA-LS-P2-01…06)

| ID | Need |
|---|---|
| SA-LS-P2-01 | Revise D15 picker text: **one merged list**, not two tabs (owner 2026-11-18). Browser-side merge of two keyset streams; no merged server cursor needed |
| SA-LS-P2-02 | `GET /api/inventory/v1/stock/available`: `q` (Stock ID, Stone, Cer No.), `from`/`to` on Load Doc Date, **order Load Doc Date desc, Stock ID desc** with matching keyset (Q-LS-P2-01; Memo Stock picker must expose the same key order), `limit ≤ 50`, available pcs > 0 only; row fields: `stockUuid, stockId, stoneCode, location, loadNo, loadDocDate, stone, shape, size, color, clarity, cutting, quality, cerType, cerNo, priceUnit, itemNote, availablePcs, availableWeightCt` (no cost). Excluding already-picked ids stays client-side |
| SA-LS-P2-03 | Master line source `OWN_STOCK` (`stock_uuid`, Stock ID + Location + stone snapshot) on Quotation, Reserve, Memo Out; Memo Out Return lines referencing OWN_STOCK Memo Out lines; Memo Outstanding (customer) query returns `location` |
| SA-LS-P2-04 | Save validation via `POST /internal/v1/master/stock/batch` (new/raised rows); error codes for above-available / gone / `INVENTORY_UNAVAILABLE` (503) with row paths, matching the UI texts |
| SA-LS-P2-05 | Phase 2b saga: holds RESERVED / MEMO_OUT / return at Approve or auto-approved Save; `sync_state` exposed on document get/list for the "Updating our stock…" hint (Q-LS-P2-05) |
| SA-LS-P2-06 | Infra/devops delta already named in [load-to-stock-infra-devops](load-to-stock-infra-devops.md) (`master_inventory_service_token`); capacity per D14 (no new container, 4 GB / 2 vCPU) |

Return: SA revision for owner approval; FE-LS-P2-* stay blocked on it where marked requires-sa.

## SA response (SA revision 2, pending-review, 2026-11-18)

- SA-LS-P2-01/02: **merge in master** via tRPC `fromStock.list` (existing single cursor; order Ref. Doc Date desc, Stock ID desc as Q-LS-P2-01). No public `GET /api/inventory/v1/stock/available`. FE-LS-P2-01 changes to `fromStock.list`; FE-LS-P2-02 dropped; FE-LS-P2-03 uses `ownStock: "UNAVAILABLE"`; FE-LS-P2-04 payload `ownStockId`.
- Our-stock picker rows carry `lot` (owner Q-LS-P2-02 answer, ADR-0052 D23), no price (Q-LS-P2-03 adopted).
- SA-LS-P2-03…06: ADR-0052 Amendment 2 D17–D22; `syncState` on get and list; Memo Outstanding returns `location` + `source`.
- Bundle and BE-LS-P2-* items: [api-contract](../../apps/backend/inventory/load-to-stock/api-contract.md#phase-2-sa-revision-2-proposed), [TODO](../../task/todo/load-to-stock.md#phase-2--own-stock-in-from-stock).
