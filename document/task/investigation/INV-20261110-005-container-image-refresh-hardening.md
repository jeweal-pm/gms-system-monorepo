# INV-20261110-005 — Container base images need a reviewed security refresh

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: infra
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / frontend, backend, dependency and Docker static investigation / incomplete; no retained full-audit run
- Date and audit scope: 2026-11-10; frontend/auth/master Dockerfiles, base images, Compose database and Nginx image
- Source commit, dirty paths, and relevant content hashes: `26f874bb206aa40324d45a581ebf99f68312ee5c`; dirty `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.gms.dev.yml`; `frontend/Dockerfile` SHA-256 `949ef96a4a9201053b26bcfe8f454f319ea7fe4b163192353624d38c56bd43d1d`; `backend-api-auth/Dockerfile` SHA-256 `16c7d4bceba25c59d89fefa3d7d97f26eae4cb81f490cff6ba36e09634700b38`; `backend-api-master/Dockerfile` SHA-256 `f20d33f866971f5e7b583ab13e0a5e5e4a7d7f605635c7a07469745cf96478c6`
- Related ticket / root-cause fingerprint: `container-base-image-refresh-and-production-image-scope`; existing auth root runtime hardening is tracked in [INV-20261017-004](INV-20261017-004-auth-runtime-runs-as-root.md) and is not duplicated here
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers: `frontend/Dockerfile:1-10`, `backend-api-auth/Dockerfile:1-15`, `backend-api-master/Dockerfile:1-15`, `docker-compose.yml:6`, `docker-compose.gms.dev.yml:6`.
- Attacker prerequisites and reachable entry point: no vulnerability is claimed. Stale or unnecessarily broad image contents can increase the remediation window and the packages present if another flaw is exploited.
- Concrete trust boundary and source-to-sink trace: the three application images use `node:24.22.1-bookworm-slim`; current official Node sources list `24.22.2` (released 2026-10-28). Auth/master install all workspace dependencies without `--prod` and retain them in single-stage runtime images; their startup migration command needs Prisma CLI, but the rest of the development tree is also present. The PostgreSQL image is `postgres:18.6-alpine`, which remains the latest published 18.x image tag found during this review. The Nginx image is digest-pinned at 1.30.6-alpine3.24; upstream publishes refreshed image builds for the same stable version, so digest currency should be checked and refreshed under review. These are maintenance/hardening items, not proof of a CVE in those image layers.
- Observed impact and independent verification evidence: Dockerfile and Compose source review plus official upstream release indexes. The October 21 Node security release is 24.22.1, so the pinned tag includes that release; the later 24.22.2 is a newer patch, not independently confirmed here as an additional CVE fix. No scanner was available to inspect OS packages in the built images.
- Missing validation fact / capability: local Trivy, Grype and Docker Scout were unavailable; no SBOM or production image digest was present. The running local app images were not scanned or rebuilt. Actual Debian/Alpine package CVE status therefore remains unverified.
- Sanitized evidence sufficient for owner review: yes; official release information and source references are provided. No registry credentials were used.
- Raw report/run links: none; full run incomplete.

## Proposed work

- Allowed code scope and assigned implementation role: infra owns Dockerfiles and image baselines; devops owns CI image build/publish metadata; parent integration owner serializes Dockerfiles and workflow changes.
- Suggested remediation: evaluate and adopt Node 24.22.2 consistently across Dockerfiles and `.nvmrc`; refresh the pinned Nginx digest to a current signed upstream build after CVE/SBOM review; scan the final image digests regularly. Consider a production dependency-pruning or multi-stage image strategy that retains only the Prisma tooling required at migration startup. Keep image hardening separate from the existing auth non-root ticket.
- SA design / contract / flow / dependency change needed: no service contract change expected; infra must research compatible image digests and confirm boot-time Prisma migration requirements before implementation.
- Acceptance criteria: all shipped base-image versions and digests have a dated CVE scan/SBOM; no unreviewed stale image remains; runtime image contents are minimized without removing migration/runtime requirements; Node runtime version remains consistent across local and container toolchains.
- Safe verification plan and prerequisites: use a trusted scanner on locally available or built image digests without starting target containers; record image digests and advisory DB timestamp; build/test only in the required bounded sandbox. Do not pull, publish or deploy images as part of this investigation.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles, revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint: `container-base-image-refresh-and-production-image-scope`
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
