# Senior DevOps delivery

Use `devops` for GitHub Actions CI, service image pipelines, GitHub variable/secret contracts,
and release/rollback preparation. Always apply senior engineering judgment: inspect actual
scripts/dependencies, avoid unrelated tooling, and make provenance/failure handling explicit.
Infra owns container/runtime security; this role owns delivery automation.

## Current pipelines

- [.github/workflows/ci.yml](../../.github/workflows/ci.yml): pushes to the existing `dev`
  and `master` branches, PRs and manual calls. Uses .nvmrc, packageManager and the lockfile;
  lint -> workspace build (Prisma/Next type generation) -> typecheck -> quiet base/dev
  Compose validation. It is also reusable by the service-image workflow.
- [.github/workflows/service-images.yml](../../.github/workflows/service-images.yml): manual
  run only. First check publication settings and run CI; then serially build the frontend,
  gateway and auth Dockerfiles. Publication defaults off. Explicit publication needs
  repository `ENABLE_IMAGE_PUBLISH=true`, the container-publish environment, package access
  and the selected maintainer-initiated workflow run from dev/master. Environment reviewer
  protection must be configured separately; the preflight additionally checks trusted refs.
  No deploy/restart/migration runs.
- PostgreSQL/Mailpit remain upstream images, not invented local build targets. See the
  [service index](../devops/service-index.md) and [GitHub configuration](../devops/github-configuration.md).

## Service changes and ownership

1. Parent/SA/infra hands devops exact selected ADR, service/infra revision, Dockerfile,
   workspace dependencies, build/runtime variables, image platform, migration and check
   requirements. Proposed services allow draft pipeline work; a working build target needs
   the actual approved source/Dockerfile. Compare actual services with the delivery index.
2. Devops prepares the workflow diff and config-variable ledger. Reuse current scripts and
   toolchain; significant registry/topology/credential/deploy changes need the relevant SA
   and infra decisions. Existing authorized CI changes need no repeat approval ceremony.
3. Parent serializes `.github/**`, delivery index, build context rules and shared manifests;
   assign one writer. Infra handles runtime/container hardening; frontend/backend implement
   their adapters and backend handles DB migrations. Do not race shared files.
4. Validate files/action manifests/permissions/trust boundaries, and perform only authorized
   local checks. Record what still needs GitHub settings and a real remote run. A YAML parse
   does not prove the workflow's scripts/images pass on a clean runner.
5. Update index/configuration docs and completion evidence. New independent security or
   workflow findings first enter investigation with owner devops; they are selected later.

## Releases and limits

Use full action commit pins and image digests. A source-SHA image tag provides traceability
but may change on rebuild; the digest is the immutable deployment identity. Build images
on GitHub runners, keeping runtime deployment within the shared 4 GB RAM / 2 vCPU host.
Do not assume the production host is amd64 or ready because the initial pipeline builds
linux/amd64; infra must confirm actual target platform before deployment.

Publishing images is distinct from deploying. Partial matrix publication is not a complete
release: if any service fails, retain its failure and successful image identities, and do
not deploy a partial set. A future deployment needs exact targets, infra-approved config,
environment secrets/access, readiness, migration ordering, rollback and user authorization.
Do not invent SSH execution, run on the production host, use default credentials, or mask
missing settings with a successful skipped release.

Apply [bounded remediation](remediation.md) across devops/infra/application roles: one
root-cause ledger, three corrective passes total by default. Retry only with new diagnosed
evidence; stop on success/no-progress/missing verification/exhaustion. Do not rerun an
unchanged pipeline indefinitely or broaden selected work to new audit findings.

User creates GitHub variables/secrets later. This setup neither changes remote settings nor
publishes code/images, and no deployment is implied by skill invocation. A remote run is
recorded separately when actually authorized and performed.
