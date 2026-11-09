# INV-20261107-008 — A new, untouched document is marked as having unsaved changes (Purchase Order, Memo Receive, Memo Return, sometimes Purchase)

## Tracking

- Renumbered 2026-11-09 from INV-20261107-001: that number is also used by INV-20261107-001-approve-center-approves-unreviewed-version.md (merged from `dev` in PR #79). The owner's approval quote below still names this ticket "INV-20261107-001".

- Ticket revision: 1
- Status: resolved
- Owner: frontend
- Priority: awaiting user review
- Auditor / mode / run ID: manual-tester, customer-perspective check of the purchase flows
- Date and audit scope: 2026-11-07; app-shell tabs and the vendor-header document pages
- Source commit, dirty paths, and relevant content hashes: `feat/07-11-26-manual-tester` @ `26f874b` (= origin/dev), clean tree; local dev stack at http://localhost:8080
- Related ticket / root-cause fingerprint: a brand-new vendor-header document reports itself as changed without any user input; Quotation and Memo Out (customer header) do not
- Category: usability defect
- Verdict: not-applicable
- Functional severity: **low–medium (false warnings on close, Close all and reload; users learn to click Discard without reading)**

## Evidence and impact

Screenshots: `document/testing/user-check/artifacts/2026-11-07-purchase-flows/`.

- Steps to reproduce (admin, Chrome desktop 1440×900):
  1. Have one other tab open, for example Purchase Outstanding.
  2. From the sidebar, open **Purchase Order (PO)**. Do not type or pick anything.
  3. Click the Purchase Outstanding tab.
  4. Repeat with **Memo Receive** and **Memo Return**.
- Expected: the untouched "New …" tabs carry no unsaved mark, and closing them closes them straight away.
- Actual:
  - "New Purchase Order (PO)", "New Memo Receive" and "New Memo Return" show the unsaved dot ([66-untouched-dirty-again.png](../../testing/user-check/artifacts/2026-11-07-purchase-flows/66-untouched-dirty-again.png), 09c-untouched-dirty-dots.png).
  - Closing one asks "Discard unsaved changes in New Purchase?" although nothing was entered (09b-close-untouched-pu.png).
  - Close all asks the same question.
  - Reloading the browser shows the browser's own "Leave site?" prompt.
- How often:
  - Purchase Order, Memo Receive and Memo Return: every time (2 runs each).
  - Purchase: 2 of 3 runs.
  - Quotation and Memo Out: never.
- Rule: app-shell-tabs T-05 asks only when there are **unsaved changes** ([ui-spec](../../apps/frontend/app-shell-tabs/ui-spec.md)).
- Impact: false warnings train users to press Discard without reading, so a real unsaved document can be lost later.

## Proposed work

- Allowed code scope and assigned implementation role: frontend. Covers the shared vendor header or document form and the tab's unsaved flag (`frontend/src/features/trade-document/**`, `frontend/src/features/home/tabs/**`), with tests.
- Suggested remediation: values the page fills in by itself on a new document (default currency, rate, address, dates) should not count as user changes.
- SA design / contract / flow / dependency change needed: no.
- Acceptance criteria:
  - Opening a new Purchase Order, Purchase, Memo Receive or Memo Return and switching away shows no dot.
  - Closing that tab asks nothing.
  - Typing anything still shows the dot and the question.
- Safe verification plan and prerequisites: a component test plus a manual re-check on the dev stack.

## User selection and approval

- Approved ticket revision: 1
- Actual user instruction / approval evidence: owner 2026-11-07: "77 file change เยอะไป ลบรูปไปบางส่วน แก้ INV-20261107-002 และ INV-20261107-001 และ INV-20261107-003"
- Approval date: 2026-11-07
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

- Selected work ID / root-cause fingerprint:
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 0
- Active pass: none
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|

- Final status / date:

## Resolution (2026-11-07, corrective pass 1 of 3)

- Root cause (reproduced in headless Chrome with several New tabs open): the page fills the currency / exchange rate of a new document by itself with `setValue`, which leaves the form defaults empty; a later recompute (another tab loading the same data) compared values with those defaults and flagged the untouched form as changed (`isDirty` true with no dirty field).
- Fix: a value the page fills in by itself now also becomes the field's default (`resetField(name, { defaultValue })`) in the PO form, Memo Receive header, the shared vendor header, the shared document form and Quotation. Verified: PO, Memo Receive, Memo Return and Purchase opened as New tabs one after another, then switching tabs — 0 unsaved dots (4 dots-checks before the fix showed 1). Typing still marks the tab.
- Checks: frontend 767 tests, typecheck and lint clean.
- Security review (2026-11-07, same uncommitted revision on 26f874b): sec-auditor and security-auditor both clear, no new INV. Note (not a finding): after **Keep vendor** the vendor field itself can stay marked as changed, so the tab may show the unsaved dot.
- Done report: [2026-11-09-inv-20261107-purchase-flows](../done/2026-11-09-inv-20261107-purchase-flows.md).
