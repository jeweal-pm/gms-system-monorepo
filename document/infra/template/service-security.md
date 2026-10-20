# Container security: <service> / <revision>

## Selection and inventory

- Service ID / infra revision / status: draft | pending-review | approved | implemented-unverified | verified | blocked
- Parent task / exact ADR paths and revisions / user authorization evidence:
- Config/image/source hashes, engine/Compose versions, target OS/architecture:
- Image provenance/tag/digest and upstream support/security advisory status:
- Compose files in order, profiles, environment, replicas and helper/init jobs:
- Research date, finite review-by date with rationale, and triggers invalidating this research:
- Fresh advisory/image-support check for this implementation/rollout:

## Official research and control decisions

| Setting/control | Official source and applicable version | Current/desired value | Reason | Required exception/compatibility evidence | Implementation owner |
|---|---|---|---|---|---|

Cover runtime UID/GID/init privileges, capabilities, no-new-privileges, seccomp/LSM,
read-only root and writable paths, secrets/credentials, image/build context, host/socket
access, authentication/encryption, backups, limits and log/disk bounds. Mark inapplicable
controls with a reason; do not copy every possible control to a service.

## Required and prohibited communication

| Caller | Callee/DNS | Container port/protocol | Network(s) / published host bind | Authentication/TLS | Required egress/readiness | Positive/negative acceptance |
|---|---|---|---|---|---|---|

Map browser/ingress separately from server-to-server traffic. Document caller credentials,
service listener, certificates/names, network membership and policy boundaries without
including credential values. Shared bridge membership is not per-port access control.

## Storage, init and data protection

- Exact writable mount/tmpfs paths, ownership and bounds:
- Existing data vs clean initialization; version-specific PGDATA or equivalent:
- Secret reader support and adapter dependencies:
- Application roles vs migration/bootstrap roles and granted scope:
- Safe migration/rotation procedure, backup/restore and rollback; required authorizations:
- Development watch/bind-mount exceptions and production differences:

## Capacity

- Service CPU/RAM/process/shm/log/disk limits, pools/concurrency/timeouts:
- Aggregate merged limits including replicas and overlapping init jobs:
- Remaining headroom on 4 GB RAM / 2 vCPU; unresolved measurements:

## Rollout and verification

- Claimed infra/integration paths and application/DB-owner handoffs:
- Exact proposed diff / deployment authorization boundary / rollback:
- Static config checks; authorized runtime/init/persistence/readiness checks:
- Required-path and blocked-path checks; finite check deadlines:
- Checks actually performed and results; checks not run and blockers:
- Findings/exception links in document/task/investigation/:
- Shared corrective ledger/pass count and terminal reason, when applicable:
- Approval evidence for material changes; completion report link:

Implemented configuration is not verified deployment. Update the index with the exact
applied revision and evidence only after the stated checks are satisfied.
