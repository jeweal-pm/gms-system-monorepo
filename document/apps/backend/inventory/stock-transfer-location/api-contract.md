# API contract: inventory / stock-transfer-location (SA revision 1, approved 2026-11-24 with ADR-0060)

- Decision record: [ADR-0060](../../../../adr/0060-stock-transfer-location-document.md) (Accepted, owner "อนุมัติ" 2026-11-24). TODO: [task/todo/stock-transfer-location.md](../../../../task/todo/stock-transfer-location.md).
- Public base: `/api/inventory/v1` (browser → nginx → `backend-api-inventory:3301`). REST JSON, `Cache-Control: no-store`.
- Conventions are exactly those of the [load-to-stock api-contract](../load-to-stock/api-contract.md#conventions): cookie auth, CSRF on every POST/PUT, decimals as strings, `expectedVersion`, keyset `limit` 1–50 + opaque `cursor`, strict Zod, JSON ≤ 256 KiB, and the error envelope. The approval shapes are the same as [sale](../sale/api-contract.md).
- Permission leaf: `stock-transfer-location` (VIEW / ADD / EDIT / DELETE / APPROVE).

## Types

```ts
type Status = "DRAFT" | "PENDING_APPROVAL" | "REVISION_REQUESTED" | "APPROVED" | "REJECTED";
type Dec = string;
type PriceUnit = "PER_CT" | "PER_PCS";
type StoneAttrs = { stoneCode: string; stone: string; shape: string; size: string; color: string; clarity: string;
  cutting: string; quality: string; lot: string; location: string; cerType: string; cerNo: string };
type Approval = /* same as sale api-contract */ { requireApproval: boolean; autoApproved: boolean; revisionCount: 0 | 1;
  submitted: { at: string; by: string; byName: string | null } | null;
  review: { action: "REJECT" | "REVISE"; note: string; at: string; by: string; byName: string | null } | null };

type StockLot = {                 // From Stock picker row (one own lot = one Stock ID, ADR-0055)
  stockUuid: string; stockId: string; lotKey: string; refDocNo: string; refDocDate: string;
  location: string; priceUnit: PriceUnit; stockPrice: Dec; currency: string;
  onHandPcs: number; onHandWeightCt: Dec; attrs: StoneAttrs };

type LineInput = {
  id?: string;                    // existing line on update
  fromStockUuid: string;          // unique per document (one lot per row)
  onHandPcs: number;              // snapshot shown in PCS when picked
  onHandWeightCt: Dec;            // snapshot shown in WEIGHT when picked
  toLocation: string;             // active Location Master name, ≠ the stock's location
  pcs: number;                    // int, 0..onHandPcs
  weightCt: Dec;                  // 0..onHandWeightCt, 3 dp; pcs > 0 or weightCt > 0
  remark?: string;                // ≤ 250
};
type TransferInput = { docDate: string /* YYYY-MM-DD */; ref: string /* ≤ 100 */; note?: string /* ≤ 250 */;
  lines: LineInput[] /* 1–200 */ };

type LineOut = Required<LineInput> & { id: string; position: number; stockId: string; newStockId: string | null;
  lotKey: string; refDocNo: string; fromLocation: string; priceUnit: PriceUnit; stockPrice: Dec; currency: string;
  attrs: StoneAttrs };
type TransferOut = { id: string; docNo: string | null; docDate: string; ref: string; note: string; status: Status;
  autoApproved: boolean; version: number; deleted: boolean; approval: Approval; lines: LineOut[] };
```

## Public endpoints (`/api/inventory/v1`)

| Method / path | Grant | Input | Output | Notes |
|---|---|---|---|---|
| `GET /stock-transfer-location/options` | VIEW | — | `{ locations: string[], numbering: { configured: boolean } }` | locations from `master.reference()` (cached) |
| `GET /stock-transfer-location/next-number?docDate=` | VIEW | `docDate` | `{ docNo }` | preview, nothing reserved |
| `GET /stock-transfer-location?status=&deleted=false&q=&cursor=&limit=` | VIEW | `q` ≤ 100 (doc no / ref) | `{ items: {id, docNo, docDate, ref, status, lineCount, totalPcs, totalWeightCt, autoApproved, deleted}[], nextCursor }` | daybook, newest first |
| `GET /stock-transfer-location/{id}` | VIEW | — | `TransferOut` | 404 `STOCK_TRANSFER_NOT_FOUND` |
| `GET /stock-transfer-location/stock?q=&location=&exclude=&cursor=&limit=` | VIEW | `q` ≤ 100 (Stock ID, lot, stone code, ref doc no); `location` optional; `exclude` ≤ 200 stockUuid (comma list or repeated) | `{ items: StockLot[], nextCursor }` | own stock only, ACTIVE, on hand > 0, oldest `refDocDate` first |
| `POST /stock-transfer-location` | ADD + CSRF | `TransferInput` | `201 { id, docNo, version, status }` | approval OFF → applied, `APPROVED`; ON → `DRAFT` |
| `PUT /stock-transfer-location/{id}` | EDIT + CSRF | `TransferInput & { expectedVersion }` | `{ id, version, status }` | DRAFT / REVISION_REQUESTED, or auto-approved (reverse + re-apply in one tx) |
| `POST /stock-transfer-location/{id}/submit` | ADD or EDIT + CSRF | `{ expectedVersion }` | `{ id, version, status: "PENDING_APPROVAL", submittedAt }` | approval ON only; read-only re-check |
| `POST /stock-transfer-location/{id}/approve` | APPROVE + VIEW + CSRF | `{ expectedVersion }` | `{ id, version, status: "APPROVED" }` | applies |
| `POST /stock-transfer-location/{id}/request-revision` | APPROVE + CSRF | `{ expectedVersion, note /* 1–500 */ }` | `{ id, version, status: "REVISION_REQUESTED" }` | once |
| `POST /stock-transfer-location/{id}/reject` | APPROVE + CSRF | `{ expectedVersion, reason /* 1–500 */ }` | `{ id, version, status: "REJECTED" }` | final |
| `POST /stock-transfer-location/{id}/delete` | DELETE + CSRF | `{ expectedVersion }` | `{ id, version }` | soft delete; applied → reverse first |
| `POST /stock-transfer-location/{id}/restore` | DELETE + CSRF | `{ expectedVersion }` | `{ id, version, status: "DRAFT" }` | |

## Existing endpoints that gain the type
| Endpoint | Change |
|---|---|
| `GET/PUT /approval-settings[/{type}]` | type `stock-transfer-location` usable (turn-OFF refused while documents wait) |
| `GET /approval/summary` | `{ type: "stock-transfer-location", count }` for APPROVE + VIEW |
| `GET /approval/pending?type=stock-transfer-location…` | items `{ id, docNo, docDate, partyName /* ref or "" */, submittedAt, submittedByName, totalPcs, totalWeightCt, lineCount, revisionCount }` |
| Stock Card list/detail | kinds `TRANSFER_OUT`/`TRANSFER_IN`(+`_REVERSAL`), doc type `stock-transfer-location`, caption "Stock Transfer Location", Account `→ <to>` on OUT / `← <from>` on IN; DOC NO opens `/inventory/stock-transfer-location/{id}` |

## Errors (envelope `{ error: { code, message, details? } }`)

| HTTP | Code | details |
|---|---|---|
| 400 | `VALIDATION_FAILED` | `fieldErrors` (`[{ path: "lines.N.<field>", code }]`, lines in the order sent) |
| 403 | `PERMISSION_DENIED` | — (platform auth code, as every inventory route; `CSRF_INVALID` for a refused origin) |
| 404 | `STOCK_TRANSFER_NOT_FOUND` | — |
| 409 | `VERSION_CONFLICT` | `{ currentVersion }` |
| 409 | `STOCK_TRANSFER_EXCEEDS_ON_HAND` | `{ lines: [{ lineId, rowPath, onHandPcs, onHandWeightCt }] }` (live on hand) |
| 409 | `STOCK_TRANSFER_IN_USE` | `{ stockIds }` (new or source Stock IDs, ≤ 20) |
| 409 | `STOCK_TRANSFER_STATUS` | `{ status }` (`DELETED` for a deleted document) |
| 409 | `STOCK_TRANSFER_APPROVAL_OFF` | — (submit while approval is OFF) |
| 409 | `STOCK_TRANSFER_REVISE_LIMIT` | — (second request-revision) |
| 422 | `STOCK_TRANSFER_LINE_UNAVAILABLE` | `{ lineIds, lines: [{ lineId, rowPath }] }` (not ACTIVE / not own stock / location moved) |
| 422 | `LOCATION_INVALID` | `{ lineIds, lines: [{ lineId, rowPath }] }` (unknown, inactive or equal to the source location) |
| 422 | `NUMBERING_NOT_CONFIGURED` | — (reserved, not returned; see "As built") |
| 502/503 | `MASTER_UNAVAILABLE` | — |

## As built (backend 2026-11-27, BE-STL-001…006)

Deviations / precisions found while implementing; the frontend alignment notes of 2026-11-27 are included.
- **Line ids in error details:** `lineIds[]` / `lines[].lineId` is the saved line id, or the line's `fromStockUuid` for a line not saved yet (a POST create, or a new line in a PUT). `rowPath` is `lines.N` in the order the lines were sent.
- **Validation:** this module answers `400 VALIDATION_FAILED` (same `fieldErrors` shape as the platform's `422 VALIDATION_ERROR`, which older modules keep). An invalid `cursor` is `400 VALIDATION_FAILED` too.
- **Numbering not configured:** like Load to Stock and Sale, the number falls back to a plain running number (`1`, `2`, …) when no Document Setup row is in effect; `options.numbering.configured` reports it. `NUMBERING_NOT_CONFIGURED` is never returned.
- **`ref`** may be omitted (defaults to `""`); `remark` defaults to `""`.
- **Delete** also accepts `REJECTED` (as Sale); an approver-approved (not auto) document can't be edited or deleted (`STOCK_TRANSFER_STATUS`). Restore clears the approval / submission fields and returns `DRAFT`; Save of that DRAFT while approval is OFF applies it.
- **Notifications** (ADR-0050 flow): submit → approvers (`approval.pending`), approve / revise / reject → creator, `documentType: "stock-transfer-location"`.
- **Approve Center pending sort:** `party` = Ref, `qty` = total weight, `value` = total pcs (a transfer has no value of its own).
- **Load to Stock side effect (D9 integrity):** a Load whose stock was transferred (a row born by a transfer, or a source with an ACTIVE transferred row) is "in use": its edit / delete is refused with `LOAD_TO_STOCK_IN_USE` and `inUse` is true on its detail.
- **Ledger:** `stock_movement.kind` widened to `VARCHAR(32)` (`TRANSFER_OUT_REVERSAL` has 21 characters).

## Master internal (new, `/internal/v1/inventory/*`, token as existing inventory → master calls)

| Endpoint | Body | Response |
|---|---|---|
| `POST /document-numbering/resolve` | `transactionKey` allow-list adds `"stock-transfer-location"` | unchanged |
| `PUT /stock-id-issues/{documentType}/{documentId}` | `{ revision: int ≥ 1, count: int 1–200 }` | `{ revision, stockIds: string[], replayed: boolean }`. Idempotent per (documentType, documentId, revision): the same revision returns the first `count` stored ids (`replayed: true`); asking for more than stored appends only the missing ids. A lower revision → `409 STOCK_ID_ISSUE_STALE {appliedRevision}` (inventory maps it to `409 VERSION_CONFLICT`). Unknown `documentType` → 404. Reuses `issueStockIds`; table `partner.stock_id_issue` |
