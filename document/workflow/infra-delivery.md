# Container infrastructure delivery

`infra` reviews container isolation and configures approved services using official,
version-specific research. SA owns architecture and design approval; backend/frontend own
application behavior; the parent serializes shared files and advances the workflow.

## ADR-triggered work

1. At the start of service work, parent/SA/frontend/backend compares the selected ADR/TODO
   and actual Compose/image/network/volume changes to
   [service-index.md](../infra/service-index.md). A newly added manual user ADR, changed
   accepted revision, new container or material config drift triggers an infra handoff.
   Do not rely on file modification times or only an ADR's sequential number.
   Use exact ADR paths and content hashes: some legacy files repeat heading IDs. A generic
   Accepted technology choice alone is not authorization for unspecified role/credential,
   topology or deployment changes; record the specifically selected task/config scope.
2. Infra researches the exact engine/Compose/service/image version and prepares
   `document/infra/services/<service>/<revision>/security.md` from
   [the template](../infra/template/service-security.md). Include all affected services,
   required communication/egress, mounts/ownership, security settings and justified exceptions,
   resource totals, rollout/rollback, and acceptance/check plans. Link current official sources.
3. Draft/proposed ADRs permit research. SA includes the infra bundle and its revision in
   the existing architecture review before new container/dependency implementation. An
   already accepted, scoped ADR may authorize routine implementation without another
   ceremonial approval; missing deployment/credential/topology decisions are prepared for
   review before dependent edits. Preserve actual user authorization evidence.
4. After approval, the parent assigns infra the scoped Dockerfiles/Compose/config diff as
   the only writer of those shared files. Frontend provides adapters/secret readers in its
   Next.js source; backend provides its service adapters and migration/DB-role changes.
   Each uses a separate scoped handoff; infra does not edit application source.
   Order depends on actual prerequisites: complete adapters before enabling their new config.
   Independent approved code can proceed while infra documents are being prepared.
5. Record actual static and authorized runtime checks, security exceptions, unresolved gaps,
   capacity and completion. Parent returns the verified contract/config status to backend
   and frontend; dependent work waits for its real prerequisite. Infra does not automatically
   start a fresh audit or demand reinstall/rebuild when relevant inputs are unchanged.
   Changed image/build/runtime interfaces also go to devops through the parent with exact
   approved revisions, platform, variable/secret and readiness requirements; see
   [DevOps delivery](devops-delivery.md). Infra retains runtime security ownership.

This is invocation-based routing. No scheduler, filesystem watcher or CI automation is
installed by the skill. The shared service index makes missed/manual ADR changes visible
when a relevant role next runs. New profiles, replicas, helper jobs and changed image
versions are part of the inventory, including containers outside frontend/backend/database.
Only the parent serializes shared service-index writes. Parallel infra workers may write
distinct selected service bundles, then submit index updates for parent integration.

Each bundle records a finite research review-by date with a rationale and explicit triggers:
image/service/Engine/Compose/host version changes, security advisories, config/contract/secret
interface changes, or changed network/storage/capacity requirements. Before a new scoped
implementation/rollout refresh official advisory/image-support evidence. Unchanged config
research can be reused only before review-by and without triggers; a triggered/expired
bundle is researched again without restarting unrelated full audits.

## Reviews and selected fixes

An infra review inventories every requested container/profile and records unchecked areas.
Existing problems/hardening first go into [investigation](../task/investigation/README.md),
with owner `infra`, source evidence and no automatic remediation. The user can select a
ticket with `infra แก้ investigation INV-... revision ...`. Application changes go to
their frontend/backend owner and DB migrations to backend; shared config remains serialized
by the parent. Preserve the
existing user-approved investigation and separate SA gates.

Apply [bounded remediation](remediation.md) across infra/frontend/backend: one root-cause
ledger, default three corrective passes total, initial fix included. No repeated config
toggles or unchanged handoffs. Missing runtime access yields a verification gap, not
another config patch or false success. Stop after the selected criteria pass.

## Outputs and resource budget

- [Security baseline and sources](../infra/security-baseline.md): starting guidance, not
  a static substitute for researching each actual version.
- [Service index](../infra/service-index.md): explicit desired/observed revisions and status.
- `document/infra/services/<service>/<revision>/security.md`: selected service bundle.
- `document/task/investigation/`: review discoveries; `document/task/done/`: completed work.

Production is one **8 GB RAM / 4 vCPU** host. Calculate merged deployment limits and
concurrent init jobs/replicas; retain OS/Docker headroom. A proposed additional service
does not grant more host capacity. Runtime enforcement and capacity need measured evidence;
static config is only one part of that evidence.
