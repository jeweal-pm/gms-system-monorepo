# API contract: inventory / load-to-stock (SA revision 1, pending-review)

- Public base: `/api/inventory/v1` (browser, same origin through nginx → `backend-api-inventory:3301`). REST JSON, UTF-8, `Cache-Control: no-store` on every response.
- Internal base (master): `/internal/v1/inventory/*` on `api-master:3201`, never routed by nginx (nginx already rejects `/internal`).
- Decisions: [decisions](decisions.md); ADR: [ADR-0052](../../../../adr/0052-load-to-stock-in-backend-api-inventory.md); errors: [error-handling](error-handling.md); permissions: [authorization](authorization.md).
- Consumers: FE-LS-002…011, FE-LS-014…016 in the [central TODO](../../../../task/todo/load-to-stock.md).

## Conventions

- **Auth:** access cookie (JWT, ADR-0026) on every public route. **Mutations** (`POST`/`PUT`) also need a trusted `Origin` (or `Sec-Fetch-Site: same-origin`) — CSRF as ADR-0031.
- **Numbers:** quantities and money are JSON **strings** in decimal form (`"12.345"`, `"52490.00"`), never floats. Pcs are integers. Weight ≤ 3 dp, money ≤ 2 dp, unit cost ≤ 4 dp. Dates `YYYY-MM-DD` (Asia/Bangkok business date); timestamps ISO-8601 UTC.
- **Optimistic version:** every change of an existing document sends `expectedVersion` (int ≥ 1); stale → `409 LOAD_TO_STOCK_CHANGED`.
- **Pagination:** keyset; `limit` 1–50 (default 50); `cursor` opaque ≤ 300 chars; response `{ items, nextCursor: string | null }`.
- **Errors:** `{ error: { code, message, requestId, details? } }`; validation `details.fieldErrors: [{ path, code, params? }]` (paths like `rows.3.pcs`). Codes in [error-handling](error-handling.md).
- **Bodies:** JSON ≤ 256 KiB (photos: multipart ≤ 5 MiB); unknown keys refused (strict Zod).

## Shared types

```ts
type Status = "DRAFT" | "PENDING_APPROVAL" | "REVISION_REQUESTED" | "APPROVED" | "REJECTED";
type Mode = "NONE" | "SPLIT" | "MERGE";
type PriceUnit = "PER_CT" | "PER_PCS";
type Dec = string;          // decimal string

type StoneAttrs = {
  stoneCodeId: string | null; stoneCode: string;           // snapshot text
  stone: string; shape: string; size: string;
  color: string; clarity: string; cutting: string; quality: string;
  lot: string; cerType: string; cerNo: string;              // each ≤ 60 (lot ≤ 40, cerType ≤ 20)
};

type PurchaseLineRef = StoneAttrs & {
  purchaseLineId: string;
  purchase: { id: string; docNo: string; docDate: string; currency: string; rate: Dec /* to the company currency; "1" when equal */ };
  location: string;                                          // PU line text (Item table IT-3)
  priceUnit: PriceUnit;
  unitPrice: Dec;                                            // as entered on the PU, PU currency
  netUnitPrice: Dec;                                         // after line discount, PU currency (4 dp)
  unitCostBase: Dec;                                          // netUnitPrice × rate (4 dp)
  pcs: number; weightCt: Dec;                                // PU line quantity
  remainingPcs: number; remainingWeightCt: Dec;              // excluding this load's own applied allocation
  remainingAmountBase: Dec;
  photoCount: number;                                        // 0..5
  itemNote: string;
};

type Approval = {
  requireApproval: boolean; autoApproved: boolean; revisionCount: 0 | 1;
  submitted: { at: string; by: string; byName: string | null } | null;
  review: { action: "REJECT" | "REVISE"; note: string; at: string; by: string; byName: string | null } | null;
};
```

## Public endpoints

### Reference and settings

| Method / path | Permission | Input | Output | Notes / TODO |
|---|---|---|---|---|
| `GET /load-to-stock/options` | `load-to-stock:VIEW` | — | `{ companyCurrency: string, stone: StoneLineOptions /* same shape as master purchase.options.stone */, locations: {id, code, name}[] /* active, from master Location Master, ≤ 500 */ }` | one master call (`reference`), no local query. FE-LS-002/008 |
| `GET /load-to-stock/vendors?q=&cursor=&limit=` | VIEW | `q` ≤ 100 | `{ items: {id, code, name}[], nextCursor }` — vendors having ≥ 1 loadable line | Account select (I-02). FE-LS-003 |
| `GET /load-to-stock/next-number?docDate=YYYY-MM-DD` | ADD | — | `{ docNo: string }` preview (not reserved) | master `resolve` with `markUsed:false`. H-01 |
| `GET /approval-settings` | signed in + licensed | — | `{ items: {type, requireApproval, version, waitingCount?: {pending, revision}}[] }` for the 3 inventory types; counts only with `approval-setup:VIEW` | FE-LS-009, FE-LS-014 |
| `PUT /approval-settings/{type}` | `approval-setup:EDIT` + CSRF | `{ requireApproval: boolean, expectedVersion: int }` | `{ type, requireApproval, version }` | OFF refused while waiting: `APPROVAL_SETTING_HAS_WAITING` `{pending, revision}`. FE-LS-014 |

### Purchase line picker (P-01)

`POST /load-to-stock/purchase-lines/search` — VIEW (read; POST only because of the exclusion list; no CSRF needed but accepted).

```ts
type SearchInput = {
  vendorId?: string;                  // set once the document has a vendor (Q-LS-01)
  q?: string;                         // ≤ 100; matches PU no., stone code, lot, cer no. (ILIKE, escaped)
  from?: string; to?: string;         // PU doc date range, ≤ 366 days
  excludeLineIds?: string[];          // ≤ 200 distinct uuids
  excludeAllocationOf?: string;       // load id being edited: its own applied allocation counts as remaining
  cursor?: string | null; limit?: number;   // ≤ 50
};
type SearchOutput = { items: PurchaseLineRef[]; nextCursor: string | null; total: number /* capped 1000 */ };
```

Rows: lines of **approved, not deleted** Purchases, source `MANUAL` / `PURCHASE_ORDER`, with **remaining pcs > 0** (owner Q-LS-26; lines with pcs 0 are never listed). Order: PU doc date desc, PU id desc, line position asc. FE-LS-004.

### Documents

```ts
type RowInput = {
  id?: string;                                    // existing row id (update); keeps the Stock ID once issued
  sources: { purchaseLineId: string; pcs: number; weightCt: Dec }[];   // NONE/SPLIT: exactly 1; MERGE: ≥ 2 (server overwrites qty with full remaining)
  locationId: string;                              // required (Q-LS-11)
  parcel?: string;                                 // ≤ 50
  attrs: StoneAttrs;                               // editable in every mode
  stockPrice: Dec;                                 // required ≥ 0, company currency, per row price unit (Q-LS-13/23)
  salePrice: Dec;                                  // required ≥ 0
  itemNote?: string;                               // ≤ 500
  photoIds: string[];                              // ≤ 5 distinct, order = display
};
type LoadInput = {
  docDate: string;                                 // same rule as Purchase docDate; no future-date limit added
  vendorId: string;
  ref?: string;                                    // ≤ 100
  documentNote?: string;                           // ≤ 250
  mode: Mode;
  rows: RowInput[];                                // 1..200; Σ sources ≤ 200
};
type RowOut = Omit<RowInput, "sources"> & {
  id: string; position: number;
  stockId: string | null;                          // null = "Auto" (not issued yet)
  sources: { purchaseLineId: string; pcs: number; weightCt: Dec; costAmountBase: Dec }[];
  location: { id: string; code: string; name: string };   // snapshot taken at Save
  priceUnit: PriceUnit;                            // NONE/SPLIT: the source's; MERGE: Q-LS-27
  pcs: number; weightCt: Dec;
  unitCostBase: Dec; costAmountBase: Dec;            // read-only "Price" / "Amount"
};
type LoadOut = {
  id: string; docNo: string; status: Status; version: number;
  docDate: string; vendor: { id: string; code: string; name: string };
  currency: string;                                // company currency (Q-LS-23)
  ref: string; documentNote: string; mode: Mode;
  sources: PurchaseLineRef[];                      // Item table; remaining is live from master
  rows: RowOut[];
  totals: { rowCount: number; pcs: number; weightCt: Dec; costAmountBase: Dec };
  approval: Approval;
  inUse: boolean;                                  // some created stock is used → Edit/Delete disabled
  syncing: boolean;                                // a master sync is in progress → read-only, retry later
  deleted: { at: string; by: string } | null;
  created: { at: string; by: string }; updated: { at: string; by: string };
};
```

| Method / path | Permission | Input | Output | Notes / TODO |
|---|---|---|---|---|
| `GET /load-to-stock?status=&deleted=false&q=&cursor=&limit=` | VIEW | `status?: Status`, `deleted?: boolean`, `q` ≤ 100 (doc no / vendor) | `{ items: {id, docNo, docDate, status, reviewNote, vendorName, rowCount, totalPcs, totalWeightCt, autoApproved, deleted}[], nextCursor }` newest first | Daybook R-01 (ADR-0050 D6). FE-LS-009 |
| `GET /load-to-stock/{id}` | VIEW | — | `LoadOut` | 404 `LOAD_TO_STOCK_NOT_FOUND`. FE-LS-002 |
| `POST /load-to-stock` | ADD + CSRF | `LoadInput` | `201 { id, docNo, version, status, stockIds: (string|null)[] /* by row */ }` | ON → DRAFT; OFF → APPROVED (applied). FE-LS-010 |
| `PUT /load-to-stock/{id}` | EDIT + CSRF | `LoadInput & { expectedVersion }` | `{ id, version, status, stockIds }` | DRAFT/REVISION, or auto-approved & not used |
| `POST /load-to-stock/{id}/submit` | ADD **or** EDIT + CSRF | `{ expectedVersion }` | `{ id, version, status: "PENDING_APPROVAL", submittedAt }` | ON only; runs Save validation |
| `POST /load-to-stock/{id}/approve` | APPROVE (+VIEW) + CSRF | `{ expectedVersion }` | `{ id, version, status: "APPROVED", stockIds }` | applies (saga) |
| `POST /load-to-stock/{id}/request-revision` | APPROVE + CSRF | `{ expectedVersion, note: string /* 1–500 */ }` | `{ id, version, status: "REVISION_REQUESTED" }` | once (`LOAD_TO_STOCK_REVISE_LIMIT`) |
| `POST /load-to-stock/{id}/reject` | APPROVE + CSRF | `{ expectedVersion, reason: string /* 1–500 */ }` | `{ id, version, status: "REJECTED" }` | final |
| `POST /load-to-stock/{id}/delete` | DELETE + CSRF | `{ expectedVersion }` | `{ id, version }` | soft delete (ADR-0045); OFF applied → release + reverse |

Duplicate (Q-LS-17) and Restore (owner Q-LS-33) are not offered. Row rules: `pcs` ≥ 1; `weightCt` ≥ 0 and may be 0 only when every source of the row has weight 0 (Q-LS-26); in a MERGE document a later pick adds its lines to the single merged row.

### Approve Center (FE-LS-011)

| Method / path | Permission | Input | Output |
|---|---|---|---|
| `GET /approval/summary` | signed in + licensed | — | `{ items: {type: "load-to-stock", count}[], countCap: 100 }` — only types with APPROVE + VIEW |
| `GET /approval/pending?type=load-to-stock&q=&sort=&dir=&cursor=&limit=` | APPROVE + VIEW | as master `approval.pending` (sort `submittedAt` / `docNo` / `party` / `qty` / `value`) | `{ items: {id, docNo, docDate, partyName, submittedAt, submittedByName, totalPcs, totalWeightCt, valueBase, revisionCount}[], nextCursor }` |

Preview opens `GET /load-to-stock/{id}` read-only.

### Photos (L-02, M-12; FE-LS-008)

| Method / path | Permission | Input | Output |
|---|---|---|---|
| `POST /load-to-stock/photos` | ADD or EDIT + CSRF | multipart `file` (JPEG/PNG, ≤ 5 MiB, signature checked) | `201 { id }` |
| `POST /load-to-stock/photos/from-purchase-line` | ADD or EDIT + CSRF | `{ purchaseLineId }` (a loadable line) | `{ ids: string[] /* ≤ 5, PU order */ }` — copies once per master file, then reuses |
| `GET /load-to-stock/photos/{id}` | VIEW | — | image stream, `Content-Type` stored, `Cache-Control: private, max-age=300`, `X-Content-Type-Options: nosniff` |

### Notifications (FE-LS-015)

Same shapes as master [notifications](../../master/notifications/api-contract.md), `documentType: "load-to-stock"`:

| Method / path | Input | Output |
|---|---|---|
| `GET /notifications/unread-count` | — | `{ count }` |
| `GET /notifications?scope=for-me|all&cursor=&limit≤20` | — | `{ items: NotificationItem[], nextCursor }` |
| `POST /notifications/mark-read` (CSRF) | `{ ids: string[] /* 1–50 */ }` | `{ updated }` |
| `POST /notifications/mark-all-read` (CSRF) | — | `{ updated }` |
| `GET /notifications/stream` | — | `text/event-stream`: `notification` `{id,type,documentType}`, `ready`, `reauth`, `ping` 25 s, `retry: 5000`; 401/403/503 as ADR-0049 |

### Health (not routed by nginx)

`GET /health/live` (process), `GET /health/ready` (DB `SELECT 1` ≤ 1 s; master reachability is **not** part of readiness, so a master outage does not restart inventory).

## Master internal API (api-master, `/internal/v1/inventory/*`)

Auth: `Authorization: Bearer <INVENTORY_MASTER_SERVICE_TOKEN>` (constant-time; separate from `PARTNER_SERVICE_TOKEN`). Header `X-Request-Id` propagated; `X-Actor-User-Id` used for audit columns only, never for authorization (inventory already authorized the user). JSON bodies strict, ≤ 256 KiB. Errors use master's envelope; inventory maps them.

| Method / path | Input | Output | Rule |
|---|---|---|---|
| `GET /reference` | — | `{ companyCurrency, stone: StoneLineOptions, locations: {id, code, name}[] }` | stone as `vendorDocumentOptions().stone`; active locations of Location Master (field names aligned after that branch merges) |
| `GET /vendors/loadable?q&cursor&limit≤50` | — | `{ items: {id,code,name}[], nextCursor }` | DISTINCT vendors of open lines (index-backed) |
| `POST /purchase-lines/loadable/search` | `SearchInput` | `SearchOutput` | 1 page query + 1 count (capped) |
| `POST /purchase-lines/batch` | `{ ids: uuid[] /* 1–200 */, excludeAllocationOf?: uuid }` | `{ items: (PurchaseLineRef & { status: "OPEN"|"CLOSED"|"UNAVAILABLE", vendorId })[] }` | 1 query; UNAVAILABLE = PU not approved/deleted/STOCK |
| `POST /master-data/resolve` | `{ stoneCodeIds: uuid[] ≤ 200, locationIds: uuid[] ≤ 200 }` | `{ stoneCodes: {id, code, active}[], locations: {id, code, name, active}[] }` | ≤ 2 queries (one per kind), no per-id query |
| `POST /document-numbering/resolve` | `{ transactionKey: "load-to-stock", docDate, markUsed: boolean }` | `{ numbering: {id, prefix, separator, startNo} | null }` | `markUsed` sets `external_used_at` once (idempotent) |
| `PUT /load-allocations/{loadId}` | `{ revision: int ≥ 1, vendorId, lines: {purchaseLineId, pcs, weightCt}[] /* ≤ 200 distinct */, newStockIdCount: int 0–200 }` | `200 { revision, stockIds: string[], lines: {purchaseLineId, remainingPcs, remainingWeightCt}[], replayed: boolean }` | D4 semantics; `409 LOAD_ALLOCATION_STALE` (revision < applied, or same revision with another hash); `409 LOAD_ALLOCATION_EXCEEDS_REMAINING` `{lines:[{purchaseLineId, remainingPcs, remainingWeightCt}]}`; `422 LOAD_ALLOCATION_LINE_UNAVAILABLE` `{purchaseLineIds}` (not approved / deleted / STOCK / other vendor) |
| `GET /load-allocations/{loadId}` | — | `{ revision, lines, stockIds } | 404` | recovery read |
| `GET /purchase-lines/{id}/photos` | — | `{ items: {fileId, position, contentType, sizeBytes, sha256}[] }` (≤ 5) | only lines of approved, not deleted PUs |
| `GET /files/{fileId}/content` | — | stream | only files linked from `purchase_line_photo`; else 404 |

## Phase 2 endpoints (ADR-0052 D15, owner Q-LS-30; designed here, implemented in a later revision)

| Side | Method / path | Purpose |
|---|---|---|
| inventory public | `GET /api/inventory/v1/stock/available?q&locationId&cursor&limit≤50` (VIEW on any of quotation / reserve / memo-out / load-to-stock) | own-stock section of the From Stock picker (Stock ID, location, stone attrs, available pcs/weight; price columns as the Memo Stock picker) |
| inventory internal (`/internal/v1/master/*`, token `MASTER_INVENTORY_SERVICE_TOKEN`) | `POST /stock/batch` `{ids ≤ 200}` | availability + snapshot for master Save validation |
| inventory internal | `PUT /stock-holds/{documentType}/{documentId}` `{revision, holds: [{lineId, stockUuid, kind: RESERVED or MEMO_OUT or MEMO_OUT_RETURN, pcs, weightCt}] ≤ 200}` | set the document's holds; idempotent; 409 `STOCK_HOLD_EXCEEDS_AVAILABLE` with ids; empty = release |
| inventory internal | `GET /stock-holds/{documentType}/{documentId}` | recovery read for master's saga |

Compatibility: all master changes are additive. Existing tRPC procedures keep their contracts, except `approvalSetting.list/update` stop returning/accepting the three inventory keys (Q-LS-25) — the frontend reads them from inventory in the same release.
