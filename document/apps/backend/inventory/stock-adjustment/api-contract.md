# API contract: inventory / stock-adjustment (SA revision 1, approved 2026-11-24)

- Public base: `/api/inventory/v1` (browser → nginx → `backend-api-inventory:3301`). REST JSON, `Cache-Control: no-store`.
- Conventions are exactly those of the [load-to-stock api-contract](../load-to-stock/api-contract.md#conventions): cookie auth, CSRF on POST/PUT, decimal strings, `expectedVersion`, keyset `limit` 1–50 + opaque `cursor`, strict Zod, JSON ≤ 256 KiB, and the error envelope.
- Errors: [error-handling](error-handling.md). Permissions: [authorization](authorization.md). Consumers: FE-SAJ items in [task/todo/stock-adjustment.md](../../../../task/todo/stock-adjustment.md).

## Shared types

```ts
type Status = "DRAFT" | "PENDING_APPROVAL" | "REVISION_REQUESTED" | "APPROVED" | "REJECTED";
type Dec = string;
type StoneAttrs = { stoneCode: string; stone: string; shape: string; size: string; color: string; clarity: string;
  cutting: string; quality: string; lot: string; location: string; cerType: string; cerNo: string };

type LineInput = {
  id?: string;                 // existing line on update
  stockUuid: string;           // inventory.stock.id (from the picker)
  stockPcs: number;            // snapshot shown in "Stock" (on hand when picked)
  stockWeightCt: Dec;
  physicalPcs: number;         // int ≥ 0
  physicalWeightCt: Dec;       // ≥ 0, 3 dp
  physicalPrice: Dec | null;   // ≥ 0, 2 dp; null = keep the stock price
  remark: string;              // ≤ 250
};
type AdjustmentInput = { docDate: string; location: string; ref: string /* ≤100 */; note: string /* ≤250 */;
  lines: LineInput[] /* 1–200, distinct stockUuid */ };

type LineOut = LineInput & { id: string; position: number; stockId: string; lotKey: string; refDocNo: string;
  priceUnit: "PER_CT" | "PER_PCS"; stockPrice: Dec; attrs: StoneAttrs;
  diffPcs: number; diffWeightCt: Dec; diffPrice: Dec };
type AdjustmentOut = { id: string; docNo: string | null; docDate: string; location: string; ref: string; note: string;
  status: Status; autoApproved: boolean; version: number; deleted: boolean; lines: LineOut[];
  approval: Approval /* same shape as sale */ };

type StockLot = { stockUuid: string; stockId: string; lotKey: string; refDocNo: string; refDocDate: string;
  priceUnit: "PER_CT" | "PER_PCS"; onHandPcs: number; onHandWeightCt: Dec; stockPrice: Dec; attrs: StoneAttrs };
```

## Public endpoints

| Method / path | Grant | Input | Output | Notes |
|---|---|---|---|---|
| `GET /stock-adjustment/options` | VIEW | — | `{ locations: string[], numbering: { configured: boolean } }` | 1 cached master call |
| `GET /stock-adjustment/next-number?docDate=` | VIEW | `docDate` | `{ docNo }` | preview only |
| `GET /stock-adjustment?status=&deleted=false&q=&cursor=&limit=` | VIEW | `q` ≤ 100 (doc no / location / ref) | `{ items: {id, docNo, docDate, location, status, lineCount, autoApproved, deleted}[], nextCursor }` | daybook, newest first |
| `GET /stock-adjustment/{id}` | VIEW | — | `AdjustmentOut` | 404 `STOCK_ADJUSTMENT_NOT_FOUND` |
| `GET /stock-adjustment/stock?location=&q=&exclude=&cursor=&limit=` | VIEW | `location` required; `q` ≤ 100 (Stock ID, lot, stone code, ref doc no); `exclude` ≤ 200 stockUuid | `{ items: StockLot[], nextCursor }` | own stock only, ACTIVE, on hand > 0, at `location`; oldest ref doc first |
| `POST /stock-adjustment` | ADD + CSRF | `AdjustmentInput` | `201 { id, docNo, version, status }` | approval OFF → APPROVED (applied); ON → DRAFT |
| `PUT /stock-adjustment/{id}` | EDIT + CSRF | `AdjustmentInput & { expectedVersion }` | `{ id, version, status }` | DRAFT/REVISION, or auto-approved: reverse, then re-apply in one tx |
| `POST /stock-adjustment/{id}/submit` | ADD or EDIT + CSRF | `{ expectedVersion }` | `{ id, version, status: "PENDING_APPROVAL", submittedAt }` | ON only; runs the stale check without applying |
| `POST /stock-adjustment/{id}/approve` | APPROVE + VIEW + CSRF | `{ expectedVersion }` | `{ id, version, status: "APPROVED" }` | applies |
| `POST /stock-adjustment/{id}/request-revision` | APPROVE + CSRF | `{ expectedVersion, note }` | `{ … "REVISION_REQUESTED" }` | once |
| `POST /stock-adjustment/{id}/reject` | APPROVE + CSRF | `{ expectedVersion, reason }` | `{ … "REJECTED" }` | final |
| `POST /stock-adjustment/{id}/delete` | DELETE + CSRF | `{ expectedVersion }` | `{ id, version }` | soft delete; effective → reverse first |
| `POST /stock-adjustment/{id}/restore` | DELETE + CSRF | `{ expectedVersion }` | `{ id, version, status: "DRAFT" }` | |

## Existing endpoints that gain the type
| Endpoint | Change |
|---|---|
| `GET/PUT /approval-settings[/{type}]` | type `stock-adjustment` |
| `GET /approval/summary` | `{type: "stock-adjustment", count}` for APPROVE + VIEW |
| `GET /approval/pending?type=stock-adjustment` | `{id, docNo, docDate, partyName /* location */, submittedAt, submittedByName, revisionCount, lineCount, totalDiffPcs, totalDiffWeightCt}` |
| Stock Card / Stock Value | `ADJUST`, `ADJUST_REVERSAL` rows; DOC NO opens `/inventory/stock-adjustment/{id}` |

## Master internal change
| Endpoint | Change |
|---|---|
| `POST /internal/v1/inventory/document-numbering/resolve` | allow-list `transactionKey` adds `"stock-adjustment"` |
