# INV-20261107-001 — Approve Center approves a newer version than the one the approver reviewed

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: frontend
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor / focused pre-handoff review / none
- Date and audit scope: 2026-11-07; approve-center rev 1 frontend Phase 1 (uncommitted `frontend/src/features/approve-center/**`, `frontend/src/app/(app)/approve/**`, `features/home/{navigation.ts,sidebar.tsx}`); backend-api-auth local edits excluded
- Source commit, dirty paths, and relevant content hashes: HEAD `26f874b`, dirty/untracked; sha256 prefixes `model.ts` 0d42c4e5ec4348bc, `components/ApproveCenterPage.tsx` bb38ea5c2585a6e8, `api.ts` 871a79a956ddf6a8
- Related ticket / root-cause fingerprint: none found (no sec-auditor approve-center record); fingerprint `approve-center:expectedVersion-from-fresh-get`
- Category: vulnerability
- Verdict: confirmed
- Vulnerability severity: Low

## Evidence and impact

- Affected files and line numbers:
  - `frontend/src/features/approve-center/model.ts:357-380` `runBulkApprove`: for each selected row, `calls.prepare(row.id)` (`get`) is called immediately before `calls.approve(row.id, version)`, using the version from that fresh `get`.
  - `frontend/src/features/approve-center/api.ts:110-115` `prepare` returns only `{ version, lineCount }`; the `updatedAt` from `get` is discarded.
  - `frontend/src/features/approve-center/components/ApproveCenterPage.tsx:194-204` (single) takes the version at the Approve click; the confirm dialog (`model.ts:280-282`) shows doc no. and line count only, not the values shown in the row.
  - `model.ts:103-115` keeps the list `updatedAt` as `submittedAt` but it is never compared with the `get` result.
- Attacker prerequisites and reachable entry point: an authenticated user with `<leaf>:UPDATE` on a document in `PENDING_APPROVAL` (pending documents are editable: `editableStatuses: [PENDING]` in e.g. `backend-api-master/src/trade-document/customer-stock-document.ts:164`, `purchase.service.ts:118`, `memo-receive.service.ts:142`; engine `update` at `document-engine.ts:286-313`).
- Concrete trust boundary and source-to-sink trace: approver loads the pending list (row shows party, grand total, `updatedAt`; `staleTime` 30 s) → maker edits the document (version v→v+1, new lines/values) → approver selects the row and confirms "Approve selected" (or clicks Approve) → client calls `<doc>.get` and gets v+1 → `<doc>.approve({ id, expectedVersion: v+1 })` → server guard matches, so the edited content is approved and its stock effects (hold/cut/move) are applied.
- Observed impact and independent verification evidence: the optimistic-concurrency token is refreshed instead of pinned to what the approver reviewed, so the `_CHANGED` path cannot fire for edits made before the click. This contradicts the approved behaviour in `document/apps/frontend/approve-center/error-handling.md:12` and acceptance case UA-AP-06 in `testing.md:46` ("the same Reserve open in another tab and edited → changed by someone else"). For bulk, the window covers the whole period from list load through confirmation and every earlier row in the run. Server authorization, CSRF and status guards still apply; the impact is limited to the maker-checker review integrity (approving content not seen). Verified by source reading; no live approve was sent.
- Missing validation fact / capability (if any): none for the client logic. A live approve against the dev stack was not run (it changes data).
- Sanitized evidence sufficient for owner review: the file:line trace above.
- Raw report/run links: none.

## Proposed work

- Allowed code scope and assigned implementation role: frontend, `frontend/src/features/approve-center/**`, `frontend/test/approve-center/**` (within FE-AP-005/006 allowed files).
- Suggested remediation: pin the reviewed state. Return `updatedAt` from `prepare` and, in both single and bulk paths, treat a `get` whose `updatedAt` differs from the row's listed `updatedAt` as changed (same handling as `_CHANGED`: no approve, warning toast, refetch the list, the row stays selected/marked). Optionally show the grand total in the single-approve confirm. Phase 2 (FE-AP-009, list `version`) should send the listed version directly and drop the pre-approve `get`.
- SA design / contract / flow / dependency change needed: none; uses existing `get` fields within the approved Phase 1 contract.
- Acceptance criteria: an edit made after the list was loaded is never approved from Approve Center without the list first being refreshed; UA-AP-06 behaves as specified; bulk skips (and reports) changed rows and continues with the rest.
- Safe verification plan and prerequisites: unit tests for `runBulkApprove` and single approve with a mocked `get` returning a newer `updatedAt` (expect no `approve` call and the changed outcome); existing IT-AP-04/05 updated; no live data change needed.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required: not required

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: approve-center:expectedVersion-from-fresh-get
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
- Checks performed, results, and limitations:
- Follow-up auditor and verification evidence:
- Remaining risk or reopened validation gap:
- Completion report under document/task/done/:
- Final status / date:
