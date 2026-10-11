# Bounded remediation workflow

Date: 2026-10-11 (+07:00). Scope: skills, agent instructions, and workflow documents.

## Analysis

The existing workflow separated audits from selected fixes and required evidence for
completion, but did not define a persistent retry limit, no-progress detection, or an
explicit distinction between product failures and unavailable verification. Automatic
frontend/SA/backend handoffs could therefore return the same disagreement repeatedly.
New reviewer observations could also expand a selected fix or trigger broad repeated checks.
These were instruction gaps found by inspection, not evidence of an actual runtime loop.

## Changes

- Added [bounded remediation](../../workflow/remediation.md) as the shared policy.
- A selected root cause gets explicit acceptance criteria, scope, owner and verification.
  Default three corrective passes total (initial fix plus two retries), shared by all roles.
- Persist root-cause history across handoffs, IDs/revisions, reviewers and sessions; confirmed
  duplicates share history. Generic continuation does not reset or extend the allowance.
- Retry requires diagnosed failure and new evidence/hypothesis. Stop on accepted success,
  no-progress/cyclic handoff, missing verification, or exhaustion. An extension needs actual
  user authorization and a new approach while retaining the existing count.
- Check affected behavior/contracts, reuse valid unchanged evidence, give checks finite
  deadlines, and avoid automatic full audits after each patch. Independent new findings
  return to pending review. Directly introduced regressions remain part of selected work.
- Separate bounded audit-record corrections from code-fix passes; full audits still retain
  all upstream phases/independence/validators and report incomplete when a required gate
  cannot be completed.
- Updated all six project skills, ten canonical/mirrored agents, root routing, investigation
  template/README, shared task/handoff templates, UI workflow and frontend/backend TODO
  templates. Added no application code, runtime service, script or dependency.

## Verification

- Bundled Skill Creator validation and metadata checks passed for all six project skills.
- Parsed ten canonical agent TOMLs and configuration mappings; all ten mirrors matched.
- All 21 pinned upstream files/license retained their Git blob and SHA-256 hashes.
- Final check passed for 154 local Markdown links, including completion/changelog records;
  whitespace check passed.
- Independent read-only forward evaluation covers selected success plus unrelated findings,
  cyclic handoffs, exhausted corrections across sessions, new causal evidence, unavailable
  browser, duplicate ticket IDs, coordinated frontend/backend passes, audit validator
  failure, changed external prerequisites, and explicit limit extension.
- The evaluator found a retry/no-progress ambiguity when new evidence describes an
  unchanged failing state. Corrected the rule and the evaluator confirmed resolution;
  no other material contradiction remained in the ten scenarios.

The workflow is expressed in agent instructions and durable task records; this project
does not have a separate runtime orchestrator enforcing counters. No application tests or
live audit were run for this documentation/instruction change. Future execution must retain
the pass ledger and session authorization restrictions.
