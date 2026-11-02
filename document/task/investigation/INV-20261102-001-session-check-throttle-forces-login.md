# INV-20261102-001 — Normal clicking sends users back to the login screen (session check throttled)

## Tracking

- Ticket revision: 1
- Status: resolved (2026-11-02)
- Owner: backend (auth service rate-limit rule); frontend part noted below
- Priority: awaiting user review
- Auditor / mode / run ID: manual-tester, customer-perspective full-system check (not a security audit)
- Date and audit scope: 2026-11-02; whole running dev stack via nginx `http://localhost:8080`
- Source commit, dirty paths, and relevant content hashes: `feat/02-11-26-manual-tester` @ `4753205`, clean tree
- Related ticket / root-cause fingerprint: `get-session` falls under the auth service's global limit (30 requests / 60 s, keyed by client address); the web app treats the refused check as "signed out"
- Category: functional defect (availability / usability); not a vulnerability
- Verdict: not-applicable
- Functional severity: **high** (unsaved work is lost; it blocks normal daily use)

## Evidence and impact

- Steps to reproduce:
  1. Log in as any user.
  2. Open pages from the sidebar or refresh pages quickly. Each sidebar click makes one session check, and each full page open makes two. About 30 checks within 60 seconds is enough, **counted together for everyone coming from the same address**.
  3. The next page opens the Log in screen.
  4. Logging in again also fails until the minute has passed. After that the old session works again without logging in, so the user was never really signed out.
- Expected: the user stays logged in while working. A busy moment never ends the session or loses work.
- Actual: the user is redirected to `/login`, and the form in progress is lost. This was seen 4 times in a single tester session (screenshot `document/testing/user-check/artifacts/2026-11-02-full-system/auth-01-kicked-to-login.png`).
- Observed facts:
  - The browser log shows `GET /api/auth/get-session` returning **429 Too Many Requests** right before the redirect.
  - The table `auth."RateLimit"` held the key `172.22.0.1|/get-session` with count 30. That is one shared key for all browsers on this machine, because they all arrive through the proxy at the same address.
  - Counting on one tab: 5 sidebar clicks made 5 `get-session` calls, and one full page load made 2.
- Likely places (for the owner to confirm):
  - `backend-api-auth/src/auth/auth.ts` `rateLimit` (`window: 60, max: 30`) applies to `/get-session`. The client address seen behind nginx is shared.
  - `frontend/src/features/home/app-shell.tsx` redirects to `/login` whenever the session check gives no session, including when it was refused with 429.
- Impact: in a shop where several staff share one connection or proxy, normal work will trip the limit even more often.
- Missing validation fact: how the production ingress forwards the client address. Behaviour behind the real proxy has not been tested.

## Proposed work

- Allowed code scope and assigned implementation role:
  - backend (auth): the rate-limit rule for the session check and how the client address is taken.
  - frontend: the session guard's handling of a refused check.
  - infra: only if the forwarded-address setup needs to change.
- Suggested remediation (owner to decide):
  - Exempt the session check from the global limit, or give it a much higher bucket. Sign-in keeps its own strict rule.
  - Key the limiter by the real client address, from a trusted forwarded header set by nginx, or by session rather than by proxy address.
  - In the web app, treat 429 or 5xx on the session check as "try again", with backoff and a short message. Do not treat it as signed out, and keep the current page.
- SA design / contract / flow / dependency change needed: possibly. Ask SA to confirm the limiter keying and the behaviour behind the proxy.
- Acceptance criteria:
  - 100 sidebar navigations in one minute by one user, and 3 users on one address at normal pace, never redirect to login.
  - A refused session check keeps the user on the page.
  - Sign-in brute-force limits are unchanged.
- Safe verification plan and prerequisites: repeat the manual steps on the dev stack, plus an auth integration test for the session route under load.

## User selection and approval

- Approved ticket revision: 1
- Actual user instruction / approval evidence: owner 2026-11-02 "แก้ INV-20261102-001"
- Approval date: 2026-11-02
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

- Selected work ID / root-cause fingerprint: get-session under the global 30 / 60 s limiter + shell treats a refused check as signed out
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 1
- Active pass: none (pass 1 succeeded)
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|
| 1 | backend (auth) + frontend, parent session / `feat/02-11-26-manual-tester` @ 4753205 | 429 on `/get-session` from the shared global bucket; `AppShell` redirects on any missing session, including a failed check | Auth: `src/auth/rate-limit.ts` gives `/get-session` its own bucket (600 / 60 s); sign-in stays 5 / 60 s, `/jwks` unlimited. Frontend: `sessionView` in `app-shell.tsx` signs out only on a completed "no session" answer, keeps the last session on a failed check, shows "Can't confirm your session… Trying again" when there is none, and retries every 5 s | Auth tsc + 92 tests (UT-AUTH-RL1 new); frontend tsc, eslint 0 errors, 532 tests (UT-SHELL-S1 new). Live on dev via nginx: 80 `get-session` calls in a row all 200 (was 429 after 30); 7 bad sign-ins → 401 401 423 423 423 429 429 (sign-in limit and lockout unchanged); `/memo/memo-out-return` 200 | Resolved; terminal |

- Final status / date: resolved 2026-11-02. Open follow-up (not this fix): how the production ingress forwards the client address is still untested (infra); the dev limiter keys every browser on the host as one address. 600 / min per address covers about 20 staff behind one NAT at normal pace.
