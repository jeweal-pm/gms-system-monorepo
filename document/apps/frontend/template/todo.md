# Frontend TODO: <feature>

Store the actionable TODO at `document/task/todo/<feature-id>.md`, not in the feature folder.

- feature-id: <feature>
- revision: <revision>
- status: draft
- source: <image/Figma source>
- ui-spec: [ui-spec.md](ui-spec.md)
- dependencies: [dependencies.md](dependencies.md)
- backend-bundles: none
- approved-revision: none
- approved-by: none
- approved-at: none
- approval-evidence: none
- review-bundle: <links to all frontend documents and proposed package choices>

## Implementation items

| Done | ID | Owner | Task / component | Allowed files | Depends on / requires-sa | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|

Use stable IDs such as FE-001. Mark item status pending/in-progress/blocked/done separately
when a checkbox alone is insufficient. Separate independent approved UI from tasks needing
an approved SA contract; link matching backend TODO IDs. Do not mark complete before evidence.

## Approval and revisions

Record the owner's approval of this exact revision and documents. For a changed source,
flow, contract, or package choice, record affected IDs and request review of the new revision.

## Handoffs, evidence, and completion

Link SA/backend handoffs, actual integration/check results, customer test report, and the
completion report under document/task/done/. Update the task registry and latest pointer.

## Corrective work

For a defect during implementation, link one root-cause ledger in the task claim or
investigation ticket and apply [bounded remediation](../../../workflow/remediation.md).
Record default pass limit 3, allocated/active passes, per-pass evidence, and terminal outcome.
Share counts with backend; new revisions/reviewers/sessions do not reset them.
