# Frontend data flow: approval-setup

- UI revision: 1 (pending-review)
- Related shared/SA API contract: existing per-document tRPC `list` procedures in `backend-api-master/src/master/router.ts` (reserve, memoReceive, memoReturn, memoOut, memoOutReturn, purchaseOrder, purchase); soft delete [ADR-0045](../../../adr/0045-transaction-document-soft-delete.md) (`deleted` defaults to `false`); review statuses and `approval.summary` [ADR-0046](../../../adr/0046-approval-review-status-and-approve-center-api.md) (Accepted, backend on hold); approve-center phase 1 data flow [approve-center/data-fetching.md](../approve-center/data-fetching.md); `auth.permission.mine`.
- Backend requirement: **phase 1 unchanged-approved** (existing list procedures only; no setting is read or written). **Phase 2 requires-sa** ([handoff](../../../coordination/handoffs/approval-setup-sa.md), SA-AS-01…10).

## Operations

| UI action / TODO ID | Phase 1 operation (existing) | Input / output | Query key / cache | Loading / error / empty | Phase 2 (requires-sa) | Backend owner |
|---|---|---|---|---|---|---|
| Tile + page access (FE-AS-001/002) | `authTrpc.permission.mine` (shared query) | `isSuperAdmin`, `permissions` | existing key, `staleTime` 30 s | page skeleton; existing no-permission placeholder | `approval-setup:VIEW/EDIT` leaf (SA-AS-07) | auth |
| Initial settings (FE-AS-003) | **none**: constant `DEFAULT_APPROVAL_SETTINGS` = Quotation off, every other type on | — | component state only; not cached, not in `localStorage` | — | `approvalSetting.list` → `{ type, requireApproval, version, updatedAt, updatedByName }[]` (SA-AS-01) | master (proposed) |
| Waiting counts (FE-AS-004) | `<doc>.list({ status: "PENDING_APPROVAL", limit: 1 })` → `total`, for each **available** type whose `<leaf>:VIEW` the user has (7 calls max; Quotation and the three not-available types make none) | → `total` | **the same tRPC key as approve-center** (`listQueryKey(proc, COUNT_INPUT, "query")`), so the Approve panel, sidebar badge and this page share one cache entry per type; `staleTime` 60 s; refetch on window focus and after any approve; no polling | per-row skeleton / "Couldn't load" + Retry / "No documents" | counts incl. `REVISION_REQUESTED`, one call, gated by `approval-setup:VIEW` (SA-AS-05; extend `approval.summary` or a setup-specific read) | master |
| Turn OFF check (FE-AS-005) | read the cached count; if stale or missing, `refetch()` that one query before deciding | `total > 0` → blocking dialog | — | switch busy while fetching; failure → "Couldn't check" dialog | the **server** refuses the update atomically (`APPROVAL_SETTING_HAS_WAITING`, with counts) — the UI check is only a fast path (SA-AS-02) | master |
| Turn ON / OFF (FE-AS-005) | **none** (local state change) | — | — | — | `approvalSetting.update({ type, requireApproval, expectedVersion })` with `approval-setup:EDIT` + CSRF; invalidate settings, approve-center menus, document pages' setting reads (SA-AS-01) | master |
| Go to Approve / "N documents ›" | client navigation to `/approve/{slug}` | — | approve-center refetches on focus | — | none | — |

## Bounds and budget (4 GB RAM / 2 vCPU)

- At most 7 count requests, each `limit: 1` on the existing `(status, doc_date desc, created_at desc, id desc)` index; they are usually already cached by the sidebar Approve badge, so opening this page normally adds **no** request.
- No interval polling, no per-row `get`, no prefetch of Approve lists.
- Phase 2 replaces 7 calls with one bounded summary (ADR-0046 D5 style, ≤ 11 types).

## Duplicate requests and races

- The switch ignores clicks while its row is checking (busy) or while a dialog is open.
- Phase 1 has no write, so no race exists. Phase 2: another user may turn the type OFF/ON or save a pending document between the UI check and the update; the server decides (version conflict → refetch settings and show the current state; waiting documents → blocking dialog with the server counts). See [error-handling.md](error-handling.md).

## Mocks and limits

- Phase 1 settings are a constant default plus local state; this is **not** proof of a setting service and has no effect on saves. Replacement: FE-AS-008 after SA-AS-01.
- Counts are real (existing APIs). Phase 1 counts only `PENDING_APPROVAL` because `REVISION_REQUESTED` does not exist until ADR-0046 is implemented.
- Test fixtures reproduce source 02 (Reserve 2, PO 2, Purchase 1); the running page never shows sample counts for types without an API.
