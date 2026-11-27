# API contract: inventory / merge-split (SA revision 1, pending-review)

- Public base: `/api/inventory/v1` (browser → nginx → `backend-api-inventory:3301`). REST JSON, `Cache-Control: no-store`.
- Conventions as [load-to-stock](../load-to-stock/api-contract.md#conventions): cookie auth, CSRF on POST/PUT, decimal strings, `expectedVersion`, keyset `limit` 1–50 + opaque `cursor`, strict Zod, JSON ≤ 256 KiB, error envelope.
- Errors: [error-handling](error-handling.md). Grants: [authorization](authorization.md). Consumers: FE-MS items in [task/todo/merge-split.md](../../../../task/todo/merge-split.md). This contract replaces the assumed names in the UI [data-fetching](../../../frontend/merge-split/data-fetching.md) where they differ.

## Shared types

```ts
type Status = "DRAFT" | "PENDING_APPROVAL" | "REVISION_REQUESTED" | "APPROVED" | "REJECTED";
type Mode = "SPLIT" | "MERGE";
type Dec = string;
type PriceUnit = "PER_CT" | "PER_PCS";
type Attrs = { stoneCodeId: string | null; stoneCode: string; stone: string; shape: string; size: string; color: string;
  clarity: string; cutting: string; quality: string; cerType: string; cerNo: string };

type SourceInput = { key: string /* client key ≤ 40, unique */; stockUuid: string; availPcs: number; availWeightCt: Dec };
type ResultInput = {
  id?: string; sourceKey: string | null;   // SPLIT: the source key (required); MERGE: null
  attrs: Attrs; location: string; lot: string /* ≤ 40 */; parcel: string /* ≤ 50 */;
  pcs: number /* ≥ 1 */; weightCt: Dec /* 3 dp */; stockPrice: Dec; salePrice: Dec /* ≥ 0, 2 dp */;
  itemNote: string /* ≤ 500 */; photoIds: string[] /* ≤ 5 stored_file ids */ };
type MergeSplitInput = { docDate: string; mode: Mode; ref: string /* ≤ 100 */; note: string /* ≤ 250 */;
  sources: SourceInput[] /* SPLIT 1–200, MERGE 2–200, distinct stockUuid */; results: ResultInput[] /* ≤ 200 */ };

type SourceOut = SourceInput & { id: string; position: number; stockId: string; location: string; attrs: Attrs; lot: string;
  priceUnit: PriceUnit; unitCostBase: Dec; takeCostBase: Dec; refDocNo: string; refDocDate: string };
type ResultOut = ResultInput & { id: string; position: number; priceUnit: PriceUnit; unitCostBase: Dec; costAmountBase: Dec;
  stockUuid: string | null; stockId: string | null /* null until applied */; inUse: boolean };
type MergeSplitOut = { id: string; docNo: string | null; docDate: string; mode: Mode; ref: string; note: string; status: Status;
  autoApproved: boolean; version: number; deleted: boolean; sources: SourceOut[]; results: ResultOut[];
  totals: { source: { pcs: number; weightCt: Dec; costBase: Dec }; result: { pcs: number; weightCt: Dec; costBase: Dec } };
  approval: Approval /* same shape as stock-adjustment */ };

type OwnStockRow = { stockUuid: string; stockId: string; lotKey: string; location: string; attrs: Attrs; lot: string;
  priceUnit: PriceUnit; unitCostBase: Dec; availPcs: number; availWeightCt: Dec; costAmountBase: Dec /* of avail */;
  stockPrice: Dec; salePrice: Dec; currency: string; photoCount: number; loadedFrom: { docNo: string; docDate: string }; syncing: boolean };
```

## Public endpoints

| Method / path | Grant | Input | Output | Notes |
|---|---|---|---|---|
| `GET /merge-split/options` | VIEW | — | `{ companyCurrency, locations: string[], numbering: { configured } }` | cached master reads |
| `GET /merge-split/next-number?docDate=` | VIEW | `docDate` | `{ docNo }` | preview, not reserved |
| `GET /merge-split?status=&mode=&deleted=false&q=&cursor=&limit=` | VIEW | `q` ≤ 100 (doc no / ref / Stock ID) | `{ items: {id, docNo, docDate, mode, status, sourceCount, resultCount, autoApproved, deleted}[], nextCursor }` | daybook, newest first, 1 statement |
| `GET /merge-split/{id}` | VIEW | — | `MergeSplitOut` | 404 `MERGE_SPLIT_NOT_FOUND`; 2 statements |
| `GET /merge-split/stock?q=&location=&exclude=&excludeDocId=&cursor=&limit=` | VIEW | `q` ≤ 100 (Stock ID, stone code, lot, cer no); `exclude` ≤ 200 stockUuid | `{ items: OwnStockRow[], nextCursor }` | own, ACTIVE, on hand > 0, not on another PENDING doc; oldest ref first; 1 statement |
| `GET /merge-split/stock/{stockUuid}/photos` | VIEW | — | `{ fileIds: string[] }` (≤ 5) | relink source photos |
| `POST /merge-split/photos` | ADD or EDIT + CSRF | multipart `file` (JPEG/PNG ≤ 5 MiB) | `201 { fileId }` | `files/merge-split/` |
| `GET /merge-split/photos/{fileId}` | VIEW | — | image stream | file linked to a result or own stock |
| `POST /merge-split` | ADD + CSRF | `MergeSplitInput` | `201 { id, docNo, version, status, stockIds: (string \| null)[] }` | OFF → APPROVED (applied, IDs in result order); ON → DRAFT |
| `PUT /merge-split/{id}` | EDIT + CSRF | `MergeSplitInput & { expectedVersion }` | `{ id, version, status, stockIds }` | DRAFT/REVISION; auto-approved → reverse + re-apply |
| `POST /merge-split/{id}/submit` | ADD or EDIT + CSRF | `{ expectedVersion }` | `{ id, version, status: "PENDING_APPROVAL", submittedAt }` | ON only; stale + pending check, no effect |
| `POST /merge-split/{id}/approve` | APPROVE + VIEW + CSRF | `{ expectedVersion }` | `{ id, version, status: "APPROVED", stockIds }` | applies |
| `POST /merge-split/{id}/request-revision` | APPROVE + CSRF | `{ expectedVersion, note }` | `{ …, status: "REVISION_REQUESTED" }` | once |
| `POST /merge-split/{id}/reject` | APPROVE + CSRF | `{ expectedVersion, reason }` | `{ …, status: "REJECTED" }` | final |
| `POST /merge-split/{id}/delete` | DELETE + CSRF | `{ expectedVersion }` | `{ id, version }` | soft; effective → reverse first |
| `POST /merge-split/{id}/restore` | DELETE + CSRF | `{ expectedVersion }` | `{ id, version, status: "DRAFT" }` | |

Validation (400 `VALIDATION_FAILED` with `fieldErrors` paths `sources.n.*` / `results.n.*`): SA-MS-03 rules, SPLIT `sourceKey` must name a source and each source needs ≥ 2 results whose Σ pcs/weight equal `availPcs`/`availWeightCt`; MERGE exactly 1 result with `sourceKey = null` and Σ; photo ids must be stored files of this module or of a picked source stock.

## Existing endpoints that gain the type

| Endpoint | Change |
|---|---|
| `GET/PUT /approval-settings[/{type}]` | `merge-split` now counts waiting documents |
| `GET /approval/summary` | `{type: "merge-split", count}` for APPROVE + VIEW |
| `GET /approval/pending?type=merge-split` | `{id, docNo, docDate, partyName: "" , mode, submittedAt, submittedByName, revisionCount, sourceCount, resultCount, totalPcs, totalWeightCt}` |
| Stock Card / Stock Value | `SPLIT_*`, `MERGE_*` rows; DOC NO opens `/inventory/merge-split/{id}` |

## Master internal changes

| Endpoint | Change |
|---|---|
| `POST /internal/v1/inventory/document-numbering/resolve` | `transactionKey` allow-list adds `"merge-split"` |
| **new** `POST /internal/v1/inventory/stock-ids/issue` | inventory service token. In `{ documentType: "merge-split", documentId: uuid, applySeq: int ≥ 1, count: 1–200 }`. Out `{ stockIds: string[], replayed: boolean }`. Same key + same count → same ids; same key + other count → 409 `STOCK_ID_ISSUE_CONFLICT`; counter limit → 409 `MEMO_RECEIVE_STOCK_ID_EXHAUSTED` (existing). |
