# INV-20261110-004 — Unbounded stone-code array may expose Zod memory exhaustion

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: backend
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / frontend, backend, dependency and Docker static investigation / incomplete; no retained full-audit run
- Date and audit scope: 2026-11-10; Zod dependency and backend request schemas
- Source commit, dirty paths, and relevant content hashes: `26f874bb206aa40324d45a581ebf99f68312ee5c`; dirty `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.gms.dev.yml`; `pnpm-lock.yaml` SHA-256 `0727887f57f63e9405e81efd60b2482cb2cd811d0830d9c14da4cba60dec654a`; `backend-api-master/src/stone-master/stone-master.schemas.ts` SHA-256 `aa0fe33bf65eb0328658bcf6ddb6d5523339f353c00022f154bd542d7d033220`
- Related ticket / root-cause fingerprint: `zod-unbounded-stone-code-partOrder-validation-memory`
- Category: vulnerability
- Verdict: needs_validation

## Evidence and impact

- Affected files and line numbers: `pnpm-lock.yaml:4719` locks `zod@4.6.5`; `backend-api-master/src/stone-master/stone-master.schemas.ts:40-46` defines `partOrder` with `z.array(z.enum(PART_KEYS))` and no maximum length; the schema is used by stone-code create/update. `backend-api-master/src/main.ts:68` limits parsed JSON bodies to 256 KB. `backend-api-master/src/master/router.ts:140-143,167-175` applies the relevant permission check before parsing mutation input.
- Attacker prerequisites and reachable entry point: an authenticated account with the stone-code add/edit permission, able to submit a 256 KB JSON body containing an oversized invalid `partOrder` array.
- Concrete trust boundary and source-to-sink trace: API input reaches Zod array validation; the project lock resolves Zod 4.6.5. The GitHub-reviewed [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) says versions below 4.6.6 can accumulate validation issues for large arrays without a length constraint and exhaust process memory. The source has one array without `.max()`, but the body size cap and permission requirement may bound practical impact.
- Observed impact and independent verification evidence: independent static review confirmed the unbounded schema and found the other inspected `z.array` uses have maximum lengths. No runtime memory effect was measured; no severity is assigned.
- Missing validation fact / capability: verify with a bounded isolated process whether an accepted-size request can materially exhaust the configured service memory limit and whether other route-level constraints prevent reaching this array validation.
- Sanitized evidence sufficient for owner review: yes; no exploit payload retained.
- Raw report/run links: none; full run incomplete.

## Proposed work

- Allowed code scope and assigned implementation role: backend owns stone-code schema and dependency compatibility; parent integration owner serializes lockfile changes.
- Suggested remediation: first validate the practical effect; if reachable, constrain `partOrder` to the fixed permutation length and/or upgrade Zod to 4.6.6 or later with compatibility checks.
- SA design / contract / flow / dependency change needed: schema bound changes accepted input semantics and requires checking the existing stone-code contract; dependency version change follows package review.
- Acceptance criteria: oversized `partOrder` input is rejected before expensive per-element issue accumulation; valid permutations retain existing behavior; runtime validation remains within the configured memory budget.
- Safe verification plan and prerequisites: run only a dummy request against a disposable master process in the required OS-enforced sandbox, with a 384 MiB cap or lower, no network egress, scratch-only writes and strict time/process limits. Do not use the live Compose stack.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles, revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: `zod-unbounded-stone-code-partOrder-validation-memory`
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 0
- Active pass: none
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|

- Assigned owner and start date:
- Changed files / implementation revision:
- Checks performed, results, and limitations:
- Follow-up auditor and verification evidence:
- Remaining risk or reopened validation gap:
- Completion report under document/task/done/:
- Final status / date:
