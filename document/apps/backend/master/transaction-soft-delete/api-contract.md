# API contract: transaction soft delete (SA revision 1, 2026-11-06, approved 2026-11-06)

These are additive changes to the existing typed tRPC routers on the master router (`/api/master/trpc`: same-origin proxy → nginx → `api-master:3201`). Base contracts: [quotation](../quotation/api-contract.md), [memo-out](../memo-out/api-contract.md), [reserve](../reserve/api-contract.md), [memo-out-return](../memo-out-return/api-contract.md), [memo-receive](../memo-receive/api-contract.md), [memo-return](../memo-return/api-contract.md), [purchase-order](../purchase-order/api-contract.md), [purchase](../purchase/api-contract.md). Decisions: [decisions.md](decisions.md) D1…D18. Consumers: [TODO](../../../../task/todo/transaction-soft-delete.md) FE-SD-001…003.

`<doc>` is one of `quotation`, `reserve`, `memoReceive`, `memoReturn`, `memoOut`, `memoOutReturn`, `purchaseOrder`, `purchase`. `<menu>` is its existing menu key (`quotation`, `reserve`, `memo-receive`, `memo-return`, `memo-out`, `memo-out-return`, `purchase-order`, `purchase`). `<CODE>` is its error prefix (`QUOTATION`, `RESERVE`, `MEMO_RECEIVE`, `MEMO_RETURN`, `MEMO_OUT`, `MEMO_OUT_RETURN`, `PURCHASE_ORDER`, `PURCHASE`).

## Types (added fields only)

```ts
// List input: every <doc>.list schema (documentListFields, quotationListSchema) gains:
type DeletedFilter = { deleted?: boolean };            // default false; strict zod z.boolean().default(false)

// List item: every <doc>.list item gains:
type DeletedListFields = { deletedAt: string | null }; // ISO; always null when deleted = false

// Detail: every <doc>.get output gains:
type DeletedDetailFields = {
  deletedAt: string | null;                            // ISO; non-null = deleted → the UI shows it read-only (D10)
  deletedBy: string | null;                            // user id, the same as createdBy / approvedBy
};
```

## Procedures

| Procedure | Kind | Permission | Input | Output | Change |
|---|---|---|---|---|---|
| `<doc>.list` | query | `<menu>` VIEW | existing `& {deleted?: boolean}` | existing `{items, nextCursor, total}`; item `+ deletedAt` | **changed (additive)**. `deleted: false` (default) = only not-deleted, exactly as today otherwise; `true` = only deleted. Same order `(docDate desc, createdAt desc, id desc)`, cursor v1, limit ≤ 50, and q / partyId / customerId / status / from / to filters. `total` counts the selected view. |
| `<doc>.get` | query | `<menu>` VIEW | `{id}` | existing `& DeletedDetailFields` | **changed (additive)**. A deleted document is returned (not NOT_FOUND). |
| `<doc>.delete` | mutation | `<menu>` DELETE + CSRF | `{id, expectedVersion}` (unchanged) | `{ok: true, version: number}` | **changed (behaviour)**. Soft delete (D4); `version` is the new version (additive field). Allowed statuses: engine documents `PENDING_APPROVAL` (unchanged); **Quotation `DRAFT` / `PENDING_APPROVAL` only** (D2, narrowed; APPROVED / REJECTED / CANCELLED → `QUOTATION_STATUS_INVALID`). |
| `<doc>.restore` | mutation | `<menu>` DELETE + CSRF | `{id, expectedVersion}` (the same schema as that doc's `delete`) | `{id: string, version: number, status: <DocStatus>}` | **new** (D6/D7) |
| `<doc>.update` | mutation | unchanged | unchanged | unchanged | refuses a deleted document → `<CODE>_DELETED` |
| `<doc>.approve` (all 8), `quotation.submit/reject/cancel` | mutation | unchanged | unchanged | unchanged | refuses a deleted document → `<CODE>_DELETED` |
| `<doc>.nextNumber`, `<doc>.options`, pickers, `memoStock.list`, `memoOutstanding.*`, `memoOutReturn.outstanding`, `purchase.memoStock`, `purchase.purchaseOrderLines` | query | unchanged | unchanged | unchanged | **unchanged** (D11) |

### Input rules

- `deleted` is a strict boolean; any other value gives `VALIDATION_ERROR deleted`. Lists that use `withFieldErrors` (purchase) report it as a field error.
- `restore` uses the same strict `{id: uuid, expectedVersion: int ≥ 1}` schema as that document's `delete` (`versionedIdSchema`, `memoVersionedIdSchema`, `purchaseVersionedIdSchema`).

## Errors

The envelope is the existing `{error: {code, message, fieldErrors?}}` (gateway: TRPCError with `cause.code`). New codes are added to the `messages` catalog in `backend-api-master/src/common/errors.ts`.

| Code | HTTP | When | UI |
|---|---|---|---|
| `<CODE>_DELETED` **new** | 409 | update / approve / submit / reject / cancel / delete on a deleted document | "This document was deleted. Restore it to edit." Reload the document (read-only view). |
| `<CODE>_STATUS_INVALID` | 409 | delete of a non-deletable status (unchanged); **restore of a document that is not deleted** | Reload the document |
| `<CODE>_CHANGED` | 409 | stale `expectedVersion` on delete / restore (as today) | "Changed by someone else", reload |
| `<CODE>_NOT_FOUND` | 404 | unknown id | as today |
| `PERMISSION_DENIED` / `UNAUTHORIZED` / CSRF | 403 / 401 | no `<menu>` DELETE grant on restore, etc. | as today |
| `PARTNER_UNAVAILABLE` | 503 | database unavailable | as today |

Messages: `"The <noun> was deleted"`, using the noun of the existing codes (quotation, reserve, memo receive, memo return, memo out, memo out return, purchase order, purchase).

Miss order for a guarded write that changes 0 rows (D8): NOT_FOUND → DELETED (for restore: STATUS_INVALID when not deleted) → STATUS_INVALID → CHANGED.

## Compatibility

- Additive output fields; one new input field with a default; one new procedure per router. Existing clients keep working: the list hides deleted documents (they used to disappear), and `delete` still returns `ok: true`.
- Behaviour change: Quotation delete is refused for APPROVED and REJECTED (it used to be allowed), so the frontend hides Delete for them.
- Behaviour changes: the Doc No. of a deleted document is no longer reused (D5), and `nextNumber` after a delete previews the next number instead of the deleted one.
- Pagination: unchanged keyset; cursors of the two views must not be mixed (the frontend resets the cursor when the filter changes).
