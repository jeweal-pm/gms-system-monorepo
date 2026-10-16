# Frontend/backend security review gate

Date: 2026-10-16 (+07:00). Scope: agent/skill and delivery instructions only.

## Change

- Added [security review gate](../../workflow/security-review.md): after tests pass,
  both `sec-auditor` and `security-auditor` inspect the final frontend/backend diff in
  focused, read-only mode. Both results must identify the same source revision.
- Defined `clear`, `advisory`, `blocked`, and `needs-validation` results. Confirmed
  vulnerabilities and required validation gaps keep the affected TODO unresolved.
- Findings continue to enter [investigation](../investigation/README.md) for owner
  review. The gate does not dispatch fixes or turn a focused check into a full audit.
- Updated project routing, Codex/Claude frontend and backend roles, both reviewer roles,
  lead review instructions, UI delivery, and frontend/backend verification templates.

## Verification

- Eight canonical/mirrored skill and agent pairs match; three skill frontmatters, five
  agent structures, 36 local Markdown links, and `git diff --check` passed. No application
  code or runtime tests were changed or run for this instruction update.
