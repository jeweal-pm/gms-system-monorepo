# API contract: approval-setup (SA revision 1, 2026-11-10, approved with ADR-0050)

tRPC on `backend-api-master` (`/api/master/trpc`), superjson off, strict zod inputs, CSRF on every mutation (existing double-submit). Shared shapes from the [approve-center contract](../approve-center/api-contract.md) apply unless changed here.

## Shared types

```ts
type ApprovalType = "quotation" | "reserve" | "memo-receive" | "memo-return" | "memo-out" | "memo-out-return"
  | "purchase-order" | "purchase" | "load-to-stock" | "merge-split" | "stock-transfer-location";
type DocStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REVISION_REQUESTED" | "REJECTED"; // Quotation also "CANCELLED"
type Review = { action: "REVISE" | "REJECT"; note: string; at: string; byName: string | null };
type Flow = {                       // added to every <doc>.get and <doc>.list item
  status: DocStatus;
  autoApproved: boolean;            // approved by Save while approval was OFF
  revisionCount: 0 | 1;
  canEdit: boolean;                 // status rule + isUsed + caller's EDIT grant
  canDelete: boolean;               // status rule + isUsed + caller's DELETE grant
  canSubmit: boolean;               // DRAFT / REVISION_REQUESTED, setting ON, caller ADD or EDIT
  usedBy: { docNo: string } | null; // first document that uses it (for "Used by MR…" text), only when isUsed
  review: Review | null;            // latest Revise / Reject
};
```

## approvalSetting router (new)

| Procedure | Kind | Permission | Input | Output |
|---|---|---|---|---|
| `approvalSetting.list` | query | signed in (licensed) | `{}` | `{ items: { type, requireApproval, available: boolean, version, updatedAt, updatedByName \| null, waiting: number \| null }[] }` — 11 items in sidebar order. `waiting` (PENDING_APPROVAL + REVISION_REQUESTED, capped 100, "100+" shown by the client) only for `approval-setup:VIEW`, else `null`; `available = false` for the 3 future types |
| `approvalSetting.update` | mutation | `approval-setup:EDIT` + CSRF | `{ type: ApprovalType, requireApproval: boolean, expectedVersion: int ≥ 1 }` | `{ type, requireApproval, version, updatedAt, updatedByName }`. Turning OFF with waiting documents → `APPROVAL_SETTING_HAS_WAITING { pending, revision }`; same value → no-op returns the row unchanged |

Document pages read `approvalSetting.list` (cached per session, refetched on window focus and after a setting-related error) to choose their buttons; the server applies the committed setting regardless (stale page → see errors).

## Document procedures (each of the 8 routers `<doc>`)

| Procedure | Change |
|---|---|
| `<doc>.create` | Output adds `Flow`. Setting ON → `DRAFT`. OFF → `APPROVED` (`autoApproved: true`) with effects; an effect failure refuses the whole Save with today's approve error code. |
| `<doc>.update` | Allowed when `Flow.canEdit`. `DRAFT` stays `DRAFT` (ON) or becomes `APPROVED` (OFF); `REVISION_REQUESTED` stays; auto-approved → reverse + re-apply. Else `<CODE>_STATUS_INVALID` (Pending/Rejected/reviewed Approved) or `<CODE>_IN_USE { usedBy }`. |
| `<doc>.submit` **new** | `{ id, expectedVersion }`; `<menu>:ADD` or `<menu>:EDIT` + CSRF. From `DRAFT` / `REVISION_REQUESTED` → `PENDING_APPROVAL`, sets `submitted_*`, runs the full save validation on the stored document. Setting OFF → `<CODE>_APPROVAL_OFF`. Output `{ id, version, status, submittedAt }`. Replaces ADR-0046 `resubmit` (not built). |
| `<doc>.approve` | Unchanged input/output; only from `PENDING_APPROVAL`; `canApprove`. |
| `<doc>.requestRevision` | ADR-0046 input `{ id, expectedVersion, note (1–500) }`; refused when `revision_count = 1` → `<CODE>_REVISE_LIMIT`; sets `revision_count = 1`. |
| `<doc>.reject` | ADR-0046, `reason` 1–500 required. |
| `<doc>.delete` | Allowed when `Flow.canDelete`; auto-approved → reverse then soft delete. `restore` (ADR-0045) restores as `DRAFT` when ON or re-applies effects as auto-approved when OFF (refused with the effect error if stock is short). |
| `<doc>.list` | Items add `Flow` fields `status`, `autoApproved`, `review` (Daybook). Optional `status` filter accepts `DRAFT`. Newest first as today. |
| `<doc>.get` | Adds `Flow`. |

Quotation joins the ADR-0046 procedures (`submit`, `requestRevision`, `reject`, `approve` already exists).

## approval router (ADR-0046, changed)

- `approval.summary`: items only for types whose setting is ON and that the caller `canApprove`; adds `requireApproval` per registry type so the Approve menu can show OFF types as "off".
- `approval.pending`: type must be ON (else `APPROVAL_TYPE_OFF`, 409); rows add `revisionCount`. `quotation` is accepted as a type.

## Errors (new or widened)

| Code | HTTP / tRPC | When |
|---|---|---|
| `APPROVAL_SETTING_HAS_WAITING` | 409 CONFLICT | turn OFF while PENDING / REVISION_REQUESTED exist; `data: { pending, revision }` |
| `APPROVAL_SETTING_CHANGED` | 409 | stale `expectedVersion` |
| `APPROVAL_TYPE_OFF` | 409 | `approval.pending` for an OFF type |
| `<CODE>_APPROVAL_OFF` | 409 | `submit` while the type is OFF |
| `<CODE>_REVISE_LIMIT` | 409 | second Revise |
| `<CODE>_IN_USE` | 409 | edit/delete of an auto-approved document that is used; `data: { usedBy: docNo }` |
| `<CODE>_STATUS_INVALID` | 409 | widened: update/delete of PENDING / REJECTED / reviewed APPROVED; submit not from DRAFT/REVISION_REQUESTED |
| existing approve codes (e.g. `*_PENDING_SHORT`) | 409 | OFF Save whose effects fail |
| `PERMISSION_DENIED`, `CSRF_INVALID`, `VALIDATION_ERROR`, `UNAUTHENTICATED`, `PARTNER_UNAVAILABLE` | as today | |

Messages and client handling: [error-handling](error-handling.md).

## Compatibility

Additive outputs; `resubmit` is never shipped. The status enum widens (`DRAFT`), so frontend and backend ship together (FE-AS-010…013 with BE-AS-*). Old clients that call `approve` from a document page keep working for approvers until the frontend removes the button.

## Consuming frontend items

FE-AS-008 (settings), FE-AS-009 (Approve Center follows settings), FE-AS-010 (document pages: Save / Send to approve / Edit / Delete, lock), FE-AS-012 (Daybook colors), FE-AS-013 (Revise/Reject dialogs: reason required, Revise disabled after one) in the [central TODO](../../../../task/todo/approval-setup.md).
