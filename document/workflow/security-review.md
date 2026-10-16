# Security review gate for frontend and backend code

Every frontend/backend implementation or fix must complete focused, read-only reviews
by both `sec-auditor` and `security-auditor` before its code handoff is marked complete.
This applies to changed pages, components, modules, functions, APIs, tests, and their
affected trust boundaries. It does not request a full codebase audit: `sec-auditor` uses
its changed-code guidance mode; a full six-phase audit requires an explicit request.

## Review handoff

After required tests pass, the parent sends each reviewer the feature/task ID, approved
contract revisions, exact changed paths and diff/source revision, affected entry points
and trust boundaries, test results, and any prior related tickets. The two reviewers work
read-only and independently; they do not edit application code or approve a changed
contract. The parent serializes shared investigation ticket creation and deduplicates
findings by root cause. If custom reviewer roles are unavailable, the parent applies each
role's instructions sequentially and records that fallback without claiming independent
agent reviews.
For uncommitted work, identify the source as HEAD plus a hash of the reviewed diff or
changed file contents; HEAD alone does not prove two reviewers saw the same code.

Each reviewer returns a scoped record with source revision, paths and boundaries inspected,
evidence/limitations, finding ticket IDs, and one status:

- `clear`: no actionable security issue found in the inspected scope.
- `advisory`: only hardening recommendations outside a required security acceptance
  criterion; stage their tickets for owner review.
- `blocked`: a confirmed vulnerability in the changed or affected behavior; stage its
  ticket and keep the dependent TODO unresolved.
- `needs-validation`: a material security boundary could not be checked or a plausible
  issue lacks the fact needed for a reliable verdict; stage the validation gap and keep
  the dependent TODO unresolved when that boundary is required for delivery.

The parent records both results in the feature testing/verification document and central
TODO. The handoff passes this gate only when both reviewers examined the same final source
revision and returned `clear` or `advisory`, with no unresolved security gap on a required
boundary. `advisory` tickets remain pending owner review; passing the gate is not an
approval to implement them. Do not label a review `clear` when a required check could not
be made. Disagreements on an affected boundary are `needs-validation` until the evidence
is reconciled; do not average verdicts or rerun reviewers without new evidence.
Unrelated findings still get tickets; they do not automatically expand the selected work
unless they make one of its required security criteria unsafe.

All actionable findings first enter [investigation](../task/investigation/README.md)
with the exact source revision. Auditors never dispatch fixes. The user selects a ticket
revision before frontend/backend remediation, and changed schema, contract, flow, or
dependency still needs separate SA review. A selected fix uses the existing
[three-pass corrective ledger](remediation.md). After a code change for that fix, rerun
tests and focused reviews of the changed and affected boundaries once; reuse still-valid
evidence for unchanged scope. New independent findings become separate tickets rather
than an automatic fix-and-review loop. If verification is unavailable, report the gap and
stop the affected handoff instead of claiming a security pass.
