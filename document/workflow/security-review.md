# Focused security review for frontend and backend code

Security review supports implementation. It is not a second approval cycle for an already
approved ADR/TODO. Frontend/backend code handoffs use one scoped pass from each required
security role on the same final source revision. A full audit still requires an explicit
user request.

## One review for the changed risk

After relevant tests pass, send the feature/ticket ID, approved contract revision, exact
changed paths/source revision, affected trust boundary, test results, and related ticket to
both `sec-auditor` and `security-auditor` once for the final code revision. These are two
distinct project roles, not a second approval cycle or a re-review of the ADR/TODO. Record
both outcomes together in the canonical feature verification document; do not create
separate duplicate reports.

The reviewer returns the source revision, paths/boundaries inspected, evidence/limitations,
any finding ticket, and a concise result: `clear`, `advisory`, `blocked`, or
`needs-validation`. Reuse both results while relevant code and evidence are unchanged.
After a security fix, run affected tests and send only the changed boundary/source revision
to both roles once. Do not re-review approved design documents, unrelated paths, or the same
source revision.

All actionable findings are recorded once in the canonical
[investigation](../task/investigation/README.md) ticket, with root cause and source
revision. Auditors do not edit application code. Approval of the exact ticket revision,
or a direct user instruction to fix that finding, starts implementation immediately;
do not request a second ticket selection. Changed contract/schema/flow/dependency still
needs its own SA approval only when that decision was not already covered by the approved
revision. See the [bounded remediation ledger](remediation.md). If required verification
is unavailable, record the exact limitation and finish with that narrow item unresolved;
do not repeat reviews or produce replacement documents to mask the gap.
