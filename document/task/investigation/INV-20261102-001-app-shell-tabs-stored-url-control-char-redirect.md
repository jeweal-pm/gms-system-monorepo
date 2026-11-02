# INV-20261102-001 — App Shell tabs: stored tab URL with tab/newline characters escapes the same-origin check

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: frontend
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor / focused pre-handoff review / no run tree
- Date and audit scope: 2026-11-02; feature `app-shell-tabs` UI rev 1 (ADR-0037), uncommitted frontend change only
- Source commit, dirty paths, and relevant content hashes: HEAD `1e0aa6b`, dirty working tree on
  `feat/02-11-26-reserve`; `frontend/src/features/home/tabs/tab-state.ts` (sha256 prefix `f250cd112f69692e`),
  `frontend/src/features/home/tabs/tab-host.tsx` (`ac167695a92ad123`), `frontend/src/features/home/app-shell.tsx` (`efc650b484872aa2`)
- Related ticket / root-cause fingerprint: `app-shell-tabs:isAppUrl-ignores-url-stripped-control-chars`
- Category: vulnerability
- Verdict: confirmed
- Vulnerability severity: low

## Evidence and impact

- Affected files and line numbers:
  - `frontend/src/features/home/tabs/tab-state.ts:127-129` (`isAppUrl`), `:146-150` (stored `url` accepted verbatim)
  - `frontend/src/features/home/tabs/tab-host.tsx:60-66` (read from `localStorage`), `:82-87` and `:112-114` (initial
    limit outcome), `:102-109` (`refuse` -> `router.replace(back.url)`), `:144-148` (`navigateTo` -> `router.push(tab.url)`)
- Attacker prerequisites and reachable entry point: the attacker must be able to write the victim's
  `gms.tabs.v1:<userId>` key in this origin's `localStorage` (local access to a shared browser profile, or script
  already running on the origin). That precondition is significant, which is why severity is low.
- Concrete trust boundary and source-to-sink trace:
  1. `parseStoredTabs` treats storage as untrusted and is meant to accept "same-origin app paths only ... never
     `//host` or a scheme". `isAppUrl` checks the raw string: starts with `/`, not `//`, no `\`.
  2. The WHATWG URL parser removes ASCII tab, LF and CR before parsing. A stored url of `"/\t/evil.example"` (or with
     `\n` / `\r`) passes `isAppUrl`, but it resolves as the protocol-relative `//evil.example`. Checked with Node's WHATWG
     `URL`: `new URL("/\t/evil.example", "https://gms.local/x").href` gives `https://evil.example/` (same for `\n`, `\r`).
  3. Sink: `router.push(tab.url)` (tab click, close-neighbour, Close all) or `router.replace(back.url)` (`refuse`).
     In installed `next@16.4.1`, `sequential-router-queue.js:85-94` builds `new URL(addBasePath(href), location.href)` and
     sets `isExternalUrl`; `navigate-reducer.js:34-35` then does a hard navigation to the other origin. Only
     `javascript:` is blocked there.
  4. You don't have to click anything: when 15 valid tabs are stored with the crafted one active and the user opens any
     other page, the initial `openUrl` returns `limit` and `refuse()` replaces the location with the crafted URL.
- Observed impact and independent verification evidence: a stored value planted once keeps sending the user to an
  attacker origin after each sign-in, which can be used for phishing (for example a fake GMS login). The impact stays
  within the documented precondition. No session token, cookie or data leaves through this path. The code trace and
  the URL-parser behaviour were checked as above. I did not run a browser.
- Missing validation fact / capability (if any): no browser run of the full flow. The router path was confirmed from
  the installed Next.js source.
- Sanitized evidence sufficient for owner review: yes (above). `frontend/test/home/tabs.test.ts:137` covers
  `https:`, `//` and `/\` but not control characters.
- Raw report/run links (local, ignored evidence may not exist on another checkout): none

## Proposed work

- Allowed code scope and assigned implementation role: frontend; `frontend/src/features/home/tabs/tab-state.ts`
  (and `tab-host.tsx` only if a navigation-time guard is chosen), `frontend/test/home/tabs.test.ts`.
- Suggested remediation: in `isAppUrl`, reject any C0 control character or whitespace (for example
  `/[\u0000-\u001F\u007F\s]/`). Preferably also parse the value with `new URL(value, "https://app.invalid")` and require
  its origin to stay `https://app.invalid`. Then store and use the normalised `pathname + search` instead of the raw
  string. Optionally run the same check again before `router.push`/`router.replace` in `tab-host.tsx`.
- SA design / contract / flow / dependency change needed: none (ADR-0037 already requires validated storage).
- Acceptance criteria: `parseStoredTabs` drops entries containing `\t`, `\n`, `\r`, other control characters or
  whitespace that would change the origin; any accepted url resolves to the app origin; unit tests cover these cases.
  Existing tab tests still pass.
- Safe verification plan and prerequisites: `frontend` unit tests (`test/home/tabs.test.ts`). No live services needed.

## Non-ticketed observations from the same review (no remediation requested)

- Tab list kept after sign-out (`tab-state.ts:117-124`, `tab-host.tsx:126-133`): this is the approved behaviour
  (ui-spec T-07). Stored data is tab URLs (including list filters such as `q` search text and vendor UUIDs) and
  titles with document numbers. It is readable by anyone using the same browser profile. It may overlap with privacy
  obligations, so it is passed to compliance-auditor. No legal conclusion is drawn here.
- Session guard (`app-shell.tsx:58-64,85`): the shell no longer remounts on each navigation, so the fresh session
  check runs once per mount. Detection now relies on better-auth's default refetch on visibility/focus and its
  cross-tab broadcast (`better-auth@1.7.7`, `session-refresh.mjs:13,41`), plus server-side API enforcement. If the
  session becomes null, the shell renders nothing and redirects. That unmounts every kept-alive tab, and sign-out
  also clears the query cache. No regression found that discloses data.
- Hidden kept-alive tabs after a permission change keep showing data already fetched for the same user until they are
  shown again. Authorization stays server-side (T-10). Not a vulnerability.
- Titles and breadcrumbs are rendered as React text or attributes, with no raw HTML sink. State is bounded (15 tabs,
  URL 2048, title 200 on restore). Entries and meta are removed when tabs close.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required: not required

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: `app-shell-tabs:isAppUrl-ignores-url-stripped-control-chars`
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
