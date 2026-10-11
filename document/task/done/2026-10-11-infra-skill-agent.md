# Infrastructure skill and agent — complete

Date: 2026-10-11 (+07:00). Scope: project-local skill/agent creation and workflow integration.

## Delivery

- Created [.codex/skills/infra/SKILL.md](../../../.codex/skills/infra/SKILL.md), skill UI
  metadata and canonical/mirrored `infra` subagent. Registered shorthand and role config.
  Current project totals: seven skills, eleven configured agents.
- Added [infra delivery workflow](../../workflow/infra-delivery.md),
  [official-source security baseline](../../infra/security-baseline.md),
  [service template](../../infra/template/service-security.md), and
  [explicit service index](../../infra/service-index.md).
- Inventoried the five services from source: PostgreSQL, Mailpit, auth, gateway and frontend,
  including the development watch override. Entries remain `not-reviewed`; this inventory
  is not a security audit or configuration approval.
- SA/frontend/backend/lead and audit roles route new/changed container ADRs to infra
  research. Drafts permit research; exact authorized revisions permit implementation.
  Infra documents join relevant SA review. Manual ADR changes are compared by exact file
  path/content hash, not mtime or potentially duplicated heading IDs.
- Parent serializes shared Docker/Compose/config and service-index writes. Frontend/backend
  own their respective application adapters; backend owns DB roles/migrations. Config waits
  for required secret readers/adapters and preserves actual internal traffic/egress.
- Container review findings enter investigation with owner infra before selected fixes.
  Bounded remediation applies across all roles, including infra; no automatic audit/fix loop.
- Research records version/platform sources, finite review-by dates, invalidation triggers
  and fresh advisory/image-support evidence before setup/rollout. Required runtime checks
  remain explicit; static validation is not a runtime/security guarantee.

## Sources and validation

Security guidance was researched from official Docker/Compose, PostgreSQL image/PostgreSQL 18,
Next.js self-hosting and Mailpit docs, linked alongside claims in the baseline. It covers
privilege/isolation, networks/published ports, secrets/consumer support, storage/init,
application write requirements, logs, capacity, rollout and verification.

- Bundled Skill Creator validation and UI metadata passed for all seven skills.
- Parsed eleven role TOMLs/config mappings and ownership YAML; all eleven mirrored agent
  definitions matched. Existing Cloudflare upstream content/license hashes stayed intact.
- Final local Markdown check passed for 177 links, including completion/changelog records;
  whitespace check passed.
- Independent read-only forward evaluation simulated twelve cases: draft Redis, accepted
  PostgreSQL with existing data, initialization permissions, Next/watch writes, SMTP egress,
  missing secret consumer, unrelated admin exposure, manual ADR, missing runtime access,
  concurrent Docker writers, exhausted retries, and unchanged valid evidence.
- Review gaps were addressed: explicit index serialization, frontend adapter ownership,
  accepted-ADR scope, exact ADR identity, and research validity rules.
  A stale review-handoff sentence was also corrected to assign application source changes
  to the respective frontend/backend owner; the final source check confirms its removal.

## Use and scope

```text
infra ตรวจความปลอดภัย Docker ทุก container
infra ทำ config ตาม ADR <exact path/revision>
infra แก้ investigation INV-... revision ...
```

ADR routing runs when the relevant role is invoked; no scheduler/watcher was installed.
New agent discovery may need a session reload. This task changed skills/configuration/docs,
not application Dockerfiles/Compose or live containers; no builds, restarts, credential
changes, database changes or runtime tests were performed. Container hardening/review is
a subsequent explicitly selected scope, with results and missing checks recorded honestly.
