# API contract: approve-center (SA revision 1, 2026-11-07, approved 2026-11-07)

Typed tRPC on the existing master router (`/api/master/trpc`: same-origin proxy → nginx → `api-master:3201`). Additive to the base contracts of [reserve](../reserve/api-contract.md), [memo-receive](../memo-receive/api-contract.md), [memo-return](../memo-return/api-contract.md), [memo-out](../memo-out/api-contract.md), [memo-out-return](../memo-out-return/api-contract.md), [purchase-order](../purchase-order/api-contract.md), [purchase](../purchase/api-contract.md) and [transaction-soft-delete](../transaction-soft-delete/api-contract.md). Decisions D1…D22 in [decisions.md](decisions.md). Consumers: FE-AP-009 (summary, rows, search), FE-AP-010 (reject / revise / resubmit, document pages), FE-AP-011 (inventory, later) in the [central TODO](../../../../task/todo/approve-center.md).

`<doc>` ∈ `reserve`, `memoReceive`, `memoReturn`, `memoOut`, `memoOutReturn`, `purchaseOrder`, `purchase`; `<menu>` and `<CODE>` per the [scope table](decisions.md#scope). Quotation is unchanged.

## Shared types

```ts
type ApprovalType = "reserve" | "purchaseOrder" | "purchase" | "memoReceive" | "memoReturn" | "memoOut" | "memoOutReturn";
type DocStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "REVISION_REQUESTED";   // D1/D2

type Review = {
  action: "REJECT" | "REVISE";
  note: string;                 // 1–500, as entered (trimmed)
  at: string;                   // ISO
  by: string;                   // user id
  byName: string | null;        // snapshot (D5); null = unknown → "—"
};

type Submitted = {
  submittedAt: string;          // ISO; create or last resubmit (D4)
  submittedBy: string;          // user id
  submittedByName: string | null;
};
```

## Document procedures (each of the seven `<doc>` routers)

| Procedure | Kind | Permission | Input | Output | Change |
|---|---|---|---|---|---|
| `<doc>.reject` | mutation | `<menu>` APPROVE + CSRF | `{id: uuid, expectedVersion: int ≥ 1, reason: string}` (trim, 1–500; strict) | `{id, version, status: "REJECTED"}` | **new** (D1, D3) |
| `<doc>.requestRevision` | mutation | `<menu>` APPROVE + CSRF | `{id, expectedVersion, note: string}` (trim, 1–500; strict) | `{id, version, status: "REVISION_REQUESTED"}` | **new** |
| `<doc>.resubmit` | mutation | `<menu>` EDIT + CSRF | `{id, expectedVersion}` (the doc's existing versioned schema) | `{id, version, status: "PENDING_APPROVAL", submittedAt}` | **new** (D7) |
| `<doc>.approve` | mutation | unchanged | unchanged | unchanged | only from `PENDING_APPROVAL` (unchanged guard); `REVISION_REQUESTED` / `REJECTED` → `<CODE>_STATUS_INVALID` |
| `<doc>.update` | mutation | unchanged | unchanged | unchanged | allowed in `PENDING_APPROVAL` and `REVISION_REQUESTED` (status unchanged); `REJECTED` → `_STATUS_INVALID` |
| `<doc>.delete` / `<doc>.restore` | mutation | unchanged | unchanged | unchanged | deletable in `PENDING_APPROVAL` and `REVISION_REQUESTED` (D8); `REJECTED` → `_STATUS_INVALID` |
| `<doc>.get` | query | unchanged | unchanged | existing `& Submitted & {review: Review \| null}`; `status: DocStatus` | additive. `purchase.get` returns `limit*` / `min*` while editable (D10) |
| `<doc>.list` | query | unchanged | `status?: DocStatus` (enum widened) | item `status: DocStatus` | additive |

Rules:

- Reject / requestRevision: one guarded `UPDATE … WHERE id, version = expected, status = 'PENDING_APPROVAL', deleted_at IS NULL` setting status, `review_*`, `reviewed_by_name`, `version + 1`, `updated_at/by`. No stock function is called (D9).
- Resubmit: guarded on `status = 'REVISION_REQUESTED', deleted_at IS NULL`; sets `PENDING_APPROVAL`, `submitted_at/by/by_name`, `version + 1`, `updated_at/by`; keeps `review_*` (the last Revise stays readable, D3).
- A reason/note that is empty after trim or longer than 500 → `VALIDATION_ERROR` with `fieldErrors: [{path: "reason" | "note", code: "too_small" | "too_big"}]`. Line breaks are allowed; the UI renders it as plain text.

## Approval router (new, read-only)

### `approval.summary` — query

- Permission: signed-in session with current authorization and an eligible license (no single menu grant, no CSRF); the result contains only types where the caller has `<menu>:APPROVE` **and** `<menu>:VIEW` (Super Admin: all seven).
- Input: none (`undefined` / `{}`; strict).
- Output:

```ts
type ApprovalSummary = {
  items: { type: ApprovalType; count: number }[];   // permitted types only, registry order; 0 ≤ count ≤ 100
  countCap: 100;                                     // count === 100 means "100 or more"
};
```

- A user with no permitted type gets `{items: [], countCap: 100}` (the sidebar Approve item is hidden). Counts exclude soft-deleted documents and every status other than `PENDING_APPROVAL`.
- Freshness: computed per call, no server cache. Client: `staleTime` 60 s, refetch on window focus and after any approve / reject / requestRevision; no interval polling.

### `approval.pending` — query

- Permission: `<menu(type)>` APPROVE **and** VIEW (Super Admin passes). Checked before input is used for any query.
- Input (strict):

```ts
type ApprovalPendingInput = {
  type: ApprovalType;
  q?: string;                                   // trim, ≤ 100; empty = no search
  sort?: "submittedAt" | "docNo" | "party" | "qty" | "value";   // default "submittedAt"
  dir?: "asc" | "desc";                         // default "asc" (oldest first)
  cursor?: string | null;                       // ≤ 300, opaque
  direction?: "forward" | "backward";           // sent by useInfiniteQuery; ignored
  limit?: number;                               // 1–50, default 50
};
```

- Output:

```ts
type ApprovalRow = {
  type: ApprovalType;
  id: string;
  docNo: string;
  docDate: string;                  // YYYY-MM-DD
  dueDate: string;                  // YYYY-MM-DD (Hold until / Due / Valid until per menu)
  version: number;                  // pass as expectedVersion to <doc>.approve / reject / requestRevision
  status: "PENDING_APPROVAL";
  party: { id: string; code: string; name: string };   // customer or vendor snapshot
  ref: string;
  currency: string;
  grandTotal: string;               // 2 dp
  lineCount: number;
  totalPcs: number;
  totalWeightCt: string;            // 3 dp
  stoneNames: string[];             // ≤ 3 distinct non-empty line stone names, in line order
  moreStoneCount: number;           // distinct stone names beyond the 3 ("+k")
  submittedAt: string;
  submittedBy: string;
  submittedByName: string | null;
  lastReview: Review | null;        // non-null = resubmitted after a Revise (action "REVISE")
  updatedAt: string;
};
type ApprovalPendingPage = { items: ApprovalRow[]; nextCursor: string | null };
```

- Order: the sort key in `dir`, then `id` in the same direction (stable). `value` sorts by `currency` then `grandTotal`. `party` sorts by the party name snapshot. `qty` sorts by `totalWeightCt`. `docNo` is a text sort.
- Search `q` (case-insensitive substring, `%`/`_`/`\` escaped): doc no., party name, ref, any line's stone name, any line's Stock ID (PO lines have no Stock ID; Memo Out Return uses the linked Memo Out line's Stock ID).
- Cursor: base64url JSON `{v: 1, s: sort, d: dir, q: sha256(q) first 16 hex, k: [sortValue…], i: id}`. A cursor whose sort, dir or q differs from the input, or that does not parse, → `VALIDATION_ERROR cursor invalid` (the client resets paging when sort or search changes).
- No `total` (use `approval.summary`). Deleted, approved, rejected and revised documents never appear.

## Errors

The envelope is unchanged (`{error: {code, message, fieldErrors?}}`; tRPC `data.domainCode`). Codes:

| Code | HTTP / tRPC | When | UI (FE-AP-009/010) |
|---|---|---|---|
| `<CODE>_STATUS_INVALID` | 409 CONFLICT | reject / requestRevision / approve when not `PENDING_APPROVAL`; resubmit when not `REVISION_REQUESTED`; update / delete of `REJECTED` | "{docNo} is no longer pending." Refetch; row leaves |
| `<CODE>_CHANGED` | 409 | stale `expectedVersion` | "{docNo} was changed by someone else." Refetch |
| `<CODE>_DELETED` | 409 | document soft-deleted | "{docNo} was deleted." Row leaves |
| `<CODE>_NOT_FOUND` | 404 | unknown id | as deleted |
| `VALIDATION_ERROR` | 400 | `reason` / `note` blank or > 500; `type`, `sort`, `dir`, `limit`, `q` > 100, `cursor` invalid | inline under the dialog field; cursor → reset paging |
| `PERMISSION_DENIED` | 403 FORBIDDEN | missing APPROVE (reject/revise), EDIT (resubmit), APPROVE or VIEW (`pending`) | "You no longer have permission …"; refetch summary |
| `CSRF_INVALID` | 403 | mutation without the CSRF proof | existing handling |
| `UNAUTHENTICATED` | 401 | session | existing sign-in redirect |
| `AUTHORIZATION_UNAVAILABLE` / `PARTNER_UNAVAILABLE` | 503 | auth view / license / database unavailable | "Couldn't …. Try again." (summary: silent, no badge) |

New message catalog entries (`src/common/errors.ts`): none required for codes; the `VALIDATION_ERROR` field messages for `reason` / `note`.

## Compatibility

- Additive: new procedures, new output fields, widened status enums. Existing clients that switch on status must treat unknown statuses as read-only; the frontend updates its status maps in FE-AP-010 **before** the first document can reach a new status (the reject/revise buttons are what create them).
- `approve`, `update`, `delete`, `restore` inputs/outputs are unchanged.
- `list` order and cursor (v1) unchanged. `approval.pending` uses its own cursor; never mix them.
- Phase 1 counting through `<doc>.list({status, limit: 1}).total` keeps working; FE-AP-009 replaces it with `approval.summary`.
