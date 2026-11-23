# INV-20261121-002 — Lot-based stock focused security review (security-auditor): own-stock lot lines are approved without a hold when the lot is short

Canonical record for the `security-auditor` focused pre-handoff review of feature `lot-based-stock` (ADR-0055, SA rev 1 plus the
2026-11-21 owner amendment). The parallel `sec-auditor` review of the same revision appends to or links this record instead of
creating a duplicate for the same root cause. The parent allocates the final ID (this file used the next free ID at write time).

## Tracking

- Ticket revision: 1
- Status: partially-resolved (F1, H3 fixed; H1 doc aligned and H2 done 2026-11-21 on direct user instruction; H4 documented, H5 release note written; auditor re-review not yet run)
- Owner: backend (F1, H1, H3); sa only if the stock-ID removal in H2 is treated as a contract change
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor / focused pre-handoff review (static, read-only) / none
- Date and audit scope: 2026-11-21; ADR-0055; backend-api-master `src/trade-document/{lot-key,lot-allocation,lot-apply,lot-stock.service,own-lot-lines,from-stock.service,customer-stock-document,inventory-hold-saga,stock-lines,memo-return.service,memo-schemas}.ts`, `src/purchase/{purchase-lots,purchase-stock,purchase.schemas}.ts`, `src/inventory-internal/*`, `src/master/router.ts`, migrations `20261120090000_lot_based_stock` and `20261121090000_lot_key_without_price`; backend-api-inventory `src/modules/stock/lots.ts`, `src/internal/master-routes.ts`, `src/modules/sale/*`, migrations `20261120090000_lot_based_stock` and `20261121090000_own_lot_key_per_stock`; frontend `features/trade-document/{lot-stock,from-stock-api,memo-stock-modal,customer-stock*}`, quotation and approve-center changes. Excluded as requested: `backend-api-auth` csrf files.
- Source commit, dirty paths, and relevant content hashes: HEAD `b1036dc` on `feat/20-11-26-change-stockId-to-lot` plus the uncommitted working tree (92 modified files and the untracked lot files). sha256 prefixes: `backend-api-master/src/trade-document/own-lot-lines.ts` 73cac36fab99787a, `customer-stock-document.ts` 5a0574a4a851bbcf
- Related ticket / root-cause fingerprint: `own-lot:approve-short-plan-empty-no-hold` (F1). H1 relates to H1 of INV-20261120-001 (memo cost to `sale:VIEW`). Not a duplicate of INV-20261120-001.
- Category: vulnerability (F1); hardening (H1, H2, H3)
- Verdict: F1 confirmed (static trace; not reproduced at run time); H1, H2, H3 not-applicable
- Vulnerability severity: F1 Medium

## Review result

`blocked` for F1 on the own-stock lot path of Reserve and Memo Out approve/restore; `advisory` for the rest. Clear boundaries:

| Boundary | Evidence |
|---|---|
| Permission checks on the new procedures | `router.ts` `memoStock.lots` VIEW on memo-return or memo-receive; `fromStock.lots` VIEW on quotation, reserve, memo-out or sale; `purchase.memoStockLots` `purchase:VIEW`. Same grants as the procedures they replace. Document save/approve grants unchanged. |
| lotKey validation | `LOT_KEY_RE` (`ML`/`OL` + 32 hex, `MS`/`OS` + uuid) in every schema (memo-schemas, quotation, purchase, internal sale, inventory sale); prefix/source rules in quotation and `itemReferenceErrors`; a lot with both an item id and a key is refused; an unknown key becomes `STOCK_LOT_UNAVAILABLE`. The client snapshot is never trusted: the group is re-read on save (`readMemoLotGroups`) and locked on approve. |
| Cursor / limit | `limit` 1..50 (inventory internal 1..51); cursor `base64url`, `[A-Za-z0-9_-]{1,200}`, date regex plus `Date.parse`, key regex (see H3 for the calendar-date gap); the section prefixes `o:`/`m:`/`s:`/`i:` are matched exactly; `q` ≤ 100 with `escapeLike`; date range ≤ 366 days. |
| Raw SQL | Every statement uses tagged-template parameters. `Prisma.raw` is only used for the fixed allocation-table map (`ALLOC_TABLES`), fixed bucket fragments (`BUCKETS`, `OPEN_SQL`) and the parent column name from a typed union, never from input. |
| Memo Stock allocation concurrency | `lockLotCandidates` takes one id-ordered `FOR NO KEY UPDATE` over the open rows of all touched lots (≤ 500 per group, ≤ 2,000 per transaction, then 422 `STOCK_LOT_TOO_LARGE`); the existing `takeFromMemoStock` bucket SQL and the `memo_stock_balance` CHECK stay the final guard. Same lock order as the other Memo Stock writers. Purchase lots use the same lock plus vendor/currency re-check (`expandLotTakes`). Sale consumption keeps the header → reserve lines → allocation rows → memo stock lock order. |
| Memo Return / Purchase lot ownership | `completeReturnLines` and `readPurchaseLots` refuse a lot of another vendor or currency (`vendor_mismatch`); approve re-checks (`expandLotTakes`). The vendor is inside the lot key. |
| Internal APIs | Inventory `/internal/v1/master/stock/lots[/available]` sit under the existing service-token guard, ≤ 4 in flight, strict zod bodies ≤ 64 KiB, ≤ 200 keys, own-lot key regex; Sale consumption v2 stays under `InventoryServiceTokenGuard` with strict schemas. Allocations (Stock IDs) are server-to-server only. |
| Migrations | Additive; generated `lot_key` uses immutable functions only; both services guard the key redefinition (`RAISE EXCEPTION` when a document line already names a lot); backfill reconciles allocations with buckets and aborts on mismatch. Table rewrites of `memo_stock`/`inventory.stock` are small and one-off. See H3 for the cross-service ordering note. |
| Frontend | Lot text is rendered through React (no `dangerouslySetInnerHTML`, no raw hrefs); the lot key is only sent back as an opaque value; error texts use server codes and the line's own lot name. |
| Bounded memory | Pages ≤ 50 groups (limit + 1), candidates ≤ 2,000 rows, internal bodies ≤ 64 KiB, one inventory call per picker page, set-based inserts. No unbounded query found. |

## Evidence and impact

### F1 — an own-stock lot line that is short at Approve / Restore is approved with no hold and no allocation (Medium, confirmed by source trace)

- Affected files and line numbers:
  - `backend-api-master/src/trade-document/own-lot-lines.ts:104-114` `planOwnLots`: when `allocateFifo` is not `ok` (the lot has less on hand than the line), `plan.set(lotKey, [])` ("Short lines are left out (the hold PUT refuses)").
  - `backend-api-master/src/trade-document/customer-stock-document.ts:349-361` `storedHolds` merges that empty plan into the hold set; `:165-166` `writeOwnAllocations` only checks `if (!planned)`, and `[]` is truthy, so tx1 stores no allocation rows and does not throw.
  - `backend-api-master/src/trade-document/inventory-hold-saga.ts` `covered()` (`:337`) only requires the final applied set to be ≤ the acquired set; a set that is smaller than the document needs always passes.
  - Legacy own-stock lines are not affected: `sumLines` puts the full quantity into the hold PUT, which inventory refuses with `STOCK_HOLD_EXCEEDS_AVAILABLE`.
- Attacker prerequisites and reachable entry point: an authenticated user with ADD/EDIT on Reserve or Memo Out plus an approver (or the auto-approve restore path). No race is needed: saving a draft holds nothing (D4), so two drafts can name the same own-stock lot.
- Concrete trust boundary and source-to-sink trace: draft A and draft B each name own lot `OS…` with 5 pcs while 5 pcs are on hand (both pass the save-time check) → A approved: plan 5 pcs, hold PUT, allocation stored → B approved: `planOwnLots` reads on hand 0 → `allocateFifo` not ok → `plan = []` → hold set unchanged → `engine.approve` runs → `writeOwnAllocations` finds `planned = []` and writes nothing → B becomes APPROVED, `covered()` passes → no hold in inventory, no `*_line_alloc` row, `stock_pending_*` snapshot still says 5.
- Observed impact and independent verification evidence: stock integrity and maker-checker control. An approved Memo Out / Reserve claims own stock that inventory never reserved, so the same stones can be sold, loaded out or given to another document; the approval screen reports success. A later Memo Out Return of that line settles zero allocation rows. Verified by reading source only; `test/trade-document/lot-based-stock.db.integration.test.ts` has no own-stock lot approval case (`grep own` finds none) and no test references `planOwnLots`; the live hold PUT was not exercised.
- Missing validation fact / capability (if any): a DB-backed integration run (two draft Memo Outs of one own lot, approve both) against a stack with inventory; not run by the auditor.
- Sanitized evidence sufficient for owner review: the file:line trace above.
- Raw report/run links: none.

### H1 — vendor cost and vendor identity in `fromStock.lots` (hardening, not-applicable)

- `backend-api-master/src/trade-document/lot-stock.service.ts` `memoLotRow` returns `unitPrice`, `netUnitPrice`, `amount` and `vendor {id, code, name}` for every Memo Stock lot to any holder of `quotation`, `reserve`, `memo-out` or `sale` VIEW. `document/apps/backend/shared/lot-based-stock/authorization.md` says "Memo Stock price is shown only in the vendor pickers that show it today (Memo Return, Purchase)", which the code does not match.
- Assessment: not a regression (the replaced `fromStock.list` / `memoStock.list` returned the same fields, and INV-20261120-001 H1 already records this for `sale:VIEW`). No vulnerability severity. Suggested work: either align the authorization document with the code, or add a cost-free projection for the customer-side From Stock pickers (price needed only for Memo Return and Purchase). Backend, no contract change if the picker UI never shows cost.

### H2 — Stock IDs are still returned by the superseded procedures (hardening, not-applicable)

- ADR-0055 D9 says public picker and document APIs stop returning Stock IDs so the browser cannot leak them. In this revision the old procedures are still mounted and still return `stockId` and vendor cost: `memoStock.list` (grants include quotation, reserve, memo-out, sale), `fromStock.list`, `purchase.memoStock`, and master `GET` of Memo Receive. The frontend no longer reads `fromStock.list` / `memoStock.list` for Quotation, Reserve and Memo Out (only cache invalidations remain: `frontend/src/features/memo-out/api.ts:82`, `memo-out-return/api.ts:246-247`), so the hide is currently a UI behaviour only. Document outputs (`stockId: null`) and `hideStockIds` on Purchase create/update are in place.
- Assessment: the TODO plans removal after the frontend switch ("Compatibility"); this is a reminder, not an exploit. A `quotation:VIEW` user can still read Stock IDs and cost from the network. Suggested work: when Memo Return, Purchase and Sale switch (round 2), delete `fromStock.list`, drop `quotation`/`reserve`/`memo-out` from `memoStock.list`, and remove the frontend invalidations. Also correct the claim in `authorization.md` that a `lotKey` "reveals no data": a group-of-one key is `MS`/`OS` + the row uuid, an internal id that the same response already exposes as `memoStockId` / `ownStockId`.

### H3 — cursor dates are not checked as calendar dates; cross-service key migration has no mutual guard (hardening, not-applicable)

- Cursor: `Date.parse("2026-02-31")` is valid in V8 (verified in Node), so `decodeLotCursor` (master `lot-key.ts:46`, inventory `stock/lots.ts:33`) accepts it and inventory casts `${after.date}::date` in `lotsAvailablePage`, which PostgreSQL rejects → 500 `INTERNAL_ERROR`; master then reports own stock as `UNAVAILABLE` and logs an error. Same class as H2 of INV-20261120-001. Prerequisite: authenticated VIEW user with a hand-built cursor; impact is the wrong status and log noise only. Suggested work: round-trip check of the date in both decoders and answer 422 `cursor invalid`.
- Migrations: inventory `20261121090000_own_lot_key_per_stock` only checks `inventory.sale_line.lot_key`. Master document lines (`reserve_line`, `memo_out_line`, `quotation_line`) may already hold `OL…` own lot keys; master's `20261121090000_lot_key_without_price` guards those lines but runs separately. If inventory is migrated while master still holds `OL` lines, those lines would name keys that no longer exist (fail-closed: `STOCK_LOT_UNAVAILABLE`, nothing oversold). The migration header says dev and production hold none; suggested work: note the required order (master guard first, then inventory) in the release notes or devops contract.

### Not ticketed (observations)

- `approveWithin` (go-live, ADR-0050 D7) runs `engine.approveWithin` with no own-lot plan, so a Memo Out / Reserve with an own-lot line fails with 503 `INVENTORY_UNAVAILABLE` at go-live instead of applying (fail closed, functional only).
- `returnHoldsOf` (Memo Out Return prediction) uses `settleOldestFirst(...) ?? []` and could under-predict releases when a return exceeds the stored allocation; the save-time `exceeds_outstanding` rule and the tx1 settlement bound it. Memo Out Return was outside this review's file list; treat as unchecked.
- `sale_consumption.result` is capped at 262,144 bytes while a 200-line request with up to 2,000 locked rows can approach it; an oversize result would fail the CHECK with a 500 rather than a clean refusal. Unlikely at the stated data volume; no ticket.

## Proposed work

- Allowed code scope and assigned implementation role: backend (F1) — `backend-api-master/src/trade-document/{own-lot-lines,customer-stock-document}.ts` and tests under `backend-api-master/test/trade-document/`. H1/H2/H3 are separate optional hardening items for backend.
- Suggested remediation (F1): fail closed when a stored own-lot line cannot be fully allocated. In `planOwnLots` (and `writeOwnAllocations`) compare the plan's pcs and weight with the line's; on any shortfall raise the document's `<CODE>_PENDING_SHORT` / `STOCK_LOT_SHORT` (409, `details.lines[]` with the lot's available quantity, as the Memo Stock lot path does) before tx1, so nothing is applied. Keep the hold PUT as the authoritative check for races after the pre-read.
- SA design / contract / flow / dependency change needed: none for F1 (uses the existing error code and `details.lines[]` shape from the approved error-handling). H2 removal follows the existing compatibility plan.
- Acceptance criteria: approving or restoring a Reserve or Memo Out whose own-stock lot line exceeds what is on hand is refused with a short error and changes nothing (no hold, no allocation, status unchanged); two drafts naming the same own lot cannot both be approved; legacy own-stock lines and Memo Stock lot lines behave as before.
- Safe verification plan and prerequisites: unit test for the empty plan (shortfall → refusal); integration test with the inventory test double or dev stack using test data only: two draft Memo Outs of one own lot, approve both, expect the second refused.

## User selection and approval

- Approved ticket revision: 1 (F1 and H3; not H1 / H2)
- Actual user instruction / approval evidence: coordinator relayed 2026-11-21 that the user authorized fixing the finding: F1 plus H3, "Do NOT do H1/H2 (round 2)"
- Approval date: 2026-11-21
- Separate approved SA bundle/revision, if required: not required for F1

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: `own-lot:approve-short-plan-empty-no-hold`
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 0
- Active pass: none
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|

- Assigned owner and start date:
- Changed files / implementation revision:
- Checks performed, results, and limitations: static source inspection only; no tests, dev stack or live endpoint were run by the auditor.
- Follow-up auditor and verification evidence:
- Remaining risk or reopened validation gap: Memo Out Return own-lot settlement and the inventory hold endpoint were not exercised.
- Completion report under document/task/done/:
- Final status / date:

## Appendix: sec-auditor focused review of the same revision (2026-11-21, revision 1 addendum)

Mode: sec-auditor / focused pre-handoff review (guidance, static, read-only). Source: HEAD `b1036dc` plus the same uncommitted tree
(sha256 prefixes `lot-apply.ts` 4a22d8ffaac6e5d4, `lot-stock.service.ts` f9ccdeb56232d528, `purchase-lots.ts` 785e22a5400c8d76,
inventory `stock/lots.ts` 224fe91eb902df6b, `sale-consumption.ts` bcb711fdfbdcb093). Result: `blocked` for F1 only; `advisory` otherwise.
No new ticket: the root causes below are linked here instead of duplicated.

- F1: independently re-traced and concur (Medium, confirmed by source). `planOwnLots` stores `[]` for a short line;
  `writeOwnAllocations` throws only when `planned` is undefined; `inTx` then computes `final` from the (empty) allocation rows and
  `covered()` accepts any `final` that is not larger than `mid`. The save/create/update path is not affected
  (`completeOwnLotLines` raises `exceeds_pending`), only Approve/Restore. Memo Stock lot lines are not affected (`planMemoStockTakes` refuses short lines).
  Not run: a DB-backed two-draft approval.
- H1, H2, H3: concur, no change of assessment. Cursor note: master's `toDbDate` rolls an impossible date over (no error), only inventory's
  `::date` cast raises, so the effect stays "own stock UNAVAILABLE" for that caller.
- H4 (hardening, needs_validation): the 500-row group cap (`LOT_GROUP_MAX`, `lockLotCandidates`) makes a lot with more than 500 open
  Memo Stock rows permanently unpickable (422 `STOCK_LOT_TOO_LARGE`) while the picker still lists it. The 2026-11-21 key change (price removed)
  merges more rows, and any user who can create Memo Receive lines of one vendor, lot and details can push a lot over the cap. Validation gap:
  production count of lots with more than 500 open rows (and more than 2,000 for one Sale/Memo Out). Suggested work (backend): hide or flag such lots in the picker
  and show the existing admin message before selection; no contract change.
- H5 (hardening, extends H3 migration note): master `20261121090000_lot_key_without_price` guards only master document lines. Sale lines in
  `inventory.sale_line.lot_key` and `partner.sale_consumption.result` key `k` can hold price-bearing `ML` keys from the first migration; after
  the rebuild they resolve to nothing (fail closed: edit refused, applied allocation kept). Release note should require zero lot Sale lines in both services (dev/prod) before applying.
- Checked clear: authz on all new procedures (same grants as replaced ones), lotKey regex/prefix validation everywhere, cursor/limit bounds, tagged-template SQL,
  id-ordered lock plus bucket CHECK as final guard, vendor/currency ownership on Memo Return and Purchase lots, internal token guard and body/key caps, frontend rendering.
  Capacity: BE-LOT-011 numbers in testing.md (20,000 rows p95 under 150 ms) were not re-run; inventory RSS for a 200-key `stock/lots` call is still unmeasured (open).

## Resolution update (backend, 2026-11-21): F1 and H3

- F1 fixed. `planOwnLots` no longer leaves a short line out: it collects every line the lot cannot cover and throws `<CODE>_PENDING_SHORT` (409, field errors plus `details.lines[] {index, lotKey, availablePcs, availableWeightCt}`) from the saga's `next()` pre-step, before the acquire PUT and tx1. `writeOwnAllocations` re-checks in tx1 (`planCovers`: pcs and weight equal the line) and raises the same error, so an empty or partial plan can never be approved. Inventory's hold PUT stays the authoritative race check.
- Found while testing (same area, my earlier code): approving an own-lot Reserve / Memo Out through the fast path reached `writeOwnAllocations` with an empty plan and failed with 503 instead of re-running through the saga. An empty plan now throws `SagaRequired` (the existing re-run signal); under the saga a gap still fails closed (503).
- Test: `backend-api-inventory/test/phase2/own-stock.db.integration.test.ts` IT-LOT-F1 (two drafts of one own lot, 5 pcs: the first approve holds 5, the second is refused `MEMO_OUT_PENDING_SHORT` with `availablePcs 0`, no hold, no allocation row, status stays PENDING_APPROVAL, on-hand unchanged).
- H3 fixed. Both `decodeLotCursor` (master `lot-key.ts`, inventory `stock/lots.ts`) round-trip the date, so `2026-02-31` is refused (master 400 `VALIDATION_ERROR cursor invalid`; inventory 422 `VALIDATION_ERROR`, its own envelope convention). Tests: master `lot-allocation.test.ts` (impossible dates refused, leap day accepted), inventory IT-LOT-I01 (bad cursor gives 422, valid cursor pages). Migration order (master first, then inventory) is in `database-diagram.md`.
- Observations checked: `returnHoldsOf ?? []` can only under-predict a release; the final release PUT sends the applied set computed in tx1 from the recorded settlement, and tx1 settlement refuses a return above the allocation (`MEMO_OUT_RETURN_OUTSTANDING_SHORT`), so no stock is mis-released; left as is. `approveWithin` (go-live) with an own-lot line now raises `SagaRequired` out of the engine (before: 503 `INVENTORY_UNAVAILABLE`): still fail closed, nothing applied; legacy own lines already behaved the same way. Not fixed (functional only).
- Still open: H1, H2 (round 2), the `sale_consumption.result` size note, auditor re-review.

## Resolution update 2 (backend, 2026-11-21): H1, H2, H4, H5 and the Purchase output types

- H1: owner decision "keep price / vendor in the lot pickers". No code change; `authorization.md` now states that Memo Stock lot rows carry price, amount and vendor in every lot picker (same exposure as the removed procedures) and that a one-row `lotKey` is `MS`/`OS` + the row uuid, not an opaque hash.
- H2: `memoStock.list`, `fromStock.list` and `purchase.memoStock` removed from the router, with `FromStockService`, `MemoStockService.list`, their schemas, the inventory `/stock/available` route and the master client `available`; the Stock ID is no longer readable from those routes. `ACCEPT_NEW_ITEM_REFERENCES` is `false`: a new item reference is refused with `lot_required` on Quotation, Reserve, Memo Out, Memo Return and Purchase while saved documents keep working (test IT-LOT-H2). Test-only seam: `LOT_TEST_ACCEPT_ITEM_REFS=1` under Vitest.
- H4 documented in the bundle risks (lots above 500 open rows are listed but fail at Approve with `STOCK_LOT_TOO_LARGE`).
- H5 release note (zero lot lines before applying the migrations; master guard first, then inventory) in `database-diagram.md`.
- `PurchaseLineOut` declares `lotKey` and `allocated`.
- Not changed: Sale REST still accepts a legacy `memoStockId` on STOCK lines (not part of the H2 scope); the `sale_consumption.result` size note.

## Appendix 2: sec-auditor focused review of the round 2 delta (2026-11-23, no new ticket)

Mode: sec-auditor / focused pre-handoff review (guidance, static, read-only; no tests, stack or endpoint run). Source: HEAD `b1036dc` plus the uncommitted tree
(round 1 code and ADR/TODO documents excluded as requested; `backend-api-auth` csrf files not touched). Result: `clear` for the checked round 2 boundaries,
with advisory notes A1 to A3 (hardening, verdict not-applicable, no vulnerability severity, no separate ticket: linked here under the H2 root cause). No confirmed finding.

Checked clear:

| Boundary | Evidence |
|---|---|
| Authz after removal (router, trpc-handler, app.module) | `memoStock.list`, `fromStock.list`, `purchase.memoStock` are gone from `router.ts`; `MemoStockService` removed from `MasterServices`, the `MasterTrpcHandler` constructor and `app.module` providers consistently; `createMasterRouter` defaults `lotStock = new LotStockService()`. No grant was widened: `memoStock.lots` is `memo-return` / `memo-receive` VIEW (was six types, now two; the customer documents read `fromStock.lots`), `fromStock.lots` is `quotation` / `reserve` / `memo-out` / `sale` VIEW, `purchase.memoStockLots` stays `purchase:VIEW` alone. No orphaned permission mapping: no remaining reference to the removed procedures in `backend-api-master/src`, `backend-api-inventory/src` or `frontend/src` (only comments and `*.lots.invalidate()` calls). Purchase `create` / `update` still return `stockIds` as nulls (`hideStockIds`); Purchase and Memo Return line output has `stockId: null`. |
| Dead code removal | `/stock/available` route, `availablePage` use and the master client `available` are removed; the surviving inventory internal routes (`/stock/batch`, `/stock/lots`, `/stock/lots/available`, holds) stay behind the unchanged service-token guard with strict zod bodies and key regex (`OWN_LOT_KEY`, `LOT_KEYS_MAX`, duplicate check). The 500-char cursor decoded by master first (H3 fix). |
| `lot_required` enforcement | `refuseNewItemReferences` runs inside the save transaction (engine `prepare`) on every save path that takes an item reference: Quotation (`prepareStockLines`), Reserve and Memo Out (`completeStockLines`), Memo Return (`completeReturnLines`), Purchase (`prepare`). It reads the stored line references of the same document by primary key (fixed table map via `Prisma.raw`, document id bound as a parameter) and refuses any `memoStockId` / `ownStockId` that is not already on that document, with 400 `lines.N.reference lot_required`. A new document has no stored set, so every item reference is refused. Legacy lines are kept only as the same item on the same document (never converted, never re-pointed to another item); duplicate rules in the schemas still apply. The filter to `lot_required` in `refuseNewItemReferences` drops the `invalid` code that `itemReferenceErrors` also produces for a line with both an item id and a `lotKey`, but every document schema (`memo-schemas` L39/L153, `quotation.schemas` L104-112, `purchase.schemas` L57) already refuses that combination before `prepare`, so there is no bypass (see A2). Own-lot lines go through `completeOwnLotLines` / `planOwnLots` (round 1 F1 fix). |
| Test seam `acceptNewItemReferences` | Returns true only when the constant `ACCEPT_NEW_ITEM_REFERENCES` (false) or both `process.env.VITEST === "true"` and `process.env.LOT_TEST_ACCEPT_ITEM_REFS === "1"` hold. The variables appear only in `lot-key.ts`, `test/setup.ts`, the master lot integration test and the inventory test harness; no Dockerfile, Compose file, workflow or `.env` template sets either, so production cannot enable it through the repository's configuration. Requires control of the process environment (infrastructure compromise), outside this threat model. See A1. |
| Approve Center search | `stock: "lot"` for Quotation, Reserve, Memo Out, Memo Return and Purchase searches `l."lot" ILIKE` (column exists on all five line tables, `VarChar(40)`); pattern is a bound parameter with `escapeLike`, table and column names come from the fixed registry. Stock ID is no longer searchable on those menus, which also removes the Stock ID existence oracle for approvers. Memo Receive and Memo Out Return keep Stock ID search (owner Q3). Menu permission gating is unchanged. |
| Frontend rendering and lotKey handling | No `dangerouslySetInnerHTML`, `innerHTML`, raw `href` from data, `window.open` or `eval` in the changed files; lot names, stone codes, notes and server error texts are rendered as React text children or `aria-label` strings (merge dialog `Lot {lot}`, `LotCell`, `lotSelectLabel`, lot error texts). `lotKey` is an opaque value sent back in tRPC bodies only (never in a URL, storage or log); `findMergePairs` / `memoStockKey` use it as an in-memory React key. Memo Return and Purchase send `lotKey` alone for new picks (`memoStockId: null`), legacy lines keep their item id. `fromX` mappers set `stockId: ""` and never read a Stock ID. `lot-stock.ts` error mapping reads `details.lines[]` defensively (`shortLotLines` skips malformed entries, numbers and strings coerced). Server `lotKey` regex, prefix rules and re-derivation on save and approve remain the trust boundary. |
| Sale memoOnly picker | Sale `lotToSaleLine` sends `lotKey` (or the legacy `memoStockId`); inventory's Sale schema accepts only `ML` / `MS` keys, refuses a lot with an item id and a lot on a RESERVE line, so an own-stock `OL` / `OS` key from a tampered client is rejected server-side even though `memoOnly` is a client filter. |

Advisory notes (hardening, not-applicable, no vulnerability severity):

- A1 (hardening): the test seam is an environment switch inside production code (`lot-key.ts`). Not exploitable without environment control, but an unset `NODE_ENV` guard would remove the question entirely. Suggested work (backend, optional): also require `process.env.NODE_ENV !== "production"`, or move the seam into the test setup (for example `vi.mock` of `acceptNewItemReferences`) so no env-driven bypass ships in the bundle.
- A2 (hardening): `refuseNewItemReferences` keeps only `lot_required` and relies on the schema for the both-reference refusal. Defence in depth: let it also raise the `invalid` error (the filter was added so lot-bearing lines are left to the schema). Optional, no change in behaviour today.
- A3 (observation, not ticketed): `fromStock.lots` is gated by `sale:VIEW` and the server does not know Sale wants Memo Stock only (`memoOnly` is applied in the browser), so a `sale:VIEW` holder's pages also query inventory and receive own-stock lot rows (location, quantity, no price or cost; no new data class compared with Quotation or Reserve users). An optional server-side `source` filter would also save the inventory call and keep the own-stock notice out of Sale. Legacy item lines can no longer be found by Stock ID in Approve Center search on the five lot documents (functional only).

Limits: DB-backed integration tests (IT-LOT-H2 and the lot_required suites), the Vitest seam at run time and the 4 GB / 2 vCPU capacity were not run or measured by the auditor; the round 1 and round 2 frontend suites were not executed. The dirty tree changes two services and the frontend at once (133 modified files), so the review was limited to the round 2 files named in the request.

## Appendix: security-auditor focused review of the ROUND 2 delta (2026-11-23, revision 1 addendum)

Mode: security-auditor / focused pre-handoff review (static, read-only, no code run, no live service). Scope: round 2 only (removal of
`fromStock.list` / `memoStock.list` / `purchase.memoStock` and dead code, `lot_required` enforcement, the Vitest seam, Sale legacy `memoStockId`,
frontend round 2). Round 1 code and approved ADR/TODO documents were not re-reviewed. Source: HEAD `b1036dc` plus the uncommitted tree
(sha256 prefixes `lot-key.ts` a067fdec317f13bc, `stock-lines.ts` b00c5becec4eb015, `lot-stock.service.ts` f9ccdeb56232d528, `master/router.ts` ab13ee43eb740c4f,
`memo-stock-modal.tsx` 6ca28b7e4691ea0a). Result: `advisory` (one Low confirmed authorization widening, R2-F1; two hardening items). No `blocked` item.
No new ticket: linked here. `backend-api-auth` csrf files not touched or reviewed.

### R2-F1 — `fromStock.lots` lists our-stock lots to a caller whose only grant is `sale:VIEW` (Low, confirmed by source trace; category vulnerability, authorization widening)

- Evidence: `backend-api-master/src/master/router.ts` `fromStock.lots` is `permittedAny(["quotation","reserve","memo-out","sale"], "VIEW")`; `lot-stock.service.ts` `fromStockLots` calls inventory `lotsAvailable` first and returns own-stock rows unless the request carries `location: "memo"`. Sale's "Memo Stock only" is a client-side filter: `frontend/src/features/sale/components/SalePage.tsx:169-173` passes `memoOnly` to `MemoStockModal`, which only drops `source === "OWN_STOCK"` rows after the response (`memo-stock-modal.tsx:122`) and sends no `location` (`useFromStock({ q, from, to }, …)`).
- Before round 2: `sale:VIEW` could read `memoStock.list` (Memo Stock only) and could not read our stock (`fromStock.list` excluded `sale`). Now a `sale:VIEW`-only user can call `fromStock.lots` directly and read inventory own-stock lot rows (stone attributes, location, Load doc no. and date, quantities; no cost, price or vendor). `authorization.md` records the new `sale` grant but not this exposure, and inventory Sale rejects own lot keys on save, so the data has no Sale purpose.
- Prerequisite and impact: authenticated user with `sale:VIEW` and none of quotation / reserve / memo-out VIEW, calling the tRPC route by hand. Impact is read-only exposure of our-stock lot data and an extra inventory call per page; no write, no cost.
- Functional side effect (same cause): because own lots are listed first and filtered in the browser, a Sale picker page can be filled with own rows that are then hidden, so Memo Stock lots can appear empty or late.
- Suggested work (backend + frontend, no contract change if done by grant): for a caller who does not hold quotation / reserve / memo-out VIEW, force the memo-only path server-side (treat as `location: "memo"`); frontend Sale should also send the memo-only filter so the server skips the inventory call. Test: a `sale`-only principal gets no `OWN_STOCK` row and inventory `lotsAvailable` is not called. Alternative if the owner wants Sale to see own stock: state it in `authorization.md`.
- Owner: backend (server rule), frontend (send the filter). Not yet selected by the user.

### R2-H1 — Sale REST still accepts a new legacy `memoStockId` (hardening, not-applicable)

- Evidence: `backend-api-inventory/src/modules/sale/schemas.ts` `saleRules` accepts `memoStockId` or `lotKey` on any STOCK line; `prepare.ts` resolves a `memoStockId` through the legacy item path and master's consumption v1 path (`inventory-internal.schemas.ts` `saleConsumptionLineSchema`). Unlike the other five documents there is no "already on the stored sale" rule, so a new item id is accepted.
- Assessment: bounded. The caller needs `sale:ADD/EDIT`, the same grant that lets them pick any Memo Stock lot; the item uuid is only learnable from a group-of-one lot key (`MS` + uuid), a legacy line, or an old response. Effects are (a) a specific Memo Stock item can be taken, bypassing the FIFO lot allocation, and (b) Sale detail returns that item's Stock ID (Sale shows it by owner Q3, so no new data class). Not an exploit; a consistency gap with Q-LOT-09.
- Suggested work (backend, no new contract): refuse a `memoStockId` not already on the stored sale with `lines.N.reference lot_required`, the rule the other documents use; keep stored legacy lines working. Or record the decision to keep it in the Sale ADR.

### R2-H2 — the `LOT_TEST_ACCEPT_ITEM_REFS` seam ships in the production bundle (hardening, not-applicable)

- Evidence: `lot-key.ts:58-60` `acceptNewItemReferences()` is `ACCEPT_NEW_ITEM_REFERENCES (false) || (process.env.VITEST === "true" && process.env.LOT_TEST_ACCEPT_ITEM_REFS === "1")`. `test/setup.ts:11` sets the second variable for the master suites only.
- Reachability in production: both variables must be set on the process. `backend-api-master/Dockerfile` sets `NODE_ENV=production`, runs `node dist/main.js` and does not set either; `docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.gms.dev.yml` contain no `env_file`, `VITEST` or `LOT_TEST_ACCEPT_ITEM_REFS` (grep over the repo, `.github` and `docker/` found no other source). No request path can change process environment. Conclusion: unreachable in the built containers unless an operator sets both variables; not exploitable by a client. The inventory `harness.ts:85` assignment is test-only and inventory never reads it.
- Suggested work (optional, backend): also require `process.env.NODE_ENV !== "production"` in `acceptNewItemReferences`, so a mis-set variable cannot reopen the legacy path.

### Checked clear (round 2)

- Permission grants: no grant lost. `memoStock.lots` keeps memo-return and memo-receive VIEW (narrower than the old `memoStock.list`, which also took memo-out, reserve, quotation, sale and an optional vendor); customer-side pickers moved to `fromStock.lots` (quotation, reserve, memo-out, plus `sale`, see R2-F1); `purchase.memoStockLots` keeps `purchase:VIEW`. `purchase.create/update` keep ADD/EDIT with CSRF and `hideStockIds`.
- Removed code, no orphan: no remaining reference to `fromStock.list`, `memoStock.list`, `purchase.memoStock`, `FromStockService`, `MemoStockService`, `availablePage`, `/stock/available`, or the master client `available` in any `src`, compose, nginx or workflow file (only stale wording in two test titles: `frontend/test/trade-document/own-stock.integration.test.ts:279`, `backend-api-master/test/trade-document/memo-receive.db.integration.test.ts:315`). Inventory `/internal/v1/master` routes keep the same service-token guard, body limit and strict zod bodies; the new `/stock/lots[/available]` were round 1.
- `lot_required` enforcement: `refuseNewItemReferences` runs inside the save transaction on Quotation (`quotation.service.ts:750`), Reserve and Memo Out (`customer-stock-document.ts:103`), Memo Return (`memo-return.service.ts:28`) and Purchase (`purchase.service.ts:173`), reads the stored line references of that document only, uses a fixed table map (`Prisma.raw` on constants, parameters for the id) and accepts an item id only when the same document already stores it, so legacy saved lines still load, save and are re-validated by `completeFromMemoStock` / the Memo Return and Purchase completion (existence, pending, vendor, currency). A new item id cannot be laundered across documents. The helper discards the `invalid` code from `itemReferenceErrors`; the lot-plus-item combination is still rejected by every line schema (quotation `quotation.schemas.ts:110-112`, memo-schemas Memo Out and Memo Return, purchase rules), verified by reading all five.
- Frontend round 2 (Memo Return lots modal, Purchase lot picker and merge dialog, Sale picker, approve-center, `lot-stock.ts`): lot, stone code and vendor text render as React text children and `aria-label` strings; no `dangerouslySetInnerHTML`, `innerHTML`, raw `href`, `window.open`, `eval`, `console` logging of rows, or browser storage of lot data (the only `localStorage` use is the pre-existing editor width). `lotKey` is held as an opaque form value, sent only as a tRPC input, used as a React row key, never put in a URL or DOM id. Memo Return and Purchase lines carry `stockId: ""` / null and the server outputs `stockId: null`; the approve-center search now matches the lot (`l."lot" ILIKE` with `escapeLike`) instead of the Stock ID. Vendor, price and amount in Memo Return and Purchase pickers are the owner-accepted exposure (H1).
- Not ticketed: in Quotation `completeOwn` calls inventory for an own item id before `refuseNewItemReferences` runs in the transaction, so a refused own item id costs one inventory read (no leak; the 400 versus invalid-reference difference reveals only whether a random uuid exists, which is not guessable). Functional only.

Limits: static source review; no test, dev stack or live endpoint run; Sale consumption v1 lock behaviour for a legacy `memoStockId` line and the two frontend integration suites were not exercised. Privacy obligations (Memo Stock vendor data visible to customer-side roles) belong to compliance-auditor and are not assessed here.
