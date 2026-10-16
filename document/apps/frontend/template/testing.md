# Frontend acceptance and verification: <feature>

- UI revision: <revision>
- Reference Figma/image and viewport: <source>
- Relevant TODO / API / SA revisions: <links>

## Automated coverage

List every added or changed page, component, module, function, and API adapter. If an
existing target has no tests, add them during its fix. Update stale tests in the same
change. Follow [automated testing](../../../workflow/automated-testing.md).

| Target / behavior | Unit case ID and test path | Integration case ID and test path | Boundary / fixture | Command and result |
|---|---|---|---|---|

One integration scenario can cover multiple targets only when it exercises and asserts
each target. Record the exact relevant suite command and result after every code/test
change and the final full frontend suite result before handoff. Missing runner or failing
tests keep the linked TODO blocked/needs-validation; link any integration-blocker ticket.

## Security review before handoff

Follow [security review](../../../workflow/security-review.md) after tests pass. Record
both reviewers against the same final diff/source revision. Link any investigation tickets.

| Reviewer | Source revision / changed scope | Status | Evidence / ticket IDs |
|---|---|---|---|
| `sec-auditor` | | | |
| `security-auditor` | | | |

## UI acceptance

| Case ID | TODO / component | Starting state | User actions | Expected result | Viewport / keyboard | Evidence / result |
|---|---|---|---|---|---|---|

Cover observed design fidelity (alignment, spacing, colors, borders, typography, tables,
overlays) and relevant responsive, form, navigation, permission, loading/empty/error/success
behavior. Derive expectations from approved requirements rather than invented business rules.
Record typecheck/lint/build commands discovered in the package and browser observations.
Mark unexecuted cases not run. Customer reports and screenshots belong under
document/testing/user-check/; link them after checks actually happen.
