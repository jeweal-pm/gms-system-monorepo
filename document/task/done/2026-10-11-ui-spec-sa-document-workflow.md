# UI spec, SA, and document workflow setup

- Date: 2026-10-11, Asia/Bangkok
- Status: completed skill/configuration/documentation setup
- Owner decisions: [confirmed requirements](../../skills/spec/ui-spec-workflow.md)
- Workflow: [UI delivery](../../workflow/ui-delivery.md)

## Changes

Created `ui-spec` and `sa` skills/subagents, with UI metadata and explicit project role
configuration. The project now has five skills and nine agents. Updated existing frontend,
backend, manual tester, lead, test, security, and compliance instructions to use document/
and the confirmed role/review boundaries. Agent definitions use `developer_instructions`
per the [official OpenAI documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents);
the canonical and mirrored copies are identical. Models, effort, and permissions are inherited.

`ui-spec` inspects supplied Figma/image evidence, separates measured values from estimates,
documents components/tokens/table/sheet behavior, proposes dependencies, and writes revisioned
frontend TODOs. Frontend selects the explicit latest pointer and reads approved documents.
Missing/changed backend behavior automatically goes to SA for diagrams/contracts/ADRs,
then separate owner review, backend implementation, and frontend continuation.
Approval evidence is tied to a revision; changed flow/schema/contracts/packages invalidate
affected approval. Dependencies remain proposed until approved and actually installed.
All roles preserve the shared production constraint of 8 GB RAM / 4 vCPU with host headroom.

Completed nine [frontend templates](../../apps/frontend/template/) and nine
[backend templates](../../apps/backend/template/auth-service/), retaining the supplied form
guidelines and design-system examples with a clear template caveat. Corrected stale stack
guidance to match actual Next/React, HTTP gateway/auth, Better Auth, Prisma, pnpm, and ESLint.
Added the central dependency ledger, task registry/latest pointer, and scope/handoff formats.

## Document migration

| Previous location | Current location |
|---|---|
| `docs/changelog/` | `document/changelog/` |
| `.ai/` | `document/coordination/` |
| `user-check/` including artifacts | `document/testing/user-check/` |
| `skill_spec/` | `document/skills/spec/` |
| Frontend skill reference guide | `document/apps/frontend/architecture.md` |
| Backend skill reference guide | `document/apps/backend/architecture.md` |

Updated root routing/README, ownership map, report paths, moved relative links, and the
browser-profile ignore rule. Kept application code and project dependencies unchanged.
Existing worktree edits to supplied templates/ADR files were preserved.

## Verification

- Bundled Skill Creator validator passed for all five project skills. Python was available
  through the existing pgAdmin runtime; PyYAML was unavailable, so the validator's YAML load
  used the already-installed js-yaml package through a temporary in-process bridge.
  No validation package was installed and no repository test/helper scaffold was added.
- Parsed all role/config TOMLs and UI/ownership YAML; checked role fields, config paths,
  metadata lengths/default prompts, and all nine byte-identical agent mirrors.
- Checked both template sets for empty files and local Markdown links across document/,
  skill instructions, root README, and AGENTS.md; repaired moved links.
- All five migrated screenshot SHA-256 checksums matched their original Git artifacts.
- Independent read-only review simulated Vendor design analysis, unset/pending/approved/done
  latest TODOs, separate SA approval, and a later changed main flow. Template-path findings
  were corrected; no unresolved approval/orchestration defects were found in that review.
- Local Codex CLI configuration loaded successfully; `git diff --check` passed.

## Usage and boundary

Start with `ui-spec <Figma URL or attached image>`, review its exact UI revision, then use
`frontend ทำตาม Todo list ล่าสุด`. For new service designs, review the SA bundle when
presented; the parent continues backend and frontend automatically after approval.

[The latest pointer](../frontend-latest.md) is intentionally unset: no new page design was
provided for this setup task. Vendor is an example, not an approved feature/library request.
This setup validates instructions/configuration, not a live end-to-end feature implementation.
Reload the app or start a new session if newly added skills/roles are not yet discovered.
