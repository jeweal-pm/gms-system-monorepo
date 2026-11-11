# INV-20261111-001 — Notification stream reconnects drive refresh-token reuse and reconnect loops

## Tracking

- Ticket revision: 1
- Status: resolved 2026-11-11 (owner instructed the fix in chat: "แก้เลย"; frontend only, within ADR-0049 D6/D12)
- Owner: frontend (stream client `frontend/src/features/notifications/stream.ts`); backend coordination for the stream gate/hub if the chosen fix touches the server side
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor, focused pre-handoff review (read-only, static trace), no run ID
- Date and audit scope: 2026-11-11; feature `notifications` rev 1 (ADR-0049 Accepted, owner-approved 2026-11-11); backend notification module, master auth/router changes, approve hooks, nginx stream location, frontend notifications feature
- Source commit, dirty paths, and relevant content hashes: branch `feat/09-11-26-approval` @ `d74a890` plus uncommitted working tree. Git blob hashes: `frontend/src/features/notifications/stream.ts` `c23f0db0`, `frontend/src/features/notifications/api.ts` `e90beefd`, `backend-api-master/src/notification/notification-stream.ts` `28eaafef`, `backend-api-master/src/notification/notification-hub.ts` `b7ab6d95`
- Related ticket / root-cause fingerprint: `notification-stream-client-renews-on-every-reopen`. The stream client calls `/api/auth/refresh` on every reopen with no cross-tab coordination, and a `ready` event resets the failure counter, so reopen paths that are not counted as failures are unbounded. Related history: INV-20261102-001 (refresh/session churn forcing login).
- Category: functional defect (availability); not a vulnerability. Same convention as INV-20261102-001.
- Verdict: not-applicable (no attacker-controlled exploit is claimed). Runtime confirmation is still pending (see the validation gaps below).

## Evidence and impact

- Affected files and line numbers:
  - `frontend/src/features/notifications/stream.ts:41-48`: `reopen()` always calls `deps.renew()` before reopening.
  - `stream.ts:54-56`: `ready` resets `failures = 0`.
  - `stream.ts:60`: `reauth` calls `reopen(0)`, which is not counted as a failure.
  - `stream.ts:61-69`: on error, `reopen(5 s × failures)`.
  - `frontend/src/lib/domain-trpc-fetch.ts:25-34`: `refreshInFlight` deduplicates refreshes inside one browser tab only.
  - `backend-api-master/src/notification/notification-stream.ts:26-29`: `reauthDelay` uses an absolute time (`exp − 60 s`) and is clamped to 0.
  - `notification-stream.ts:87-92`: the server sends `ready`, then sends `reauth` and completes the stream when the delay is reached.
  - `backend-api-master/src/notification/notification-hub.ts:31-35`: a 4th stream for the same user closes the oldest stream.
  - `backend-api-auth/src/auth/refresh-credential.ts:87-90`: reusing a consumed refresh credential revokes the whole family, with no grace window.
  - `backend-api-auth/src/auth/refresh-http.ts:58-61`: any outcome other than `rotated` clears both token cookies.
- Attacker prerequisites and reachable entry point: none. Normal signed-in use can trigger all three paths below. This is a self-inflicted availability defect.
- Concrete trace:
  1. **Two or more browser tabs force a re-login.** All tabs send the same access cookie, so every stream opened within one access-token window gets the same `exp`. The server sets each stream's `reauth` timer to the same moment (`exp − 60 s`). Each tab receives `reauth` and calls `renewAccess()` at about the same time. Deduplication works only inside one tab, so the tabs send concurrent `POST /api/auth/refresh` requests with the same refresh cookie. The family lock lets the first request rotate the credential. The next request sees `consumed_at` and revokes the family (`reused`), and its response clears the cookies. Whatever order the responses arrive in, the session can no longer be renewed. The user is sent to login within at most 15 minutes, or immediately if the clearing response is processed last.
  2. **Four or more tabs cause endless eviction.** With the per-user cap of 3, each new stream closes the oldest one. The evicted EventSource fires `error`, the client renews and reopens after 5 s, and that stream evicts another tab's stream. Every successful reconnect sends `ready`, which resets `failures`, so `MAX_FAILURES` is never reached. The result is a permanent cycle of about one refresh rotation (an auth DB transaction plus a license eligibility check) and one stream open (JWT verify, a query on the single-connection authz reader, and a license check) every ~5 s per such user. Each rotation also adds a `RefreshCredential` row.
  3. **A zero-delay loop when renewal fails without clearing cookies.** Examples are a network error, or an nginx 502/504 while the auth service is down or slow, where `renew()` resolves `false` and the cookies stay. On `reauth` the client reopens at once with the same access token, which still has less than 60 s left. The gate accepts it, `reauthDelay` is 0, and the server sends `ready` (which resets `failures`) followed by `reauth` straight away. The client calls `reopen(0)` again. For up to ~65 s per tab per token window, this repeats as fast as the round trip allows. Each loop sends one refresh attempt and one authenticated stream open. All of these queue on the one-connection `MasterAuthzDatabase` client (`max: 1`, `connectionTimeoutMillis: 1_000`), which every master request needs for authorization. Other users can then get `503 AUTHORIZATION_UNAVAILABLE` during an auth-service outage.
- Observed impact and independent verification evidence: static source-to-effect trace only. The unit tests cover single-stream behaviour (`frontend/test/notifications/stream.test.ts` UT-NT-FE-07: reauth reopens without counting a failure). They do not cover several tabs, eviction, or a `ready` followed immediately by `reauth`.
- Missing validation fact / capability:
  - A runtime check with 2 and 4 real browser tabs against the dev stack, counting `/api/auth/refresh` calls and family revocation. No live services were contacted in this review.
  - How the production ingress handles the connection: HTTP/1.1 versus HTTP/2. Under HTTP/1.1, browsers allow about 6 connections per origin across all tabs, and the stream connections take some of them.
- Sanitized evidence sufficient for owner review: the file and line trace above. No credentials or payloads were used.
- Raw report/run links: none (focused review).

## Proposed work

- Allowed code scope and assigned implementation role: frontend, `frontend/src/features/notifications/{stream,api}.ts` and their tests. Backend only if the chosen fix needs the server-side changes below (`backend-api-master/src/notification/notification-stream.ts`, `notification-hub.ts`).
- Suggested remediation (the owner chooses):
  - Coordinate across tabs. Either run one leader stream per browser profile (Web Locks `navigator.locks` or `BroadcastChannel`) and share signals with the other tabs, or at least serialize `/api/auth/refresh` across tabs with a shared lock. A tab that gets the lock after another tab has just renewed should reopen without refreshing.
  - Never reopen at 0 delay twice in a row. Bound the `reauth` path and add jitter. Reset `failures` only after a stream has stayed open for a minimum time, not on `ready` alone.
  - Do not reconnect an evicted stream automatically. Backend option: send a terminal event (for example `replaced`) before closing the oldest stream, and refuse a stream whose token has less than `REAUTH_LEAD_MS` left (401) instead of sending `ready` followed by an immediate `reauth`.
- SA design / contract / flow / dependency change needed: frontend-only coordination and backoff stay inside ADR-0049 D6/D12. A new stream event type, or a change to the gate's refusal semantics, changes the stream contract and needs SA approval. A refresh-reuse grace window in the auth service changes a security control and needs a separate SA/security decision. It is not recommended as the default fix.
- Acceptance criteria:
  - Two tabs with the same session reach `reauth` together: at most one `/api/auth/refresh` request is sent, and the session stays renewable.
  - Four or more tabs: after the cap is reached, no stream reconnect cycle continues. The number of stream opens and refreshes per minute is bounded and stays flat.
  - When renewal fails (`false`) and the access token is still valid, the number of stream opens in a 60 s window is bounded (for example ≤ 3) before the client stops.
  - Unit tests cover all three paths. Existing UT-NT-FE tests still pass.
- Safe verification plan and prerequisites: run unit tests with fake timers and a fake EventSource and lock. Optionally, run a manual check on the local dev stack with 2 and 4 tabs, counting refresh calls in nginx access logs. No production or shared services.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: `notification-stream-client-renews-on-every-reopen`
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

## Corroboration (parent, 2026-11-11)

- sec-auditor reviewed the same source revision (blob hashes: `stream.ts` c23f0db0, `notification-stream.ts` 28eaafef, `notification-hub.ts` b7ab6d95, `notification-store.ts` e21d7edc, `router.ts` 17be8361) and independently traced the same three paths. It created no separate record.
- Unrelated to this finding: after the reviews, the parent fixed a list-input defect: tRPC `useInfiniteQuery` sends `direction`, and the strict schema refused every panel load. `router.ts` now accepts `direction`, with a regression test in UT-NT-11. Verified live over LAN: the panel loads and the stream connects.

## Resolution (frontend, 2026-11-11)

Corrective ledger: one pass, frontend only, no contract, schema or server change. Iterations within the pass were each driven by a live check:

1. **Shared renewal across tabs** (`frontend/src/lib/domain-trpc-fetch.ts` `coordinatedRenew`). Only one tab renews at a time: the Web Lock `gms-auth-refresh`, or, without Web Locks, a localStorage lease `gms.auth.renewing` (`frontend/src/lib/tab-lease.ts`). A tab that waited reuses a renewal finished less than 10 s ago (`gms.auth.renewedAt`) instead of resending the rotated refresh cookie. This covers path 1 and every 401 renewal, not only the stream.
2. **One stream per browser** (`frontend/src/features/notifications/stream.ts`). The tab holding the Web Lock `gms-notification-stream`, or without Web Locks the localStorage lease `gms.notifications.leader` (TTL 90 s, renewed every 10 s), opens the EventSource. It relays `ready` / `notification` to the other tabs on BroadcastChannel `gms-notifications`. This removes path 2, since a single browser no longer reaches the per-user cap. On `pagehide` the stream and lease are handed over at once, and a back/forward-cache restore restarts the stream.
3. **Bounded reconnects.** The failure count is reset only after a stream stayed open 30 s (`HEALTHY_MS`). A `reauth` earlier than that counts as a failure and backs off 5 s / 10 s / 15 s. A normal `reauth` reopens after a random delay of 0–3 s, never at 0. After 3 failures in a row the stream stops and keeps its lock or lease, so no other tab retries. This removes path 3.

Found during live verification and fixed in the same pass:

- `http://192.168.0.104` is not a secure context, so `navigator.locks` is absent there. Live check before the lease fallback: 4 tabs opened 11 streams.
- A React dev double-mount left a just-claimed lease unreleased, so nothing streamed for 90 s. `stop()` now always releases a lease it owns. Regression test UT-NT-FE-15.

Verification:

- `frontend/test/notifications/stream.test.ts` UT-NT-FE-06…15: healthy reauth, early reauth backoff, short-lived `ready` does not reset (eviction), sign-out, Web Lock single stream plus relay plus takeover, shared renewal with the lock and with the lease, lease takeover on release and on lapse, release during claim.
- Frontend suite: 937 passed; tsc clean; eslint clean on the changed files.
- Live, headless Chrome, 4 tabs of one browser:
  - Over LAN `http://192.168.0.104` (lease path): 1 open stream in total. After the streaming tab left, exactly one other tab took over.
  - On `http://localhost:8080` (secure context, Web Locks path): 1 open stream in total; takeover by exactly one other tab, repeated in 3 runs.
  - One run was invalid: nginx's login limit answered 429 to the probe's sign-in, so no session and no bell.
- Not exercised live: an actual two-tab `reauth` at token expiry (about 14 minutes). Covered by the unit tests of `coordinatedRenew`.
- Server-side options (a terminal `replaced` event, refusing streams with less than 60 s of token left) were not needed and remain open for SA if wanted.
