# INV-20261021-003 — GMS storage path checks and filesystem race hardening

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: backend
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor / scoped changed-code review / none
- Date and audit scope: 2026-10-21; filesystem path handling in GMS storage revision 3
- Source commit, dirty paths, and relevant content hashes: HEAD plus changed-file manifest SHA-256 `5d6b78fc9d09ba698244ba4dc98267bec50b2a907925aa1276f8f9f00265d700`; `packages/gms-storage/src/index.ts`
- Related ticket / root-cause fingerprint: `gms-storage/path-check-to-operation-race`
- Category: hardening
- Verdict: not-applicable
- Vulnerability severity: none

## Evidence and impact

- Affected files and line numbers: `packages/gms-storage/src/index.ts:99-113,126-156,181-197`.
- Attacker prerequisites and reachable entry point: a competing principal must be able to modify the storage tree between path validation and the filesystem operation. The scoped review did not identify such a principal in the intended service-owned storage model.
- Concrete trust boundary and source-to-sink trace: path-based `lstat` symlink checks are followed by path-based open/link/read/list operations. A concurrent writer able to mutate the tree could race the check and operation.
- Observed impact and independent verification evidence: the reviewer identified a TOCTOU hardening opportunity; no exploit or reachable competing writer was demonstrated.
- Missing validation fact / capability (if any): production mount ownership and permissions are not configured or verified in this implementation task and remain separately gated.
- Sanitized evidence sufficient for owner review: scoped static security review; no app execution or production host inspection was performed.
- Raw report/run links (local, ignored evidence may not exist on another checkout): none

## Proposed work

- Allowed code scope and assigned implementation role: backend; filesystem driver only, after owner selects this ticket.
- Suggested remediation: assess whether directory-handle/no-follow APIs or an equivalent race-resistant design are available and justified for the supported runtime; otherwise document and enforce the single-writer/ownership boundary as a required runtime invariant.
- SA design / contract / flow / dependency change needed: none expected; infra must verify mount ownership before rollout.
- Acceptance criteria: the storage tree cannot be replaced through a symlink race by an untrusted writer, or the single-writer trust boundary is explicit and verified; add a focused test if the implementation changes.
- Safe verification plan and prerequisites: isolated filesystem tests; do not use production storage. Verify runtime ownership separately under the infra rollout TODO.

## User selection and approval

- Approved ticket revision: none
- Actual user instruction / approval evidence: none; finding is staged for owner review.
- Approval date: none
- Separate approved SA bundle/revision, if required: existing GMS file-storage SA revision 3; no contract change currently proposed.

## Implementation and resolution

- Selected work ID / root-cause fingerprint: none
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 0
- Active pass: none
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: owner selection required before remediation
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|

- Assigned owner and start date: pending user selection
- Changed files / implementation revision: none
- Checks performed, results, and limitations: scoped static review only; no confirmed vulnerability
- Follow-up auditor and verification evidence: pending ticket selection
- Remaining risk or reopened validation gap: path validation assumes storage tree cannot be concurrently modified by another principal
- Completion report under document/task/done/: none
- Final status / date: pending-review
