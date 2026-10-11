# Backend TODO template: <service> / <feature>

Copy this format to `document/task/todo/<feature-id>.md`; do not create a feature-local
`todo.md` beside the service design documents.

- feature-id: <feature>
- revision: <SA revision>
- source-ui-revision: <UI revision>
- status: draft
- source: <frontend UI spec/TODO links>
- dependencies: [dependencies.md](dependencies.md)
- approved-revision: none
- approved-by: none
- approved-at: none
- approval-evidence: none
- review-bundle: <architecture, API, sequence, database, authorization, errors, tests, ADRs and libraries>

| Done | ID | Task | Allowed service/integration files | Depends on / frontend IDs | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|

Use stable IDs such as BE-001. Code/migrations/package installation require approval of this
exact SA revision. Record actual approval evidence and invalidate affected approval when
the design changes. Link implementation checks and the completion handoff to frontend.

For corrective work link the shared root-cause ledger and follow
[bounded remediation](../../../../workflow/remediation.md). Preserve the default limit
of three passes (initial fix included), active pass, evidence and terminal outcome across
frontend/backend. A contract revision or role handoff never grants a fresh retry allowance.
