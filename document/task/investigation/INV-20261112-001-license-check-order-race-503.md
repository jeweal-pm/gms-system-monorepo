# INV-20261112-001 — Concurrent license checks for one user fail with 503 AUTHORIZATION_UNAVAILABLE

## Tracking

- Ticket revision: 1
- Status: resolved 2026-11-12 (owner instruction "backend แก้ investigation INV-20261112-001"; ADR-0028 Amendment 1)
- Owner: backend (`backend-api-auth` license service); SA for the ADR-0028 amendment
- Priority: awaiting user review
- Auditor / mode / run ID: parent (frontend/backend), runtime diagnosis on the local dev stack after an owner report; no run ID
- Date and audit scope: 2026-11-12; owner report "frontend backend ตอนนี้ มันเชื่อม approve กับ approval" with screenshots of `/setup/approval` ("Couldn't load the approval settings.") and `/approve/quotation` ("Couldn't load Quotation approvals.")
- Source commit, dirty paths, and relevant content hashes: `53a7504` (PR #90 merged). Dirty paths are unrelated (home topbar/sidebar, LAN-only `backend-api-auth/src/trpc/auth-trpc.csrf.ts`).
- Related ticket / root-cause fingerprint: `license-current-decision-cas-loss-fails-active-active-race`. Related: ADR-0028, INV-20261020-001 (the ordering design this follows).
- Category: functional defect (availability); not a vulnerability
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers:
  - `backend-api-auth/src/license/license.service.ts:88-142`: `resolveCurrentStatus` takes `nextval('auth."LicenseCurrentCheckOrder"')`, calls the license server, then `persistCurrentDecision` upserts only `WHERE last_check_order < EXCLUDED.last_check_order`. When 0 rows return (`:141`), it throws `LICENSE_UNVERIFIABLE` 503.
  - `backend-api-master/src/master/license-client.ts:42-48`: any non-200 becomes `UNAVAILABLE`, with no retry by design (UT-MAUTH-08).
  - `backend-api-master/src/master/authorization.ts:30`: `license === "UNAVAILABLE"` throws `SERVICE_UNAVAILABLE` / `AUTHORIZATION_UNAVAILABLE`.
- Trace: every master request checks the license once per request (ADR-0028 context). A page load fires several master requests together: the tRPC batch, `notification.unreadCount`, the notification stream gate, and other batches. Requests A (order n) and B (order n+1) for the same user both get an ACTIVE answer. If B writes first, A's compare-and-set matches 0 rows, and A fails with 503 although both answers were ACTIVE.
- Observed impact and verification evidence (dev stack, 2026-11-12):
  - **Direct license endpoint:** 16, 16 and 32 concurrent calls to `POST /internal/v1/license/current` from inside the api-master container, all for one valid session. Results: 6/16, 4/16 and 7/32 returned `503 LICENSE_UNVERIFIABLE`; the rest returned 200 within 650 ms.
  - **Through nginx:** concurrent `approvalSetting.list` calls returned 503 `AUTHORIZATION_UNAVAILABLE` at a rate of 1–2 per 16–24 calls. The stack trace points at `authorization.ts:30`, the license line, not the authorization-read line.
  - **Headless page navigation:** going to `/approve/quotation` returned 503 on the `notification.unreadCount,decimalSetup.get` batch.
  - **Frontend retries:** reads retry twice (`retryTransient`), so a page usually recovers. **Mutations are never retried**, so a Save, Approve or Send-to-approve that overlaps a background read (unread-count refresh, stream gate) can fail outright.
- Ruled out:
  - **Authz reader:** the `auth.current_authorization` read takes 0.5 ms and the single connection answers in about 1.5 ms when warm.
  - **License responses:** api-auth answered every license call that it logged within 85 ms.
  - **Latent pool risk (not the cause):** a cold reconnect of the one-connection authz pool (10 s idle close, 1 s wait) failed 6 of 10 queued reads in a direct pool probe. It has not been observed through the app. It can be a separate ticket if wanted.
- Note on the owner's screenshots: the backends were restarted for the PR #90 migrations at about the same time. A page opened during that restart window exhausts its 2 retries and stays on "Couldn't load" until Retry or reload. After the restart, both pages loaded in a headless check (setup table rendered; Approve showed "Approval is off").
- Sanitized evidence: counts and error codes above. No tokens or credentials recorded.

## Proposed work

- Allowed code scope and assigned implementation role: backend, `backend-api-auth/src/license/license.service.ts` and its unit/DB integration tests.
- Suggested remediation (owner chooses):
  1. **Recommended. Amend ADR-0028 so that only a losing ACTIVE answer stays fail-closed when the stored newer decision is DENIED.** On a 0-row compare-and-set, re-read the stored row in the same statement or with one bounded query:
     - Stored newer decision ACTIVE and this answer ACTIVE: return this request's verified status (eligible).
     - Stored newer decision DENIED: keep the current fail-closed 503 (or 403).
     - This answer DENIED: fail closed as today.
     - This keeps ADR-0028's safety property (an older ACTIVE can never revive or bypass a newer denial) and removes false failures for ACTIVE/ACTIVE races. No schema change.
  2. Per-user single-flight in api-auth for concurrent checks of the same user (share one in-flight online check). Fewer license-server calls too, but ADR-0028 rejected per-process coordination for ordering across replicas, so it needs SA review. It can complement option 1, not replace it.
  3. Not recommended: retry once in api-master's license client. This conflicts with the approved bounded no-retry client (UT-MAUTH-08) and doubles license-server load.
- SA design / contract / flow / dependency change needed: yes for options 1 and 2. This changes the ADR-0028 decision text "an older active answer that loses the compare-and-set returns fail-closed 503". There is no API contract or schema change and no new dependency.
- Acceptance criteria:
  - Concurrent ACTIVE/ACTIVE checks for one user all return eligible: 0 of 32 concurrent calls return 503 on the dev stack.
  - The ADR-0028 tests still hold: active→404 and active→revoked completing out of order across two service instances leave the row DENIED, and a losing ACTIVE answer after a newer DENIED still fails closed.
  - Auth unit and DB integration suites, tsc and lint pass.
- Safe verification plan: unit tests with ordered fake persistence; an isolated PostgreSQL integration test for both race orders; the concurrent probe on the local dev stack only.

## User selection and approval

- Approved ticket revision: 1 (option 1)
- Actual user instruction / approval evidence: "backend แก้ investigation INV-20261112-001"
- Approval date: 2026-11-12
- Separate approved SA bundle/revision, if required: ADR-0028 Amendment 1, recorded in the ADR; the same owner instruction approves it, as stated in this ticket revision.

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

- Selected work ID / root-cause fingerprint: `license-current-decision-cas-loss-fails-active-active-race`
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 1
- Active pass: none (pass 1 succeeded)
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: success on pass 1
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|
| 1 | backend / `53a7504` + working tree | Older ACTIVE answer loses the ordered upsert to a newer ACTIVE answer (stack at `authorization.ts:30`, 25% of direct concurrent calls 503) | `persistCurrentDecision`: on a lost compare-and-set, an ACTIVE answer re-reads the row in a separate statement and stays eligible only for a strictly newer ACTIVE row | Unit 19 passed; isolated PostgreSQL 7/7 passed; tsc clean; dev probe 96/96 ELIGIBLE direct, 64/64 200 via nginx; both pages load headless | Resolved; both scoped reviews clear |

- Diagnosis note: an authz-pool change (keep the connection warm, 2 s wait) was tried first under the wrong hypothesis. The stack trace then showed the license line, so the change was reverted (no source change remains) and is not counted as a pass for this cause.

- Assigned owner and start date: backend, 2026-11-12
- Changed files / implementation revision: `backend-api-auth/src/license/license.service.ts` (`persistCurrentDecision`, new `newerDecisionIsActive`); tests `backend-api-auth/test/license/license-current.service.test.ts` (UT-LIC-ORDER-01…03) and `license-current.db.integration.test.ts` (IT-LIC-ORDER-01); ADR-0028 Amendment 1. Uncommitted on `53a7504`.
- Checks performed, results, and limitations:
  - `test/license`: 19 passed. The isolated PostgreSQL suite (disposable postgres:18.6-alpine on 127.0.0.1:55441, tmpfs, removed afterwards) passed 7/7, including the existing active→404 and active→revoked ordering tests.
  - tsc passes. eslint reports one existing unused import in `test/license/license-current.test.ts`, a file this change does not touch.
  - Dev stack: 96/96 concurrent direct checks ELIGIBLE (before: 17/64 failed); 64/64 `approvalSetting.list` 200 via nginx; `/setup/approval` and `/approve/quotation` load with no 503.
- Follow-up auditor and verification evidence: `sec-auditor` and `security-auditor` each ran one focused review of the same source revision (`53a7504` + the license diff). Both were clear with no findings. They confirmed that:
  - A DENIED answer never reaches the re-read.
  - A missing, not-newer or non-bigint row, or a read error, fails closed.
  - The separate autocommit re-read sees the winner's commit under READ COMMITTED.
  - Values are bound parameters.
  - Advisory (not a finding): the losing request returns its own verified claims, not the newer row's.
- Remaining risk or reopened validation gap:
  - A denial that commits after the re-read is ordered after the request, which is unchanged from a winning write.
  - The cold-reconnect latency of the one-connection authz pool (see Evidence) remains a separate, unobserved candidate.
- Completion report under document/task/done/: none; this ticket holds the record.
- Final status / date: resolved, 2026-11-12
