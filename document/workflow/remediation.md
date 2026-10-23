# Bounded remediation and verification

Use this policy for selected investigation fixes and corrective work on approved TODOs.
It controls implementation retries and handoffs. It does not authorize an unselected
audit finding, broaden the user request, or weaken security evidence requirements.
The parent owns the shared work record; roles read it before edits or another handoff.

## One record, one approval, then code

- Keep one canonical ADR, TODO, or investigation ticket per feature/root cause. Search the
  existing registry and queue before creating a file. Add evidence and revision history to
  that record; do not create parallel review bundles, duplicate tickets, or a second TODO
  for the same decision or defect.
- Approval of the exact ADR/TODO/ticket revision authorizes its described implementation.
  Start the code change in the same active task; do not ask for another selection, SA pass,
  approval summary, or review of the already-approved documents. A direct user instruction
  to fix a named issue/ticket also records the required selection for that scope.
- If new evidence changes an approved contract, schema, flow, dependencies, or deployment
  topology, update the existing canonical design record and pause only the dependent code
  for that changed decision. Otherwise keep the approved design and fix the implementation.
- Tests and the two required focused security role results for a changed security-sensitive
  source revision are verification, not new design approval gates. Reuse both results for
  unchanged code. Do not repeat either review on the same source revision or re-review an
  approved ADR/TODO. Report a concrete unresolved blocker once, with its exact missing fact.
- When a bug appears during approved work, record it in the existing feature/ticket ledger,
  then fix and verify it within the active scope. Create a separate investigation only for
  an independent root cause or when the user needs a distinct decision. Do not stop after
  producing a ticket if the user has already authorized its fix.

## Select once and define the finish

Before the first correction, record the work ID, exact selected revision and authorization,
affected boundary/root-cause fingerprint, owner, allowed paths, explicit acceptance criteria,
and the smallest useful verification plan. For a directly authorized fix without a ticket,
use the existing task claim; do not require a new UI bundle unless the design changes.
For approved implementation TODOs, use the item's corrective-work record when a defect arises.

Deduplicate by affected boundary and root cause, not title or severity. Link duplicate
observations to the same record. A new ticket ID, document revision, reviewer, role, session,
or generic instruction to continue never resets the correction history for that cause.
Merge only when source evidence establishes the same cause; a similar error message alone
is not enough. Uncertain duplicates retain separate evidence and links until resolved.
If the prior ledger is missing, recover it from task/handoff evidence before another attempt.
An explicitly selected genuinely different cause gets its own record.

## Diagnose, change, then verify

1. Establish the failure from source/reproduction evidence and inspect neighboring code,
   approved contracts, and prior attempts. Record the causal hypothesis and the expected
   observable improvement. Reconcile frontend/backend contract disagreements against the
   accepted contract; do not make both sides chase guesses.
2. The default limit is **three corrective passes total: initial fix plus two retries**
   per root cause. The parent allocates a pass number before the first code edit in that
   pass. All participating infra/frontend/backend/integration edits count in that same pass.
   SA design work and ordinary forward handoffs do not themselves consume an extra pass.
   Once verification failed, another code correction starts the next pass. An interrupted
   pass stays allocated and resumes from its evidence; never reset it or count every tool
   call, file edit, or frontend/backend handoff as another pass.
3. Implement the smallest coherent cause-level change within the selected scope, including
   directly introduced regressions in affected behavior. Do not refactor unrelated code,
   suppress errors, relax acceptance tests, or change contracts merely to make a check pass.
4. Run only authorized verification relevant to the changed behavior and impacted boundaries.
   Follow session test restrictions. Reuse recorded successful evidence for unchanged code,
   configuration, and fixtures; run broader checks only when changes affect their coverage
   or the user requests them. A rerun of a flaky check is not a code-fix pass: first record
   the observed flaky/environment cause, allow one targeted rerun after a relevant change,
   then return a validation gap if it remains unavailable. Avoid an automatic full audit
   after each patch. Any audit execution still follows its sandbox requirements.
   Set a finite deadline for each check from its expected duration/tooling before running;
   terminate and record the actual timeout when it expires. Polling/yield timeouts do not
   enforce process deadlines. Do not leave a hung verifier running while redispatching it.
5. A retry requires a diagnosed remaining failure and new evidence or a materially revised
   causal hypothesis. Record what changed since the previous attempt. If there is no such
   basis, stop corrections immediately; record `no-progress` and return the next required
   fact/decision. An unchanged failing state may be investigated again when new causal
   evidence genuinely explains it; another correction still consumes the next pass.
   Repeating the same state/failure or alternating prior patches without that new basis
   is no-progress, even when another role proposes the repetition.

## Terminal outcomes

| Evidence | Action |
|---|---|
| All selected acceptance and required verification pass | Mark resolved/done, link evidence and completion, stop; do not keep polishing or audit the whole app again |
| Diagnosed failure, changed hypothesis/evidence, passes remaining | Retry within the same authorized scope using the next pass |
| Recurring state/failure or alternating patches without new causal basis; repeated handoff without changed contract/revision/evidence/prerequisite | Stop with `no-progress` or `handoff-cycle`; record blocked for TODO work or needs-validation for an investigation |
| Third pass fails | Stop with `attempt-limit`; retain unresolved status and present cause, attempts, remaining gap, and a concrete next option |
| Missing browser, sandbox, credentials, service, or other verification prerequisite | Record what was/was not checked and `verification-unavailable`; do not recode or loop to compensate for an environment gap |
| User-selected scope needs a changed schema/contract/flow/package | Prepare SA documents and durable handoff, record pending review; no speculative dependent implementation |
| A new unrelated issue or optional hardening idea appears | Create/link a pending-review investigation; finish the selected work if its criteria still pass |

New failures directly caused by the selected patch must be resolved within the remaining
passes before completion; otherwise keep the task unresolved. A newly discovered independent
finding that makes a selected criterion unsafe blocks that criterion and is disclosed for
review, rather than silently expanding the fix. Do not mark missing verification as success.
Do not roll back unrelated/user changes; any rollback is scoped to the agent's own patch
and must preserve the current checkout.

After a terminal outcome the agent returns a durable result; it does not wait indefinitely,
spawn a successor to bypass the limit, or automatically reopen resolved work. Reopening needs
new failure evidence and explicit user selection. Continuing beyond the recorded pass limit
requires an explicit user-authorized extension and a diagnosed new approach; append the
new limit and actual instruction, retaining the existing count. A plain continuation resumes
eligible unfinished work but does not grant an extension.

## Record and handoff contract

The selected ticket/TODO/task claim stores one shared ledger:

- work ID and root-cause fingerprint; selected revision and approval evidence;
- acceptance criteria and authorized verification scope;
- pass limit (default 3), passes allocated, active pass, and authorization for extensions;
- each pass: source/diff hash, hypothesis, meaningful change, command/observation,
  outcome/failure signature, and next fact required;
- handoff: from/to owner, pass number, exact contract revision, changed evidence or
  prerequisite, and the receiving role's concrete output;
- terminal outcome, stop reason, remaining validation gap, completion link, and reopen evidence.

Parent/roles, including infra, inherit this ledger across sessions and handoffs. Do not send the same owner
pair the same unresolved request again without a changed input or a specific missing fact.
Other independent approved tasks may continue after one item stops.

## Audit and report correction

Full audits retain the original six-phase workflow, coverage criticism, independent
candidate/final verification, and required validators. Freeze the selected target revision
and scope; source changes during a run invalidate affected evidence rather than prompting
an endless moving-target audit. A post-fix review is scoped to the selected finding and
affected boundaries unless the user asks for another full audit.

Repeated corrections to the same audit record/report have a separate default limit of
three correction passes per run and share a durable ledger. Do not reclassify a finding,
hide a coverage gap, or remove validator guards to obtain a pass. A material finding-record
change requires the upstream fresh verification. If no-progress, exhausted corrections,
source instability, or unavailable required verification prevents completion, produce the
upstream `run_status: incomplete` terminal report with the exact reason and remaining gaps.
These correction bounds are not a fabricated token/agent-call budget, do not skip mandatory
phases, and never justify declaring a partial audit complete.
