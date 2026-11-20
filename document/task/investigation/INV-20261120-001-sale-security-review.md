# INV-20261120-001 — Sale focused security review: Approve Center approves/rejects inventory documents at a freshly read version

Canonical security record for feature `sale` (SA rev 1, ADR-0054) on this source revision. The parallel
`security-auditor` review appends its outcome to this record instead of creating a duplicate.

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: frontend (F1); sa only if the pending-row shape gains `version` (see Proposed work)
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / focused pre-handoff review (guidance mode, static, read-only) / none
- Date and audit scope: 2026-11-20; backend-api-master sale consumption (migration `20261118090000_sale_consumption`, `src/inventory-internal/{sale-consumption.ts,sale-reads.ts,inventory-internal.*,inventory-token.guard.ts}`, reserve `usedBy`, router `sale:VIEW` grants); backend-api-inventory (migration `20261119090000_sale`, `src/modules/sale/**`, `platform/sync/saga.ts`, `platform/{master-api,errors,approval/settings,notification/store,auth/principal}.ts`, `app.ts`); frontend `features/sale/**`, `trade-document/{stock-picker.tsx,document-form.tsx,flow-status.ts}`, `approve-center/**`, `approval-setup/model.ts`, `notifications/api.ts`, `load-to-stock/types.ts`, `home/navigation.ts`. Excluded by request: `backend-api-auth/src/trpc/auth-trpc.csrf.ts` + test, `ApprovalSetupPage.tsx`, `home/breadcrumbs.tsx`.
- Source commit, dirty paths, and relevant content hashes: HEAD `b513d78` (with `a407cda`, `3af6c7b`, `731fcc6`, `594e736`, `44eec37`, `48ad533`) on `feat/18-11-26-sale` + uncommitted frontend working tree. sha256 prefixes: `frontend/src/features/approve-center/inventory.ts` 0f66dd799a055806, `approve-center/model.ts` 52c36f40a4763def, `approve-center/components/ApproveCenterPage.tsx` 3d06e775a6ba09f2, `backend-api-inventory/src/modules/sale/read.ts` 20af7ec3d1e7738c
- Related ticket / root-cause fingerprint: same root cause class as resolved INV-20261107-001 (master documents); fingerprint `approve-center:inventory-pending-version-0-fresh-get`. Not previously recorded for inventory documents.
- Category: vulnerability (F1); hardening (H1; H2 from security-auditor, see appended outcome)
- Verdict: F1 confirmed; H1, H2 not-applicable
- Vulnerability severity: F1 Low

## Review result

`advisory` — no blocking issue. One Low maker-checker integrity finding (F1) and one hardening note (H1).
Boundaries checked and clear:

| Boundary | Evidence |
|---|---|
| Grants per route | `modules/sale/routes.ts`: VIEW on options / next-number / reserve-lines / list / get / photo read; ADD create; EDIT update; ADD or EDIT submit and photo upload; APPROVE+VIEW (`canApprove`) approve / request-revision / reject and `/approval/pending?type=sale`; DELETE delete / restore. `/approval/summary` sale count only for `canApprove`; notifications `scope=all` filtered per VIEW. Matches `authorization.md`. |
| CSRF / body caps | `platform/http.ts:52` rejects non-GET/HEAD/OPTIONS without trusted Origin / same-origin Fetch Metadata for every route; `app.ts` jsonCap for all except `/sale/photos` (photoCap), applied before `session`. |
| Internal master API | `/internal/v1/inventory/sale*` and `sale-consumptions/:saleId` under `InventoryServiceTokenGuard` (separate token, SHA-256 + `timingSafeEqual`, refuses when equal to the partner token); `X-Actor-User-Id` audit only; strict zod schemas with ≤ 200 lines/ids. |
| Input validation | Strict zod objects, decimal scale/size regexes, 1–200 lines, ≤ 5 photos/line, ≤ 200 exclude ids, `q` ≤ 100, cursors ≤ 300 and re-validated on decode; cross-field rules; server-computed totals with oversize check. |
| IDOR | Line ids reused only when stored on this Sale (`service.ts:241-243`); addresses must belong to the customer (`sale-reads.ts:120-161`); Reserve lines must be the Sale's customer + currency (inventory `prepare.ts:241` and again under lock in master `planConsumption`); photos only READY `sale-line` files linked to this Sale or the caller's own unlinked upload (`repository.ts:117-130`, `photos.ts:48-55`). Any `sale:VIEW` can read any Sale / linked photo / customer's open Reserve lines by design (`authorization.md` Data exposure). |
| Stock never oversold / TOCTOU | Save-time prepare is advisory; the authoritative check is master `applyConsumption` in one WRITE_TX: header upsert lock → Reserve headers FOR SHARE → Reserve lines FOR UPDATE → memo_stock FOR NO KEY UPDATE (id order); increases bounded by line open, item `reserved`, item `pending`; decreases bounded by `sold ≥ purchased` (IN_USE); DB CHECKs `reserve_line_sold_check`, `memo_stock_balance`, `memo_stock_purchased_check`. Idempotency by revision + request hash (same revision, different hash → STALE). Inventory guarded updates on `version` / `status` / `sync_state`; saga lease 15 s; refused op keeps its revision. Reserve edit/delete of an auto-approved Reserve consults `reserveUsedBy` after its header `FOR NO KEY UPDATE`. |
| SQL safety | All raw SQL uses tagged-template parameters; `Prisma.raw` only for whitelisted sort columns / fixed op-store identifiers; LIKE input escaped. |
| File upload | Limiter slot before `formData()`; size 1..5 MiB; type sniffed from magic bytes (JPEG/PNG); key from `@gms/storage buildKey` under `sale/` (no client path); streamed with `sizeGuard`; read requires `sale/` prefix, `nosniff`, sniffed content type. |
| Error leakage | Codes + ids/quantities only; master refusal details re-mapped to row field errors (≤ 50); logs carry ids/codes. |
| XSS | Frontend renders text through React; no `dangerouslySetInnerHTML`; ids in URLs via `encodeURIComponent`; hrefs built from fixed bases. |
| Bounded queries / N+1 | Keyset pages ≤ 50 (limit + 1), set-based writes, ≤ 10 master statements per consumption, summary counts capped at 100, shared sweep ≤ 20 ops, DONE ops purged in batches. |

## Evidence and impact

### F1 — inventory pending rows carry version 0, so Approve Center reads the current version just before approve / reject / revise (Low)

- Affected files and line numbers:
  - `frontend/src/features/approve-center/inventory.ts:55` `version: item.version ?? 0` (inventory pending items have no `version`); `:44-47` documents "0 means read it with `get` before the call".
  - `frontend/src/features/approve-center/inventory.ts:116-122` `saleDocumentClient.withVersion`: `expectedVersion > 0 ? expectedVersion : (await calls.get(id)).version`, used by approve / reject / requestRevision (same pattern pre-exists for Load to Stock at `:80-86`).
  - Callers that pass the row version (0): `frontend/src/features/approve-center/model.ts:461` (`runBulkApprove`), `components/ApproveCenterPage.tsx:236` (row Approve), `:388-389` (row Reject / Revise). Only the preview path (`:248`, `:283`) pins `detail.version`.
  - `backend-api-inventory/src/modules/sale/read.ts:260-273` `approvalPending` returns no `version` (as the contract, `api-contract.md:154`).
- Attacker prerequisites and reachable entry point: a `sale:ADD`/`EDIT` maker whose Sale is sent back (another approver uses Request revision, once per Sale) and who edits and resubmits it while an approver still has the earlier pending list open (list or bulk selection taken before the change).
- Concrete trust boundary and source-to-sink trace: approver lists pending Sales (row shows party, value, qty at version v) → Sale goes PENDING → REVISION_REQUESTED → edited (v+2) → resubmitted (v+3, PENDING again) → approver confirms the row Approve or bulk Approve → `withVersion` gets v+3 → `POST /sale/{id}/approve {expectedVersion: v+3}` passes the server guard → the edited content is applied to master stock (Reserve lines / Memo Stock sold). The server cannot raise `SALE_CHANGED` because the client never sends the reviewed version.
- Observed impact and independent verification evidence: maker-checker integrity only — the approver approves values they did not see. Server grants, CSRF, status guards and stock bounds still hold; a pending Sale itself is not editable (`service.ts:250-253`), so the window needs the revise → edit → resubmit cycle (max once per Sale) or a reject. Verified by source reading; no live approve was sent (it changes data). This reproduces the root cause fixed for master documents in INV-20261107-001 (FE-AP-009 "no `get` first").
- Missing validation fact / capability (if any): none for the logic; no dev-stack run.
- Sanitized evidence sufficient for owner review: the file:line trace above.
- Raw report/run links: none.

### H1 — `memoStock.list` returns vendor cost to `sale:VIEW` (hardening, accepted design)

- `backend-api-master/src/master/router.ts` `memoStock.list` now `permittedAny([... , "sale"], "VIEW")`; `memo-stock.service.ts:300-301` returns `unitPrice` / `netUnitPrice` (vendor memo cost). The Sale UI does not display it, but a `sale:VIEW`-only user can read it from the network response.
- Assessment: acceptable for this revision. It is an explicit, documented SA decision (`document/apps/backend/inventory/sale/authorization.md` "Data exposure", Q-SL-06), identical to the exposure already granted to Quotation / Reserve / Memo Out viewers, and the new Sale-specific internal reads (`prepare`, reserve-lines search) do not return vendor cost. Residual risk: role separation between "sales" and "vendor cost" is not enforceable while this shared response carries cost. If that separation is a business requirement, SA should design a cost-free projection for non-memo callers (or a `PRICE` grant check) as a separate change for all callers. No vulnerability severity; no code change is requested by this review.

## Proposed work

- Allowed code scope and assigned implementation role: frontend — `frontend/src/features/approve-center/{inventory.ts,model.ts,components/ApproveCenterPage.tsx}` and their tests.
- Suggested remediation (choose one):
  1. Frontend only (no contract change): for inventory menus (version 0), pin a version captured when the approver last saw the row content — e.g. route row Approve / Reject / Revise through the preview `get` and confirm with `detail.version` (as `:283`), and for bulk refuse rows with version 0 or fetch each detail and stop with "changed" when its `submittedAt` / value differs from the listed row.
  2. Additive contract field: `GET /approval/pending?type=sale` (and Load to Stock) returns `version`; frontend sends it directly and drops `withVersion`'s fresh-get fallback. Adding a response field to the approved contract needs SA confirmation if outside the approved design.
- SA design / contract / flow / dependency change needed: none for option 1; option 2 is an additive response field (SA decision).
- Acceptance criteria: an approve / reject / revise from the list or bulk never sends a version read after the row was displayed; a Sale resubmitted after the list was loaded is refused with `SALE_CHANGED` (or blocked client-side) instead of approved; unit tests cover row and bulk paths for `sale` and `load-to-stock`.
- Safe verification plan and prerequisites: frontend unit/integration tests with a controlled fetch (pending row v, detail v+3 → no approve at v+3); optional dev-stack check with test data only.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: `approve-center:inventory-pending-version-0-fresh-get`
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
- Checks performed, results, and limitations: review was static source inspection only; no tests or live endpoints were run by the auditor.
- Follow-up auditor and verification evidence:
- Remaining risk or reopened validation gap:
- Completion report under document/task/done/:
- Final status / date:

## security-auditor outcome (append below)

### security-auditor — focused pre-handoff review, 2026-11-20

- Source revision: HEAD `b513d78` on `feat/18-11-26-sale` + the uncommitted frontend working tree (same revision as above). Static, read-only source inspection; no tests, dev stack, or live endpoints were run. Excluded as requested: `backend-api-auth` CSRF files, `ApprovalSetupPage.tsx`, `home/breadcrumbs.tsx`.
- Result: `advisory`. No new vulnerability. F1 independently corroborated; H1 agreed (accepted SA decision); one extra hardening note H2.
- Boundaries inspected independently and clear:
  - Consumption saga: same revision + same hash replays from the stored result; same revision + different hash or lower revision → `SALE_CONSUMPTION_STALE` (`sale-consumption.ts:220-224`); a plan refusal rolls back the header upsert. Inventory numbers each op `GREATEST(applied, max(op))+1` (`service.ts:125-130`), so a refused or purged op never reuses a revision master applied; `recover` (`service.ts:47-48`) only accepts an exactly equal applied revision, and op payloads are immutable per revision, so a hash-different payload at the same revision is not reachable. Crash between master apply and inventory tx1 leaves the op PREPARED/SYNCING; re-drive replays (`saga.ts:142-177`); 5xx/timeout → retry, never refusal (`master-client.ts:114`).
  - Double spend / holds: Reserve line `FOR UPDATE` and Memo Stock `FOR NO KEY UPDATE` in id order under READ COMMITTED serialise concurrent Sales; RESERVE increases ≤ line open and ≤ item `reserved`, STOCK increases ≤ item `pending` (`sale-consumption.ts:117-153`), so a Memo Out hold inside `reserved` is never consumed; DB CHECKs back this. Reserve header `FOR SHARE` vs Reserve edit/delete `FOR NO KEY UPDATE` then `reserveUsedBy` (`reserve.service.ts:25-34`, `document-engine.ts:429-435,474-480`); FK RESTRICT from `sale_consumption_line` protects consumed Reserve lines / Memo Stock rows. No lock-order inversion found against Reserve / Memo Out / Memo Return approvals (all lock `memo_stock` last).
  - Internal API: token-only guard with distinct credential and constant-time compare; strict schemas (≤ 200 lines/ids, duplicate checks mirror the inventory rules).
  - Cross-customer: inventory `prepare.ts:180` and master `planConsumption` (`sale-consumption.ts:83`) both bind Reserve lines to the Sale's customer + currency; addresses bound to the customer in SQL (`sale-reads.ts:125`). Photos: link/read rules at `repository.ts:56-69`, `photos.ts:48-55`.
  - Uploads, body caps, CSRF, error envelopes, frontend rendering: as listed in the table above; no additional issue.
- F1 corroboration: `frontend/src/features/approve-center/inventory.ts:55` (`version: item.version ?? 0`) and `:116-122` (`withVersion` fresh `get`); `model.ts:132` documents the row version as the `expectedVersion`. Agree with Low and the proposed remediation.
- H2 — crafted list cursors return 5xx instead of 422 (hardening, verdict not-applicable, no vulnerability severity):
  - `backend-api-inventory/src/modules/sale/read.ts:183,198`: the Daybook cursor date is checked by regex only (`\d{4}-\d{2}-\d{2}`), then cast `::date`; e.g. month 13 raises a PostgreSQL cast error → `INTERNAL_ERROR` 500 (`platform/http.ts:33-35`).
  - `backend-api-master/src/inventory-internal/sale-reads.ts:65,80-85`: the From Reserve cursor `p` is any integer cast `::smallint` (out-of-range → DB error) and `d` passes through `toDbDate`, which yields an Invalid Date for month 13 → master 500 → inventory treats it as master unavailable (503 to the caller, error-level logs on both services).
  - Prerequisite: authenticated `sale:VIEW` user sending a hand-built cursor. Impact: wrong status and error-log noise only; responses stay generic, no data exposure, no amplification (one query per request, no circuit breaker).
  - Suggested work (owner backend; no contract change): validate cursor dates as real calendar dates (round-trip check) and bound `p` to the `position` range (1–200 / smallint) in the decoders, returning `VALIDATION_ERROR` `cursor invalid`. Acceptance: tests showing month-13 / out-of-range cursors answer 422 on `GET /sale` and `GET /sale/reserve-lines`.
- Not separately ticketed (pre-existing or accepted by design): `sale:VIEW` sees any customer's open Reserve lines and any linked Sale photo (`authorization.md` Data exposure); unlinked photo uploads are bounded by concurrency (≤ 3) but not by per-user quota, the same as Load to Stock under ADR-0030 permanent retention; `GET /sale/{id}` may re-drive a stale op for a VIEW-only caller (design "re-drive on access").
