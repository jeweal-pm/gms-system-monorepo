# Senior DevOps skill and GitHub Actions

Date: 2026-10-11 (+07:00). Scope: local skill/agent, delivery workflow and initial CI/image files.

## Delivered

- Created [devops skill](../../../.codex/skills/devops/SKILL.md), UI metadata and
  canonical/mirrored agent. The role always acts as a senior DevOps engineer. Registered
  shorthand `devops`; current totals are eight skills and twelve agents.
- Added [CI](../../../.github/workflows/ci.yml) for dev/master pushes, PRs/manual runs and
  reusable calls. Existing scripts perform frozen install, lint, build/generated types,
  typecheck and quiet base/development Compose syntax validation. No test runner invented.
- Added [service image workflow](../../../.github/workflows/service-images.yml), manual
  with publication off by default. CI passes first; frontend/gateway/auth images build
  serially. PostgreSQL/Mailpit remain upstream images. Explicit GHCR publication requires
  its enable variable, trusted dev/master ref, package access and configured environment.
  Source-SHA tags and image digests are recorded; no production deploy/migration job exists.
- Added [GitHub configuration](../../devops/github-configuration.md), active variable names,
  automatic token handling, future deployment placeholders and official-source/action pins.
  The user creates repository/environment settings later; no secret values committed.
- Added [DevOps delivery](../../workflow/devops-delivery.md) and
  [delivery service index](../../devops/service-index.md). SA/infra/frontend/backend/lead
  route exact service revisions/build/variable requirements to devops through the parent.
- Parent serializes shared pipelines/build contexts/indexes; infra retains runtime security,
  frontend/backend retain their source adapters and backend retains DB migrations.
  Findings first enter investigation with owner devops and shared bounded corrective history.
- Narrowed .dockerignore to exclude .env variants, role/config folders and document/audit
  artifacts from root build contexts, preventing unrelated local records entering images.

## Validation evidence

- Bundled Skill Creator validator/UI metadata passed for eight project skills.
- Parsed twelve agent TOMLs/config mappings and ownership YAML; all twelve mirrors matched.
- Parsed both workflow YAMLs; checked triggers, publish default, least-privilege jobs,
  reusable workflow/script references, generation order and all three actual Dockerfiles.
- Resolved six official release tags to upstream commits and validated actual pinned
  action.yml input keys/runtime metadata; provenance in
  [action-pins.json](../../devops/action-pins.json).
- Git Bash syntax validation passed for eight inline scripts without executing their
  application/build/publication commands. Existing audit upstream hashes stayed intact.
- Local document links, including this completion record, and diff whitespace passed.
- Independent read-only forward review covered fork PR, dev push, manual build-only,
  publication with missing/present settings, partial matrix publication, changed services,
  unknown deploy target and exhausted corrective retries. No blocking local workflow defect
  was found. Its environment-protection limitation is documented and a trusted-ref preflight
  was added; environment review rules still require actual GitHub configuration.

## Practical limits and next use

Use `devops` or `devops ปรับ GitHub Actions ตาม service/ADR ล่าสุด`. Configure the active
variables from the GitHub guide and authorize publishing workflow files when ready.
Remote workflow_dispatch visibility requires the workflow on the remote default branch;
that remote setting was not inspected or changed.

This task prepared local automation. No package installation, application checks, Docker
builds, live container changes, GitHub runs/settings, code/image push or deployment occurred.
A real clean-runner CI/image run is still required before claiming execution success.
Production platform/runtime/security and deployment readiness remain infra/rollout work.
