# API contract: lot-based stock (SA revision 1, approved 2026-11-20)

Conventions are unchanged:

- master: tRPC under `/api/master/trpc`, Zod `.strict()`, field-addressed `VALIDATION_FAILED`, domain errors as today;
- inventory: REST `/api/inventory/v1`, GMS error envelope;
- internal: service-token routes, 5 s timeout (2 s for picker reads), ≤ 4 sockets.

Consumers: FE-LOT-001…008 in [TODO](../../../../task/todo/lot-based-stock.md).

## Owner change 2026-11-21 (supersedes the parts below where they differ)

- `LotGroupRow.unitPrice` / `netUnitPrice` (Memo Stock) = the average of the lot's open items weighted by their open quantity in the price unit (2 / 4 dp); `amount` = Σ item amounts. The key no longer contains a price, so one lot may hold items of different prices.
- Own-stock rows are never merged: `lotKey` = `OS…` (one stock), `merged: false`, `refCount` 1.
- `stockId` is `null` only in Quotation, Reserve, Memo Out, Purchase and Memo Return outputs (and `stockIds: null[]` on Purchase save); Memo Receive, Load to Stock, Memo Outstanding, Memo Out Return and Sale return the real Stock ID (`""` / `null` on a lot line) and their searches match it again. Approve Center search: lot on the five documents, Stock ID on the others.

## Shared types

```ts
/** Opaque lot group key: "ML"|"MS"|"OL"|"OS" + 32 hex (md5) or 36-char uuid. Server-validated: /^(ML|OL)[0-9a-f]{32}$|^(MS|OS)[0-9a-f-]{36}$/ */
type LotKey = string;

type LotGroupRow = {
  lotKey: LotKey;
  source: "MEMO_STOCK" | "OWN_STOCK";
  lot: string;                         // "" for groups of one without lot
  merged: boolean;                     // ML/OL group (may hold several stock rows); false for MS/OS. No Stock ID or count is ever returned (owner Q-LOT-10)
  stoneCode: string; stone: string; shape: string; size: string; color: string;
  clarity: string; cutting: string; quality: string;
  cerType: string; cerNo: string;      // cerNo only for groups of one
  location: string;
  itemNote: string;                    // uniform: the note is part of the key (Q-LOT-04a)
  ref: { type: "MEMO_RECEIVE" | "LOAD"; id: string; docNo: string; docDate: string }; // newest
  refCount: number;
  pendingPcs: number; pendingWeightCt: string;   // group available (bucket per picker)
  priceUnit: "PER_CT" | "PER_PCS";
  unitPrice: string | null; netUnitPrice: string | null; amount: string | null; // Memo Stock only; null for own stock
  currency: string | null; vendor: { id: string; code: string; name: string } | null; // Memo Stock only
};

/** Server-side only (audit + service-to-service); never in a public browser response (owner Q-LOT-10). */
type LotAllocation = { seq: number; source: "MEMO_STOCK" | "OWN_STOCK"; stockUuid: string; stockId: string; pcs: number; weightCt: string; settledPcs: number; settledWeightCt: string; part?: "SOLD" | "IN_STOCK" };
```

Cursor: `base64url("YYYY-MM-DD|" + lotKey)`, ≤ 200 chars. Invalid → `VALIDATION_FAILED cursor invalid`.

## Master tRPC — new queries (additive)

| Procedure | Permission | Input | Output | Replaces (after FE switch) |
|---|---|---|---|---|
| `memoStock.lots` | VIEW on `memo-return` or `memo-receive` (as `memoStock.list`) | `{ vendorId, currency, q?, from?, to?, cursor?, limit ≤ 50 }` | `{ items: LotGroupRow[], nextCursor }` (bucket = pending) | `memoStock.list` in Memo Return; `memoStock.list` itself stays for any remaining reader until removed |
| `fromStock.lots` | VIEW on any of `quotation`, `reserve`, `memo-out`, `sale` | `{ q?, from?, to?, location?, cursor?, limit ≤ 50 }` | `{ items: LotGroupRow[], nextCursor, ownStock: "OK" \| "UNAVAILABLE" }` | `fromStock.list` and the Sale From Stock read of `memoStock.list` |
| `purchase.memoStockLots` | `purchase:VIEW` | `{ vendorId, currency, group: "ALL" \| "SOLD" \| "IN_STOCK", q?, from?, to?, cursor?, limit ≤ 50 }` | `{ items: (LotGroupRow & { memoGroup: "SOLD" \| "IN_STOCK"; soldOpenPcs; soldOpenWeightCt })[], counts: { sold, inStock }, nextCursor }` (SOLD rows first as today) | `purchase.memoStock` |

Filters: the group is returned when any of its open rows matches `q` (lot, stone, stone code, cer no, ref doc no; **not Stock ID**, Q-LOT-10a) or the date range on the ref date. Quantities always cover all of the group's open rows. `location` behaves as in D16.

## Master tRPC — changed inputs (save) and outputs (get)

Stock lines of `quotation`, `reserve`, `memoOut`, `memoReturn` and `purchase` save inputs accept **either** the existing item reference or a lot:

```ts
type StockLineRef =
  | { source: "STOCK"; memoStockId: string }          // legacy; still accepted only when the same line already exists on the stored document (Q-LOT-09)
  | { source: "OWN_STOCK"; ownStockId: string }        // legacy, same rule
  | { source: "STOCK" | "OWN_STOCK"; lotKey: LotKey }; // new picks
// purchase adds memoGroup: "SOLD" | "IN_STOCK" | "MERGED" (ADR-0043 per lot)
```

- New lines with an item id → `VALIDATION_FAILED lines.N.reference lot_required`. A lot whose prefix does not match the source → `lines.N.reference invalid`.
- Save validation (no locks):
  - the group exists (`STOCK_LOT_UNAVAILABLE` 422 with `lines.N.reference`);
  - for Memo Return and Purchase, the group's vendor and currency match the document (`lines.N.reference vendor_mismatch | currency_mismatch`);
  - pcs/weight ≤ group available plus this document's own applied allocation (`exceeds_pending`).
- `get` lines add:
  - `lotKey: LotKey | null`;
  - `allocated: boolean` (true once applied; the allocation itself is not returned, Q-LOT-10);
  - legacy lines also return `lot` and details as today;
  - `stockId` is **removed** from public line outputs (all documents, Approve Center previews, Memo Receive / Load to Stock subject to Q-LOT-17).
- `memoOutstanding` (Memo Out Return picker) rows add `lotKey` and drop `stockId` (one row per Memo Out line; no allocation detail).

Errors: the existing short codes (`MEMO_OUT_PENDING_SHORT`, `RESERVE_PENDING_SHORT`, `MEMO_RETURN_PENDING_SHORT`, `PURCHASE_PENDING_SHORT`, `MEMO_OUT_RETURN_*`) now carry `details.lines[] = { index, lotKey, availablePcs, availableWeightCt }`. New: `STOCK_LOT_TOO_LARGE` (422) and `STOCK_LOT_UNAVAILABLE` (422). See [error-handling](error-handling.md).

## Inventory internal (master → inventory, `MASTER_INVENTORY_SERVICE_TOKEN`, ≤ 4 in flight)

| Route | Input | Output | Notes |
|---|---|---|---|
| `POST /internal/v1/master/stock/lots/available` | `{ q?, from?, to?, location?, cursor?, limit ≤ 51 }` | `{ items: LotGroupRow[] }` (source OWN_STOCK, bucket on_hand, no price/cost) | For `fromStock.lots`; 2 statements on `stock_lot_open_idx`; 2 s |
| `POST /internal/v1/master/stock/lots` | `{ lotKeys: LotKey[] ≤ 200 (OL/OS only) }` | `{ groups: { lotKey, rows: { stockUuid, stockId, refDocDate, onHandPcs, onHandWeightCt, loadSyncing: boolean }[] ≤ 500 }[] }` FIFO order; > 500 → `422 STOCK_LOT_TOO_LARGE` | Read-only snapshot for master allocation; no lock |
| `PUT /internal/v1/master/stock-holds/{type}/{id}` | **unchanged** (per-stock set) | unchanged | inventory guard authoritative |
| `POST /internal/v1/master/stock/batch` | unchanged | unchanged | legacy own-stock lines |

## Master internal (inventory → master, `INVENTORY_MASTER_SERVICE_TOKEN`)

`PUT /internal/v1/inventory/sale-consumptions/{saleId}`, **v2 (additive)**:

```ts
lines: (
  | { lineId; source: "RESERVE"; reserveLineId; pcs; weightCt }                  // master settles reserve_line_alloc oldest first
  | { lineId; source: "STOCK"; memoStockId; pcs; weightCt }                      // legacy line
  | { lineId; source: "STOCK"; lotKey; pcs; weightCt }                           // new: master allocates FIFO
)[]
// response / stored result adds:
allocations: { lineId: string; rows: LotAllocation[] }[]
```

- Set semantics, revision, hash, replay, `SALE_CONSUMPTION_STALE`, `SALE_CONSUMPTION_IN_USE` (release below purchased per stock) and `SALE_CONSUMPTION_LINE_UNAVAILABLE` are unchanged.
- Short → `409 SALE_CONSUMPTION_EXCEEDS_AVAILABLE` with `details.lines[] {lineId, availablePcs, availableWeightCt}`.
- `POST /internal/v1/inventory/sale/prepare` accepts `lotKey` references. It returns the group snapshot and available quantity (no lock).
- `GET /internal/v1/inventory/sale/reserve-lines` (From Reserve picker) adds `lotKey`; inventory drops `stockId` from its public picker rows.

## Inventory public (Sale, REST)

- `POST/PUT /api/inventory/v1/sale` STOCK lines accept `lotKey` (new) or `memoStockId` (legacy line already on the stored sale).
- `GET /sale/{id}` lines add `lotKey` and `allocated`; `stockId` and allocations are not returned (`sale_line_alloc` kept for audit and reports).
- The Sale From Stock picker reads master `fromStock.lots` (`sale:VIEW` is added to it).

## Compatibility and removal

Done with FE-LOT-008 (2026-11-21, INV-20261121-002 H2):

1. `memoStock.list`, `fromStock.list` and `purchase.memoStock` are **removed**, with their schemas, `FromStockService`, `MemoStockService.list`, the inventory-internal `POST /stock/available` (`availablePage`) and the master client `available`. The frontend calls only `memoStock.lots`, `fromStock.lots` and `purchase.memoStockLots`.
2. `ACCEPT_NEW_ITEM_REFERENCES = false` (`trade-document/lot-key.ts`): a **new** stock line of Quotation, Reserve, Memo Out, Memo Return or Purchase that names an item id is refused with `400 VALIDATION_ERROR lines.N.reference lot_required`. The same item already on the stored document stays accepted, so saved documents keep loading, saving, submitting and approving (Q-LOT-09). The Sale REST input still accepts `memoStockId` (legacy lines; its lot path is optional). The only seam is `LOT_TEST_ACCEPT_ITEM_REFS=1` under Vitest.
3. Mixed deploy order: master first, then inventory (see the release note in [database-diagram](database-diagram.md)), then frontend.
4. `stockId` is `null` only in Quotation, Reserve, Memo Out, Purchase and Memo Return outputs (owner 2026-11-21 Q3); elsewhere it is the real value. Approve Center search matches the lot on those five documents and the Stock ID on the others.
