# INV-20261112-002 — Notification summary clip can split a surrogate pair and roll back the approval action

## Tracking

- Ticket revision: 1
- Status: resolved 2026-11-12 (owner instruction "backend แก้ investigation INV-20261112-002")
- Owner: backend
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / focused pre-handoff review (guidance mode) / no full run
- Date and audit scope: 2026-11-12; notifications BE-NT-007 changed paths only (notification-store.ts, notification-types.ts, document-engine.ts review/notifyCreator, quotation.service.ts submit/approve/review, frontend notifications model/NotificationItemRow)
- Source commit, dirty paths, and relevant content hashes: HEAD 53a7504 plus uncommitted BE-NT-007 diff; notification-store.ts blob b779112aa0d365a2e8649d469761623632506453
- Related ticket / root-cause fingerprint: none; `clip()` slices UTF-16 code units before the code-point-safe shrink loop
- Category: vulnerability (availability)
- Verdict: confirmed (static trace plus a Node reproduction of the split; the database rejection itself was not executed)
- Vulnerability severity: Low

## Evidence and impact

- Affected files and line numbers: backend-api-master/src/notification/notification-store.ts:20 (`clip` uses `.slice(0, 200)`), :24-41 (`cleanSummary`; the shrink loop runs only when the JSON exceeds 960 bytes), :61 (insert into `notification_event.summary` jsonb); callers backend-api-master/src/trade-document/document-engine.ts:629-635 and backend-api-master/src/quotation/quotation.service.ts:494-496, 563-570.
- Attacker prerequisites and reachable entry point: an authenticated approver submitting `reject` / `requestRevision` (reason up to 500 UTF-16 units), or any user able to save a customer/vendor name (VarChar(200) counts code points, so it can hold 201+ UTF-16 units) that later becomes `partyName`.
- Concrete trust boundary and source-to-sink trace: reason/note or party name -> `clip()` cuts at UTF-16 index 200 -> when a supplementary character (emoji) straddles index 199/200, a lone high surrogate remains -> the 960-byte loop does not run for a short summary -> `JSON.stringify` emits `\ud83d` -> PostgreSQL jsonb input rejects an unpaired surrogate escape -> the error rolls back the whole review / submit / approve transaction (BE-NT-007 moved the notification into that transaction).
- Observed impact and independent verification evidence: `node -e` with `"a".repeat(199)+"\u{1F600}"` sliced at 200 serialises to `..."aaaa\ud83d"`. The reject or revise fails for that note; a party name of that shape blocks submit/approve/reject/revise of every approval document for that party until the name is edited. No confidentiality impact. UT-NT-14 only covers even-offset emoji (`"💎".repeat(200)`), so the case is untested.
- Missing validation fact / capability (if any): the DB-level rejection (PostgreSQL jsonb or Prisma 7.10 serialization layer) was not executed in this read-only review.
- Sanitized evidence sufficient for owner review: yes (above).
- Raw report/run links (local, ignored evidence may not exist on another checkout): none.

## Proposed work

- Allowed code scope and assigned implementation role: backend; backend-api-master/src/notification/notification-store.ts and its tests.
- Suggested remediation: clip by code points (`Array.from(text).slice(0, SUMMARY_TEXT_MAX).join("")`) or drop a trailing lone high surrogate after slicing; optionally strip unpaired surrogates from all summary texts.
- SA design / contract / flow / dependency change needed: no.
- Acceptance criteria: `cleanSummary` never returns an unpaired surrogate for odd-offset inputs (199 ASCII + emoji, in reason and partyName); a DB integration test rejects/revises with such a note and the review commits with its notification.
- Safe verification plan and prerequisites: unit test in test/notification/notification-core.test.ts plus the existing approval-documents DB integration suite on the local test database.

## User selection and approval

- Approved ticket revision: 1
- Actual user instruction / approval evidence: "backend แก้ investigation INV-20261112-002"
- Approval date: 2026-11-12
- Separate approved SA bundle/revision, if required: not required

Do not infer approval from creation of this ticket or approval of a different revision.

## Corroboration (security-auditor, same source revision)

`security-auditor` reviewed the same revision independently and found the same root cause: `clip` cuts by UTF-16 code units, leaving a lone surrogate, and the jsonb insert then fails inside the review transaction. It filed its own copy, which the parent merged here as a duplicate, by fingerprint. Its additions:

- **Reason length:** the review reason is trimmed to 1–500 characters (`src/approval/approval.schemas.ts:15-16`).
- **PostgreSQL error:** the json lexer refuses an unpaired high surrogate with "Unicode low surrogate must follow a high surrogate".
- **Before BE-NT-007:** these paths wrote no jsonb, so this failure could not occur there.

Where the two reviews disagree:

- **Category:** `security-auditor` classed this as hardening with no severity; `sec-auditor` classed it as a vulnerability (availability), Low. The owner sets the priority.
- **partyName:** `security-auditor` considered `partyName` bounded by `VarChar(200)`. `sec-auditor` noted that the column counts code points, so a 200-character name with emoji can exceed 200 UTF-16 units and hit the same split. The parent agrees with `sec-auditor`.

Same suggested fix from both: clip by code points.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles, revisions, and sessions for the same cause.

- Selected work ID / root-cause fingerprint: `notification-summary-clip-utf16-lone-surrogate`
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 1
- Active pass: none (pass 1 succeeded)
- Stop reason / missing prerequisite: success on pass 1

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|
| 1 | backend / `53a7504` + BE-NT-007 working tree | `clip` slices UTF-16 units; a lone high surrogate reaches jsonb | `clip` keeps at most 200 whole code points and replaces any lone surrogate with U+FFFD | UT-NT-15 passes. IT-AS-B02 now revises with 199 ASCII characters followed by an emoji: it **fails with the old `clip`** (PrismaClientKnownRequestError on PostgreSQL 18.6) and passes with the fix. Full api-master suite on a disposable DB: 714 passed / 17 skipped; tsc and eslint clean | Resolved |

- Changed files: `backend-api-master/src/notification/notification-store.ts` (`clip`), `test/notification/notification-core.test.ts` (UT-NT-15), `test/approval-setting/approval-documents.db.integration.test.ts` (odd-offset note). Uncommitted on `53a7504`.
- Follow-up auditor and verification evidence: the fix is the remediation both reviews suggested. It was verified by tests, including a reproduction on PostgreSQL before the fix and the pass after it. Per the remediation workflow, no further review pass was run.
- Remaining risk: none known. Summary texts are display-only.
- Final status / date: resolved, 2026-11-12
