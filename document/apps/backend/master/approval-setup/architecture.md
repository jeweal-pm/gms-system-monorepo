# Architecture: approval-setup (SA revision 1, 2026-11-10)

- Status: **approved** with [ADR-0050](../../../../adr/0050-approval-setting-draft-send-to-approve.md) (owner 2026-11-10 "อนุมัติ ADR-0050"). Implementation waits for the owner's instruction.
- Source: `approval-setup` UI revision 1 (approved 2026-11-09) phase 2; owner rules and answers Q-AS-23…33 of 2026-11-10.
- Builds on: [approve-center bundle](../approve-center/architecture.md) (ADR-0046, accepted, not implemented). Both ship in one backend delivery; where they differ, this bundle wins (list below).
- Central TODO: [task/todo/approval-setup.md](../../../../task/todo/approval-setup.md) (BE-AS-001…012, FE-AS-008…013).
- Bundle: this file, [api-contract](api-contract.md), [database-diagram](database-diagram.md), [sequence-diagram](sequence-diagram.md), [authorization](authorization.md), [error-handling](error-handling.md), [dependencies](dependencies.md), [testing](testing.md). UI flow: [diagram/approval-setup-flow.md](../../../../diagram/approval-setup-flow.md).

## Scope

Eight document types with pages: Quotation (`quotation`), Reserve (`reserve`), Memo Receive (`memo_receive`), Memo Return (`memo_return`), Memo Out (`memo_out`), Memo Out Return (`memo_out_return`), Purchase Order (`purchase_order`), Purchase (`purchase`). Three future types (`load-to-stock`, `merge-split`, `stock-transfer-location`) get a setting row only; they adopt this model when designed (SA-AS-10).

## Owning service and boundary

All behaviour lives in `backend-api-master` (schema `partner`), reached as today: browser → same-origin Next proxy → nginx → master tRPC (`/api/master/trpc`). No new service, container, queue, cache or worker. `backend-api-auth` changes only its permission catalog (one leaf). The setting is stored in master because it is read inside master's Save transaction under a lock (ADR-0050 alternatives).

## Components (master)

| Component | Responsibility |
|---|---|
| `approval-setting/approval-setting.service.ts` (new) | `list`, `update`, the turn-OFF guard, `readForSave(tx, type)` (`FOR SHARE`), waiting counts |
| `approval-setting/approval-flow.ts` (new) | Shared status rules for all 8 types: `saveStatus(setting, current)`, `assertEditable(doc)`, `assertSubmittable`, `assertReviewable`, revise limit, `canApprove(actor, type)` (today `<menu>:APPROVE`; later the user's Approve list, ADR-0050 D3) |
| `document-engine.ts`, `customer-stock-document.ts`, `memo-receive`, `memo-return`, `memo-out-return`, `purchase`, `purchase-order`, `quotation` services (changed) | create/update follow the setting; new `submit`; `reject` / `requestRevision` (ADR-0046) with the revise limit; delete/update guards; `applyEffects` = the body of today's `approve()` extracted; new `reverseEffects` and `isUsed` per type |
| `approval` router (ADR-0046, changed) | `summary` / `pending` include only types whose setting is ON; rows carry `revisionCount` |
| `scripts/approve-pending.ts` (new, one-time) | Go-live command (ADR-0050 D7) |

## Key rules (from ADR-0050)

1. **Status**: ON → create = `DRAFT`; `submit` → `PENDING_APPROVAL` (locked); `approve` → `APPROVED`; `requestRevision` (once) → `REVISION_REQUESTED`; `reject` → `REJECTED`. OFF → create/update = `APPROVED` with `auto_approved = true` and effects applied.
2. **Editable / deletable** iff `status ∈ {DRAFT, REVISION_REQUESTED}` or (`status = APPROVED` and `auto_approved` and not `isUsed`). `PENDING_APPROVAL`, reviewed `APPROVED`, `REJECTED` are read-only and not deletable.
3. **Edit of an auto-approved document**: in one transaction, lock the header (`FOR UPDATE`), check `isUsed`, `reverseEffects(old)`, write the new lines, `applyEffects(new)`. **Delete**: lock, check `isUsed`, `reverseEffects`, soft delete (ADR-0045).
4. **Setting read**: every create/update/submit reads its type's row `FOR SHARE` first; `approvalSetting.update` takes it `FOR UPDATE` and runs the waiting count in the same transaction, so a concurrent Save waits or is seen by the guard.
5. **Lock order** (unchanged plus one): setting row → document header → source header(s) `FOR SHARE` in id order (a dependent document only: Memo Out Return → `memo_out`, Purchase → `purchase_order`; INV-20261111-002 F1) → `memo_out_line` rows → `memo_stock` rows in id order → `purchase_order_line` rows in id order. A dependent takes its source headers before it inserts lines or locks stock whenever its Save applies effects (create / update) and again in `apply` (approve, restore, go-live), and re-checks them APPROVED and not deleted under that lock; the source's soft delete / edit locks its own header first (guarded version bump) before `usedBy`, so the two serialize without a cycle (the source writer never waits for a lock the dependent holds before the header). `reverseEffects` uses the same helpers in the same order as `applyEffects`.

## Effects and their reversal

`applyEffects` is today's `approve()` body. `reverseEffects` is its exact inverse, written in the same helpers with a negative direction; every balance CHECK on `memo_stock` and lines stays the final guard (a violation maps to `<CODE>_IN_USE`).

| Type | applyEffects (today) | reverseEffects | isUsed (refuse edit/delete) |
|---|---|---|---|
| Quotation | none | none | never (no downstream yet) |
| Reserve | `takeFromMemoStock(..., "reserved")` | give back `reserved` | never until Sale exists |
| Memo Receive | create its `memo_stock` rows (received) | delete those rows | any of its rows has returned/sold/reserved/purchased > 0 (or is referenced by any line) |
| Memo Return | `takeFromMemoStock(..., "returned")` | give back `returned` | never; the balance CHECK guards |
| Memo Out | `takeFromMemoStock(..., "reserved")` (Memo Stock Reserve) | give back | any `memo_out_return_line` references its lines (any status, not deleted) |
| Memo Out Return | puts back into Memo Stock and raises `memo_out_line.returned_*` | take out again, lower `returned_*` | reversal would break a balance CHECK |
| Purchase Order | none (lines wait, `purchased_* = 0`) | none | any line `purchased_* > 0` |
| Purchase | `takeForPurchase` (memo_stock purchased/sold, PO lines purchased, sold parts) | give back all three | never until Load to Stock exists; balance CHECK guards |

"References" for `isUsed` count lines of non-deleted documents in **any** status (a draft that picked the item also blocks), so a reversal never orphans a picker.

## Differences from the approve-center bundle (ADR-0046)

| ADR-0046 | Now |
|---|---|
| Statuses PENDING / APPROVED / REJECTED / REVISION_REQUESTED, Save → PENDING | + `DRAFT`; Save → DRAFT (ON) or APPROVED (OFF) |
| D7: Pending editable/deletable | Pending locked |
| `resubmit` (EDIT) from REVISION_REQUESTED | `submit` (ADD or EDIT) from DRAFT and REVISION_REQUESTED |
| `submitted_*` NOT NULL, backfilled | nullable; set by `submit`; CHECK pairs them with status ≠ DRAFT |
| Revise unlimited | `revision_count` ≤ 1 |
| Seven headers | + Quotation (same columns) |
| Approve Center: all 7 types | only types whose setting is ON (Quotation when ON) |

## Capacity (4 GB RAM / 2 vCPU)

- One extra indexed single-row read (`approval_setting`, 11 rows) per create/update/submit.
- `isUsed` is one indexed `EXISTS` per document (on the existing FK indexes; `memo_stock(memo_receive_line_id)` and `memo_out_return_line(memo_out_line_id)` exist); the reversal touches only the document's own rows.
- Setup counts: one statement over the 8 partial indexes, ≤ 100 per type. No polling, cache, worker or container. Partner pool (≤ 5) and auth reader pool (1) unchanged.
- The go-live command runs once, sequentially, one document per transaction.
- Measurements before release: M-AS-01 Save p95 with the setting read (target +≤ 5 ms), M-AS-02 auto-approved edit of a 200-line Purchase (target < 1 s), M-AS-03 the go-live command on the dev data set.

## Implementation clarifications (SA, 2026-11-10, after backend stage 1; no contract or flow change)

| ID | Decision |
|---|---|
| G1 | Review CHECKs are written NULL-safe (`IS NOT DISTINCT FROM`, explicit `IS NOT NULL`); same intent as ADR-0046. |
| G2 | `submitted_check` exempts auto-approved and deleted rows: `deleted_at IS NOT NULL OR auto_approved OR (status = 'DRAFT') = (submitted_at IS NULL)`. |
| G3 | `<t>_deleted_check` keeps `PENDING_APPROVAL` as allowed **only for legacy rows** (soft-deleted before ADR-0050); the service never deletes a Pending document any more. `restore` of such a row restores it as `DRAFT` (`submitted_*` cleared) when approval is ON, or re-applies effects as auto-approved when OFF (same as any draft). |
| G4 | Quotation `CANCELLED` is exempt from `review_status_check` and `auto_approved_check` (cancel keeps the review/auto fields as history). Quotation CHECKs and the REJECTED → review backfill from `status_reason` land in stage 2 with the paths that write them. |
| G5 | Error data travels in the envelope's `details` (tRPC `data.details`): `APPROVAL_SETTING_HAS_WAITING` → `{pending, revision}`, `<CODE>_IN_USE` → `{usedBy}`. |
| G6 | `approvalSetting.update` for a type with `available = false` → `VALIDATION_ERROR` (field `type`, "Not available yet"). A missing row reads as ON (`readForSave`) and `update` returns `APPROVAL_SETTING_CHANGED`. |
| G7 | `approval_setting.updated_at` is `TIMESTAMPTZ(3)`; header columns stay `TIMESTAMP(3)` like the existing ones. |
| G8 | There is no `lock_timeout`: lock waits are bounded by `WRITE_TX` (4 s) and a timeout maps to `PARTNER_UNAVAILABLE` (503, "Try again"). |
| G9 | **Soft-deleted documents still count as users** (`isUsed`/`usedBy`) for Memo Receive, Memo Out and Purchase Order: a deleted document can be restored and its lines keep `ON DELETE RESTRICT` references, so the source must stay intact. `usedBy` names it with " (deleted)" so the user can see why; the contract's "non-deleted" wording is replaced by this rule. Memo Out Return `usedBy` found through a balance shortfall is the newest live document that names the item (best effort; `_IN_USE` without `usedBy` in a race is acceptable). |
| G10 | Restore keeps the revise history: ON restore of a deleted `REVISION_REQUESTED` document gives `DRAFT` with `revision_count = 1` and the Revise note kept (revise stays once per document). OFF restore clears `review_*` (auto-approved rows carry no review). |
| G11 | `<doc>.list` rows carry `status`, `autoApproved`, `revisionCount`, `review` only (no per-row `EXISTS`); `canEdit`/`canDelete`/`canSubmit`/`usedBy` come from `get`. `<doc>.get` must accept `<menu>:VIEW` **or** `canApprove` for `PENDING_APPROVAL` documents (stage 3). |
| G12 | Go-live command (stage 3): approves Pending documents whatever the current setting (they were sent before go-live); the actor is `GO_LIVE_ACTOR_ID` in `approved_by`/`deleted_by` ("System" and the delete reason appear in the command output/log only, no new column); documents that change during the run are skipped, not deleted; the dry run tries each document in its own short transaction (4 s bound) rolled back at once, so no lock outlives one document; each document is therefore predicted against the pre-run state, and documents competing for the same stock may show WOULD_APPROVE yet be deleted by `--apply` (the report notes this; INV-20261111-002 H2). |
| G13 | `approval.summary` adds `types: { type, requireApproval }[]` (types the caller can approve) so the Approve menu shows OFF types as "off" — an additive output, accepted into the contract. Approval type keys are the kebab-case setting keys (`memo-receive`, …). Any approver of a type sees all its pending documents (no ownership filter, as ADR-0046). |
| G14 | Line photos follow G11: photo reads accept `<menu>:VIEW` **or** `canApprove` while the document is `PENDING_APPROVAL`, so an approver sees what they approve. |
| G15 | `approval.pending` party-sort cursor stores the row id only and reads the name from that row (a long Thai name exceeds the 300-character cursor); cursor ids accept any 8-4-4-4-12 GUID. Test DBs migrate master with `PARTNER_DATABASE_URL=...?schema=partner`. |
