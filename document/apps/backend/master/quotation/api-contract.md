# API contract: quotation (SA revision 1, approved 2026-10-26)

Typed tRPC router `quotation` on the master router (`/api/master/trpc`, nginx → `api-master`), plus a
REST binary pair for photos. Permission = catalog leaf `quotation` + action (SA-QT-02). Mutations need
the CSRF/same-origin checks every master mutation already has. Consumed by TODO FE-QT-001…006 in
[task/todo/quotation.md](../../../../task/todo/quotation.md).

## Shared types

```ts
type Decimal = string;                 // "1234.50" — never JS numbers for money/weight
type QuotationStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED";
type ChargeType = "SHIPPING" | "HANDLING" | "INSURANCE" | "CERTIFICATE";

type LineInput = {
  source: "MANUAL";                    // "STOCK" rejected until inventory exists
  stoneCodeId: string | null;          // uuid
  stoneCode: string; stone: string; shape: string; size: string;
  color: string; clarity: string; cutting: string; quality: string;
  lot: string; location: string; cerType: string; cerNo: string;
  pcs: number;                         // int 0..999999
  weightCt: Decimal;                   // <= 3 dp
  priceUnit: "PER_CT" | "PER_PCS";
  unitPrice: Decimal;                  // <= 2 dp
  discount: { type: "NONE" | "PERCENT" | "AMOUNT"; value: Decimal }; // owner 2026-10-26: one of the two; percent <= 100
  itemNote: string;                    // <= 500
  photoIds: string[];                  // <= 5 (owner 2026-10-26), uuid, first = main
};

type QuotationInput = {
  docDate: string; dueDate: string;    // "YYYY-MM-DD"
  customerId: string; shippingAddressId: string; invoiceAddressId: string;
  currency: string; exchangeRate: Decimal | null;
  ref: string; documentNote: string;
  lines: LineInput[];                  // 1..200
  discount: { type: "NONE" | "PERCENT" | "AMOUNT"; value: Decimal };
  tax: { enabled: boolean; rate: Decimal; includeInPrice: boolean };
  serviceCharges: { type: ChargeType; amount: Decimal }[];   // each type at most once
  labor: { work: string; basis: "PCS" | "WEIGHT"; qty: Decimal; rate: Decimal } | null;
};

type Totals = { subtotal; discountAmount; priceBeforeTax; taxAmount; chargesAmount; laborAmount; grandTotal: Decimal };

type Quotation = QuotationInput & {
  id: string; docNo: string; status: QuotationStatus; version: number;
  customer: { code: string; name: string };                  // snapshot
  shippingAddressText: string; invoiceAddressText: string;   // snapshot
  lines: (LineInput & { id: string; discountAmount: Decimal; amount: Decimal })[];   // amount after the line discount
  totals: Totals;
  statusReason: string | null;
  createdAt: string; createdBy: string; updatedAt: string; approvedAt: string | null; approvedBy: string | null;
};

type QuotationListItem = { id; docNo; status; docDate; dueDate; customerName; currency; grandTotal; updatedAt };
```

## Procedures

| Procedure | Permission | Input | Output |
|---|---|---|---|
| `quotation.list` (query) | VIEW | `{q?, status?, customerId?, from?, to?, cursor?, limit? ≤ 50}` — no `status` = every status except CANCELLED, newest first | `{items: QuotationListItem[], nextCursor, total}` |
| `quotation.get` (query) | VIEW | `{id}` | `Quotation` |
| `quotation.nextNumber` (query) | VIEW | `{docDate}` | `{docNo: string}` — preview only (max + 1 now; plain `1, 2, 3 …` when no Document Setup row is in effect, owner 2026-10-26) |
| `quotation.options` (query) | VIEW | `{customerId?}` (an inactive stored customer to include) | `{customers: {id, code, name, active, currency, addresses: {id, type, label, isDefault}[]}[], currencies: string[], companyCurrency, chargeTypes: ChargeType[], numbering: {configured: boolean}, stone: {codes: {id, code, partOrder, stone, shape, size, color, clarity, cutting, quality}[], stones, shapes, sizes, colors, clarities, cuttings, qualities: {name, code}[]}}` (part codes + partOrder added 2026-10-27 for the editable stone code) — `stone` added during implementation (2026-10-26, additive) so the item editor works without `stone-master:VIEW`; active rows only, ≤ 1,000 per list |
| `quotation.create` (mutation) | ADD | `QuotationInput` | `{id, docNo, version}` |
| `quotation.update` (mutation) | EDIT | `{id, expectedVersion} & QuotationInput` | `{id, version}` |
| `quotation.submit` (mutation) | EDIT | `{id, expectedVersion}` | `{id, status, version}` |
| `quotation.approve` (mutation) | APPROVE | `{id, expectedVersion}` | `{id, status, version}` — for the future Approve page; the creator may approve with APPROVE |
| `quotation.reject` (mutation) | APPROVE | `{id, expectedVersion, reason}` | `{id, status, version}` — Approve page |
| `quotation.cancel` (mutation) | CANCEL | `{id, expectedVersion, reason}` | `{id, status, version}` |
| `quotation.delete` (mutation) | DELETE | `{id, expectedVersion}` | `{ok: true}` |

## Photos (REST, binary)

| Route | Permission | Request | Response |
|---|---|---|---|
| `POST /api/v1/quotation/photos` | ADD or EDIT | raw body, `content-type: image/jpeg \| image/png`, ≤ 5 MB, magic bytes must match | `201 {photoId}` |
| `GET /api/v1/quotation/photos/:id` | VIEW | — | image bytes, `cache-control: private, max-age=31536000, immutable` (ids are immutable) |

## Errors

Envelope as other master features: tRPC `data.domainCode` (+ `fieldErrors[{path, code}]`).

| Domain code | HTTP / tRPC | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 BAD_REQUEST | Input shape/bounds; `fieldErrors` paths like `lines.3.weightCt`, `dueDate`, `exchangeRate` |
| `QUOTATION_NOT_FOUND` | 404 | Unknown id |
| `QUOTATION_CHANGED` | 409 CONFLICT | `expectedVersion` mismatch |
| `QUOTATION_STATUS_INVALID` | 409 CONFLICT | Action not allowed in the current status |
| `QUOTATION_REFERENCE_INVALID` | 422 | Inactive/unknown customer, address not of that customer/type, inactive stone code (stored values may stay), unknown currency; `fieldErrors` names the field |
| `QUOTATION_PHOTO_INVALID` | 422 | Photo id unknown or not a quotation photo; upload type/size/magic mismatch (415/413 on REST) |
| `PERMISSION_DENIED` / `UNAUTHORIZED` | 403 / 401 | Existing master authorization (ADR-0031) |
| `DOCUMENT_SETUP_ROW_IN_USE` | 409 | Document Setup save tried to change/remove a numbering row that issued numbers (SA-QT-05) |

## Compatibility

- New procedures only; existing master procedures are unchanged except Document Setup save (new 409 for
  used rows) and Document Setup `get` (`used` becomes real).
- The frontend keeps its `QuotationFormValues` shape; `api.ts` maps form ↔ contract (decimal strings,
  empty rows dropped, `discount.enabled=false` → `NONE`, `labor.enabled=false` → `null`).
