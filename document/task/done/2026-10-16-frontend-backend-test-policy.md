# Frontend/backend automated test policy

Date: 2026-10-16 (+07:00). Scope: agent and skill instructions, testing workflow and
templates. No application code, test runner, test cases, or package dependencies changed.

## Changes

- Added [automated testing](../../workflow/automated-testing.md): every new/changed
  frontend/backend page, component, module, function, or API needs unit and integration
  coverage in the same change. Fixes add absent tests and refresh affected tests.
- Required passing relevant suites before handoff, with exact command/case evidence.
  A missing runner or failed test keeps the dependent TODO unresolved.
- Reused the existing three-pass root-cause ledger for integration data-connection
  failures. After the third diagnosed unsuccessful correction, or earlier on no progress
  or unavailable verification, record one
  [integration blocker](../investigation/INTEGRATION-BLOCKER-TEMPLATE.md) and stop the
  correction cycle.
- Updated canonical Codex skills and agents, mirrored agent/Claude definitions,
  Claude `tester` and `lead-developer` review gates, frontend/backend testing templates,
  project routing, UI delivery, and investigation guidance. Root `CLAUDE.md` imports
  `AGENTS.md`, so Claude reads the same project testing policy.

## Verification and current limit

- Four canonical/mirror pairs matched; two skill frontmatters, four agent structures,
  32 local Markdown links, and `git diff --check` passed. The Skill Creator Python
  validator could not run because Python is unavailable on this machine. No application
  test suite was run for this instruction change.
- The current package manifests have no unit/integration test runner or test scripts.
  The first implementation task under this policy must establish approved test tooling
  and fixtures before it can be handed off as complete.
