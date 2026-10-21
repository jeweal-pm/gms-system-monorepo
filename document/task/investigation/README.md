# Investigations

Audit findings arrive here **before code fixes**, so the project owner can review evidence,
priority, and scope. This applies to `sec-auditor`, focused `security-auditor`, and
`compliance-auditor` findings, and infra container reviews. Review mode never edits the
audited config/source; infra configuration implementation is a separate selected task.

Use one focused review for security-sensitive code changes as described in the
[security review workflow](../../workflow/security-review.md). Record the result in the
existing feature verification document. Actionable findings enter this queue once; a clean
scoped review creates no ticket.

Frontend/backend also record an unresolved integration data-connection test here after
the shared three-pass correction limit, or earlier when progress/verification is
unavailable. Use [INTEGRATION-BLOCKER-TEMPLATE.md](INTEGRATION-BLOCKER-TEMPLATE.md).
This is a verification blocker, not an audit finding or an approved fourth retry. Link
the dependent TODO and preserve its blocked/needs-validation status.

## Create and review a ticket

1. Copy [TEMPLATE.md](TEMPLATE.md) for an audit finding or
   [INTEGRATION-BLOCKER-TEMPLATE.md](INTEGRATION-BLOCKER-TEMPLATE.md) for an integration
   test blocker to `INV-YYYYMMDD-NNN-<short-topic>.md`. The parent
   allocates the next free ID, writes shared records serially, and checks for duplicates
   by affected boundary/root cause. Existing tickets retain their IDs and revisions.
2. For audits, record scope, commit and relevant uncommitted changes, source revision,
   concrete evidence, verdict, owner, remediation proposal, acceptance criteria, and
   validation gaps; start `pending-review`. Only confirmed vulnerabilities receive severity.
   For integration blockers, record the exact failed cases, data boundary, three-pass
   history or earlier stop reason, and missing prerequisite; start `needs-validation`.
3. Present the canonical ticket once. Approval of its exact revision authorizes immediate
   implementation. A direct user instruction to fix the issue also records selection and
   approval; do not request a second selection. Audit discovery without user direction is
   not approval. Priority is the owner's decision.
4. `frontend แก้ investigation INV-...`, `backend แก้ investigation INV-...`,
   `infra แก้ investigation INV-...`, or `devops แก้ investigation INV-...` selects
   that role's ticket. If the revision is ambiguous, resolve it before edits. Never select by mtime
   or drain the entire queue automatically. Do not duplicate the ticket or add a review
   document for the same cause. SA approval remains necessary only for contract/schema/flow/
   dependency changes outside an already-approved design.
5. Mark `in-progress` when the assigned implementation begins. Record the fix, verification,
   and linked `document/task/done/` report. Mark `resolved` only when the stated criteria
   and category-specific verification are met. Preserve the original evidence/revisions.

Statuses: `pending-review`, `approved`, `in-progress`, `resolved`, `needs-validation`,
`rejected`, `deferred`. Verdict and workflow status are separate: an uncertain candidate
cannot become a confirmed vulnerability merely through task approval. A rejected candidate
can be retained as disposition evidence without creating a remediation task.

Audit ticket categories are `vulnerability`, `hardening`, and `privacy-control`.
`integration-blocker` is a separate testing category. Hardening and
privacy recommendations use `not-applicable` for vulnerability verdict and no vulnerability
severity; record evidence and review needs without asserting an exploit or legal breach.
Keep these recommendations out of upstream findings.json vulnerability records.
Integration blockers have no vulnerability verdict or severity and never enter an audit
`findings.json` file. Deduplicate them by data boundary and root-cause fingerprint; retain
the original three-pass ledger across ticket revisions, roles, and sessions.

## Evidence and raw reports

For selected fixes, apply [bounded remediation](../../workflow/remediation.md). Keep one
root-cause record across devops/infra/frontend/backend: three corrective passes total by default,
including the first fix. Stop when accepted checks pass; stop unresolved on no-progress,
missing verification, or the limit. Additional findings become separate pending-review
items. A new reviewer/ticket revision/session does not reset the counter or reopen success.

Full audit evidence belongs in `sec-auditor/run-<N>/` below this folder. That complete
run tree is ignored by Git; confirm with `git check-ignore` before writing. Keep upstream
reports/JSON and bounded scratch there. Each ticket outside that tree contains enough
sanitized file/line and trace evidence for review even when raw output is unavailable.
Do not commit secrets, customer data, copied sensitive configuration, or raw payloads.

Only the parent writes shared audit outputs. Workers submit scoped observations through
unique scratch artifacts. Implementation owners update their selected tickets sequentially.
The frontend UI TODO pointer is independent of this queue.

See [Sec Auditor integration](../../skills/spec/sec-auditor-integration.md) for upstream
provenance, full audit requirements, and Linux validation on Windows.
