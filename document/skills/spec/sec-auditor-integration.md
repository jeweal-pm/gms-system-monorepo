# Sec Auditor integration

## Source and scope

- Upstream: [Cloudflare security-audit-skill](https://github.com/cloudflare/security-audit-skill).
- Pinned commit: `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`.
- Source directory: `skills/security-audit`; installed on 2026-10-11 with the bundled
  Codex skill installer using the explicit commit and project-local destination.
- License: MIT, retained in `.codex/skills/sec-auditor/LICENSE`.
- Original entrypoint retained as `.codex/skills/sec-auditor/UPSTREAM-SKILL.md`;
  its nineteen companion files are unchanged. The project `SKILL.md` is an adapter.
- [source-manifest.json](sec-auditor-source-manifest.json) records original Git blob IDs
  and installed SHA-256 hashes for the twenty upstream files and license.

There are now six project skills and ten configured subagents. `sec-auditor` adds the
Cloudflare full audit workflow; `security-auditor` continues focused reviews. Privacy and
organisational obligations remain with `compliance-auditor`. No application library or
runtime service is added. New skill/agent discovery may require a new session or reload.

## User commands and approval

```text
sec-auditor ตรวจความปลอดภัยเฉพาะ flow login
sec-auditor audit ทั้ง frontend และ backend
frontend แก้ investigation INV-20261011-001 revision 1
backend แก้ investigation INV-20261011-002 revision 1
```

Focused reviews use guidance; explicit codebase audits use the complete six-phase workflow.
Any actionable finding first becomes a sanitized ticket in
[document/task/investigation/](../../task/investigation/README.md), with evidence, verdict,
owner, proposed work, and `pending-review` status. Do not auto-fix, auto-drain the queue,
or equate audit discovery with user approval. An instruction selecting an identified
ticket revision authorizes its fix. SA design/contract/schema/flow/dependency revisions
still require separate review before dependent implementation.

Selected fixes and post-fix checks follow [bounded remediation](../../workflow/remediation.md):
three corrective passes per root cause by default, shared across frontend/backend;
success/no-progress/missing verification/exhaustion ends the cycle. Additional findings
return to review. No automatic full audit is required after each patch.

The parent owns shared records; independent workers do not edit application source or
each other's artifacts. Batch full-audit phases within available agent slots and keep
candidate/final verification independence. Missing capabilities or failed phases are
reported as incomplete, never silently omitted. A clean review creates no fake tickets.

## Storage

- Reviewable tickets: `document/task/investigation/INV-YYYYMMDD-NNN-<topic>.md`.
- Full-run evidence: `document/task/investigation/sec-auditor/run-<N>/`.
- Completed fixes: linked reports in `document/task/done/`.

The user explicitly selected the in-repository investigation location. The entire raw
run tree is ignored by `.gitignore`; check it before writing:

```powershell
git check-ignore -- document/task/investigation/sec-auditor/run-1/findings.json
```

Use the next unused run number, never overwrite a retained run. Raw runs contain upstream
metadata, architecture, coverage ledger, findings JSON, REPORT.md, FINDINGS-DETAIL.md,
NEEDS-VALIDATION.md, and bounded scratch. Curated tracked tickets outside the raw tree
are explicitly authorized project documents. They retain sanitized, concrete evidence
without secrets/customer data. Reference raw output as local supplemental evidence.
This exception changes output location only; all upstream evidence and execution
safeguards apply. No application security audit was performed during skill installation.

## Execution and resource limits

Target-controlled execution requires every upstream OS sandbox and safe artifact-promotion
capability. If unavailable, use source inspection and mark the exact missing validation
fact; do not run target builds/tests, install dependencies, contact live services, or
borrow application credentials. The validator example below runs trusted upstream tooling
against parent-owned audit records; it is not a general target-code execution runner.

Production capacity is 4 GB RAM / 2 vCPU total. Inspect aggregate limits and host headroom
as evidence; documentation alone cannot establish deployment safety. Constrain audit
runners, worker concurrency, scratch, processes, and wall time separately.

## JSON validation on Windows

Upstream CLI safe file reads require flags not available in native Windows Node. Keep
those guards intact. Use Linux Node from the existing local `f1-system-dev:local` image;
do not pull or build an image as part of an audit. If the image/Docker is unavailable,
report the blocked validation and incomplete full run rather than bypassing safe reads.

This PowerShell example validates **parent-owned** final records in a selected run. Both
bind mounts are read-only, networking is disabled, privileges/resources/scratch are bounded.
The runner enforces a 30-second deadline per validator with Linux `timeout`, including a
five-second kill grace period. An output polling timeout is not an execution deadline.
Apply the upstream safe artifact-promotion rules to worker-produced files
before they become canonical inputs; the validators still perform their own safe opens.

```powershell
$auditSkillPath = (Resolve-Path -LiteralPath '.codex/skills/sec-auditor').Path
$auditRunPath = (Resolve-Path -LiteralPath 'document/task/investigation/sec-auditor/run-1').Path
$auditRunnerArgs = @(
  'run', '--rm', '--pull=never', '--network=none', '--read-only',
  '--cpus=0.5', '--memory=512m', '--pids-limit=64', '--cap-drop=ALL',
  '--security-opt=no-new-privileges', '--tmpfs', '/scratch:rw,nosuid,nodev,size=64m',
  '--env', 'TMPDIR=/scratch',
  '--mount', "type=bind,source=$auditSkillPath,target=/audit,readonly",
  '--mount', "type=bind,source=$auditRunPath,target=/records,readonly",
  '--workdir', '/audit', '--entrypoint', 'timeout', 'f1-system-dev:local',
  '--signal=TERM', '--kill-after=5s', '30s', 'node'
)
& docker @auditRunnerArgs /audit/validate-coverage-ledger.cjs /records/coverage-ledger.json
if ($LASTEXITCODE -ne 0) { throw 'Coverage ledger validation failed' }
& docker @auditRunnerArgs /audit/validate-findings.cjs /records/findings.json
if ($LASTEXITCODE -ne 0) { throw 'Findings validation failed' }
```

Installation verification: the original upstream validator tests passed **65/65** in this
bounded Linux container. Native Windows failed safe-file capability checks as expected;
that platform failure is why the Linux runner is required. The suite does not establish
the application's security or certify a full audit.
