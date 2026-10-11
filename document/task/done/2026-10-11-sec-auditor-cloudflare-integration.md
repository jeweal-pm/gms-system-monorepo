# Sec Auditor and investigation workflow — complete

Completed: 2026-10-11. Scope: project-local skill/agent setup and audit document routing.

## Changes

- Installed the Cloudflare security-audit skill at pinned commit
  `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8` using the bundled installer.
  Kept the original entrypoint as UPSTREAM-SKILL.md, all nineteen companion files unchanged,
  MIT license, and a verified source/hash manifest. Added the project sec-auditor adapter
  and UI metadata, canonical/mirrored agent definition, configuration, and shorthand.
- Project totals are six skills and ten configured agents. Existing security-auditor
  remains a focused reviewer; sec-auditor provides guidance and explicit full audits.
- Created [investigation instructions](../investigation/README.md) and
  [ticket template](../investigation/TEMPLATE.md). Security and compliance findings enter
  this queue first with evidence and owner, before user-selected frontend/backend fixes.
- Updated frontend/backend/SA skills, audit roles, lead coordination, root routing,
  document indexes, ownership, workflow, and tooling ledger. Preserve separate SA review
  for contract/schema/flow/package changes and the independent latest UI TODO pointer.
- Ignored the complete raw full-run evidence tree; curated review tickets remain tracked.
  Hardening/privacy recommendations are separate from vulnerability verdicts/severity.
  Auditors do not automatically edit application code or dispatch remediation.

## Verification

- Bundled Skill Creator validation and UI metadata checks passed for all six project skills.
  Used existing pgAdmin Python and installed js-yaml through an in-process bridge; no new
  validation dependency was installed.
- Parsed role/config TOML and ownership YAML; checked all ten configured paths and
  byte-identical agent mirrors.
- All twenty upstream skill files plus license matched pinned Git blob IDs and SHA-256
  hashes in [the manifest](../../skills/spec/sec-auditor-source-manifest.json).
- Original upstream validator suite passed **65/65** in an existing Linux Docker image,
  without network and with read-only mounts, bounded memory/CPU/processes/scratch.
  Native Windows lacks required safe-file flags and failed those CLI capability checks;
  preserved the safeguards and documented the Linux runner. Confirmed its timeout
  entrypoint is available in the existing local image.
- Checked 138 local Markdown links before adding this completion/changelog record.
  Git raw-run ignore check and diff whitespace check passed.
- Independent read-only review found no remaining material approval, routing, evidence,
  provenance, or execution-safeguard issue after fixing hardening classification and
  legacy audit routing.

## Usage and limits

Use `sec-auditor` for a named security scope, or explicitly request a full audit.
Select a ticket later with `frontend แก้ investigation INV-... revision ...` or the
backend equivalent. See [operator instructions](../../skills/spec/sec-auditor-integration.md).
New role discovery may require a new session or reload.

This task installed and checked audit tooling/instructions. It did not audit application
security, create actual findings, edit application code, or publish these changes.
