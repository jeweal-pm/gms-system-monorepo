# API contract: inventory / sale (SA revision 1, approved 2026-11-18)

- Public base: `/api/inventory/v1` (browser, same origin through nginx → `backend-api-inventory:3301`). REST JSON, `Cache-Control: no-store`.
- Internal base (master): `/internal/v1/inventory/*` on `api-master:3201`, never routed by nginx.
- Conventions (auth cookie, CSRF on every `POST`/`PUT`, decimal strings, `expectedVersion`, keyset pagination `limit` 1–50 + opaque `cursor` ≤ 300, strict Zod, JSON ≤ 256 KiB, error envelope) are exactly those of [load-to-stock api-contract](../load-to-stock/api-contract.md#conventions). Errors: [error-handling](error-handling.md); permissions: [authorization](authorization.md).
- Consumers: FE-SL-002…009 in [task/todo/sale.md](../../../../task/todo/sale.md). This contract replaces the assumed master tRPC names in the UI [data-fetching](../../../frontend/sale/data-fetching.md) table (same hooks, REST adapter).

## Shared types

```ts
type Status = "DRAFT" | "PENDING_APPROVAL" | "REVISION_REQUESTED" | "APPROVED" | "REJECTED";
type Source = "RESERVE" | "STOCK";            // "OWN_STOCK" added in phase 2 (ADR-0054 D11)
type PriceUnit = "PER_CT" | "PER_PCS";
type DiscountType = "NONE" | "PERCENT" | "AMOUNT"; // same values as master trade documents
type Dec = string;
type StoneAttrs = { stoneCode: string; stone: string; shape: string; size: string; color: string; clarity: string;
  cutting: string; quality: string; lot: string; location: string; cerType: string; cerNo: string };
type Approval = { requireApproval: boolean; autoApproved: boolean; revisionCount: 0 | 1;
  submitted: { at: string; by: string; byName: string | null } | null;
  review: { action: "REJECT" | "REVISE"; note: string; at: string; by: string; byName: string | null } | null };

type LineInput = {
  id?: string;                     // existing line id on update
  source: Source;
  reserveLineId?: string;          // required iff source = RESERVE
  memoStockId?: string;            // required iff source = STOCK (ignored for RESERVE: taken from the Reserve line)
  pcs: number;                     // int ≥ 0
  weightCt: Dec;                   // ≥ 0, ≤ 3 dp; pcs > 0 or weight > 0
  unitPrice: Dec;                  // Sale Price > 0, ≤ 2 dp, per the item's price unit, document currency
  discount: { type: DiscountType; value: Dec };   // line discount, as master trade-document lines
  itemNote?: string;               // ≤ 500
  photoIds: string[];              // ≤ 5 distinct
};
// Header money fields (discount, tax, labor, charges) and their bounds mirror master `quotation.schemas.ts` /
// the Reserve input exactly, so the shared QuotationInfoForm / SummaryValue post the same shape.
type SaleInput = {
  docDate: string; dueDate: string;                 // dueDate ≥ docDate
  customerId: string; shippingAddressId: string; invoiceAddressId: string;
  currency: string;                                 // active currency code
  exchangeRate: Dec | null;                         // Selling Rate > 0; required when currency ≠ company currency, else null
  ref?: string;                                     // ≤ 100
  documentNote?: string;                            // ≤ 250
  discount: { type: DiscountType; value: Dec };
  tax: { enabled: boolean; rate: Dec; included: boolean };
  labor: { work: string; basis: "PCS" | "WEIGHT"; qty: Dec; rate: Dec } | null;
  charges: { chargeType: string; amount: Dec }[];   // ≤ 20, chargeType from options, unique
  lines: LineInput[];                               // 1..200
};
type LineOut = Required<Omit<LineInput, "reserveLineId" | "memoStockId">> & StoneAttrs & {
  position: number;
  reserveLineId: string | null; memoStockId: string;
  stockId: string;                                  // Memo Stock Stock ID
  sourceDoc: { type: "RESERVE" | "MEMO_RECEIVE"; id: string; docNo: string }; // caption "from {docNo}"
  priceUnit: PriceUnit;
  capPcs: number; capWeightCt: Dec;                 // live open/pending (+ own applied qty) for editable docs; snapshot at save otherwise
  reservePrice: Dec | null;                         // RESERVE: the Reserve line's net unit price (info)
  discountAmount: Dec; amount: Dec;
};
type SaleOut = {
  id: string; docNo: string; status: Status; version: number;
  docDate: string; dueDate: string;
  customerId: string; customer: { code: string; name: string };
  shippingAddressId: string | null; shippingAddressText: string;
  invoiceAddressId: string | null; invoiceAddressText: string;
  currency: string; exchangeRate: Dec | null; ref: string; documentNote: string;
  discount: SaleInput["discount"]; tax: SaleInput["tax"]; labor: SaleInput["labor"]; charges: SaleInput["charges"];
  lines: LineOut[];
  totals: { lineCount: number; pcs: number; weightCt: Dec; subtotal: Dec; discountAmount: Dec; priceBeforeTax: Dec;
    taxAmount: Dec; chargesAmount: Dec; laborAmount: Dec; grandTotal: Dec };
  approval: Approval;
  flow: { canEdit: boolean; canDelete: boolean; canSubmit: boolean; canRestore: boolean; usedBy: string | null };
  syncing: boolean;
  deleted: { at: string; by: string } | null;
  approvedAt: string | null; approvedBy: string | null;
  created: { at: string; by: string }; updated: { at: string; by: string };
};
```

Totals use the master trade-document rules (`document-totals.ts`, `memo-receive netUnitPrice`) exactly; a shared fixture set proves parity (UT-SL-B03).

## Public endpoints (`/api/inventory/v1`)

| Method / path | Permission | Input | Output | Notes / TODO |
|---|---|---|---|---|
| `GET /sale/options?customerId=` | `sale:VIEW` | `customerId?` (keeps an inactive stored customer selectable) | `{ customers: CustomerOption[] /* as master quotation.options */, currencies: string[], companyCurrency: string | null, chargeTypes: string[], numbering: { configured: boolean }, stone: StoneLineOptions }` | 1 master call. FE-SL-002 |
| `GET /sale/next-number?docDate=` | `sale:VIEW` | `docDate` | `{ docNo: string }` (preview, nothing reserved) | FE-SL-002 |
| `GET /sale?status=&deleted=false&q=&cursor=&limit=` | `sale:VIEW` | `status?`, `deleted?`, `q` ≤ 100 (doc no / customer) | `{ items: {id, docNo, docDate, status, reviewNote, customerName, lineCount, totalPcs, totalWeightCt, grandTotal, currency, autoApproved, deleted}[], nextCursor }` newest first | Daybook. FE-SL-002 |
| `GET /sale/{id}` | `sale:VIEW` | — | `SaleOut` | 404 `SALE_NOT_FOUND`. FE-SL-002/006 |
| `POST /sale` | `sale:ADD` + CSRF | `SaleInput` | `201 { id, docNo, version, status }` | ON → DRAFT; OFF → APPROVED (applied). FE-SL-006 |
| `PUT /sale/{id}` | `sale:EDIT` + CSRF | `SaleInput & { expectedVersion }` | `{ id, version, status }` | DRAFT/REVISION, or auto-approved and not used |
| `POST /sale/{id}/submit` | `sale:ADD` or `EDIT` + CSRF | `{ expectedVersion }` | `{ id, version, status: "PENDING_APPROVAL", submittedAt }` | ON only; re-validates against current caps |
| `POST /sale/{id}/approve` | `sale:APPROVE` + `VIEW` + CSRF | `{ expectedVersion }` | `{ id, version, status: "APPROVED" }` | applies (saga). FE-SL-009 |
| `POST /sale/{id}/request-revision` | `sale:APPROVE` + CSRF | `{ expectedVersion, note /* 1–500 */ }` | `{ id, version, status: "REVISION_REQUESTED" }` | once |
| `POST /sale/{id}/reject` | `sale:APPROVE` + CSRF | `{ expectedVersion, reason /* 1–500 */ }` | `{ id, version, status: "REJECTED" }` | final |
| `POST /sale/{id}/delete` | `sale:DELETE` + CSRF | `{ expectedVersion }` | `{ id, version }` | soft delete; auto-approved → release first |
| `POST /sale/{id}/restore` | `sale:DELETE` + CSRF | `{ expectedVersion }` | `{ id, version, status: "DRAFT" }` | SQ-SL-03 |
| `GET /sale/reserve-lines?customerId=&currency=&q=&from=&to=&exclude=&cursor=&limit=` | `sale:VIEW` | `customerId`, `currency` required; `q` ≤ 100 (Reserve no., Stock ID, lot, stone, cer no.); `from/to` Reserve doc date; `exclude` ≤ 200 Reserve line ids (comma list or repeated) | `{ items: ReserveLineRef[], nextCursor }` oldest Reserve first, then line position | P-01, FE-SL-004 |
| `POST /sale/photos` | `sale:ADD` or `EDIT` + CSRF | multipart `file` (JPEG/PNG ≤ 5 MiB) | `201 { id }`; `429 RATE_LIMITED` | nginx 6 MiB location (INF-SL-001). FE-SL-007 |
| `GET /sale/photos/{id}` | `sale:VIEW` | — | image stream, `private, max-age=300`, `nosniff` | linked or own unlinked upload |

```ts
type ReserveLineRef = StoneAttrs & {
  reserveLineId: string; reserveId: string; reserveNo: string; reserveDate: string; dueDate: string;
  memoStockId: string; stockId: string; priceUnit: PriceUnit;
  netUnitPrice: Dec;              // Reserve line price after its line discount, Reserve currency (= Sale currency)
  openPcs: number; openWeightCt: Dec; openAmount: Dec;
};
```

Existing endpoints extended for `sale`:

| Endpoint | Change |
|---|---|
| `GET/PUT /approval-settings[/{type}]` | type `sale` (same shape; turn-OFF refused while sales wait) |
| `GET /approval/summary` | item `{type: "sale", count}` when the caller has `sale` APPROVE + VIEW |
| `GET /approval/pending?type=sale…` | items `{id, docNo, docDate, partyName /* customer */, submittedAt, submittedByName, totalPcs, totalWeightCt, value /* grand total */, currency, revisionCount}` |
| `GET /notifications*`, stream | `documentType: "sale"` events (FE bell link `/sale/sale/{id}`) |

## Master public changes (tRPC `/api/master/trpc`)

| Procedure | Change |
|---|---|
| `currency.options` | also allowed with `sale:VIEW` |
| `memoStock.list` | also allowed with `sale:VIEW` (P-02 phase 1) |
| `reserve.get` | lines gain `soldPcs: number`, `soldWeightCt: Dec` (additive, SQ-SL-04) |
| `reserve.update` / `reserve.delete` (auto-approved) | `RESERVE_IN_USE` when any line is sold (`usedBy` = the Sale number) |

## Master internal API (new, `/internal/v1/inventory/*`, token `INVENTORY_MASTER_SERVICE_TOKEN`)

| Method / path | Input | Output | Rule |
|---|---|---|---|
| `GET /sale/reference?includeCustomerId=` | — | `{ customers, currencies, companyCurrency, chargeTypes, numbering: {configured}, stone }` | `customerDocumentOptions("sale", includeCustomerId)` |
| `POST /sale/reserve-lines/search` | `{ customerId, currency, q?, from?, to?, exclude: uuid[] ≤ 200, cursor?, limit ≤ 50 }` | `{ items: ReserveLineRef[], nextCursor }` | 1 page query, no count |
| `POST /sale/prepare` | `{ party: {customerId, shippingAddressId, invoiceAddressId, keepCustomerId?}, currency, reserveLineIds: uuid[] ≤ 200, memoStockIds: uuid[] ≤ 200, saleId?: uuid }` | `{ party: {code, name, shippingText, invoiceText} | null, partyErrors: FieldError[], currencyActive: boolean, companyCurrency, reserveLines: (ReserveLineRef & {status: "OPEN"|"CLOSED"|"UNAVAILABLE", customerId, currency})[], memoStocks: {memoStockId, stockId, attrs, priceUnit, memoReceive: {id, docNo}, pendingPcs, pendingWeightCt, status: "OK"|"UNAVAILABLE"}[] }` | ≤ 4 queries; with `saleId`, caps add back that sale's applied consumption |
| `POST /document-numbering/resolve` | `transactionKey: "load-to-stock" | "sale"` | unchanged | allow-list widened |
| `PUT /sale-consumptions/{saleId}` | `{ revision: int ≥ 1, saleDocNo, customerId, currency, lines: {lineId, source, reserveLineId?, memoStockId, pcs, weightCt}[] ≤ 200 (distinct lineId; distinct reserveLineId; distinct memoStockId per STOCK) }` | `200 { revision, replayed: boolean, lines: {lineId, capPcs, capWeightCt}[] }` | ADR-0054 D6; `409 SALE_CONSUMPTION_STALE`; `409 SALE_CONSUMPTION_EXCEEDS_AVAILABLE {lines:[{lineId, field, code: "exceeds_open"|"exceeds_pending", availablePcs, availableWeightCt}]}`; `422 SALE_CONSUMPTION_LINE_UNAVAILABLE {lineIds}`; `409 SALE_CONSUMPTION_IN_USE {stockIds}` |
| `GET /sale-consumptions/{saleId}` | — | `{ revision, lines } | 404` | recovery read |

`X-Actor-User-Id` is recorded only for audit; inventory has already authorized the user.

## Compatibility

All changes are additive. Existing master procedures keep their shapes (one extra optional output field on `reserve.get`). Load to Stock contracts are unchanged; the internal numbering literal is widened. Frontend `DocumentApprovalType` gains `sale` (served by inventory).
