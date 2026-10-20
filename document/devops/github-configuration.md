# GitHub Actions setup

Prepared: 2026-10-11. The user will configure GitHub settings. No remote variable/secret was
created by this task. CI works without custom credentials; publication is deliberately gated.

## Variables and secrets

Open repository **Settings -> Secrets and variables -> Actions**. Create non-sensitive
configuration under Variables; actual credentials under Secrets, never committed YAML.
[GitHub variable documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables).

| Name | Kind / scope | Required when | Value / default | Notes |
|---|---|---|---|---|
| ENABLE_IMAGE_PUBLISH | Repository variable | Requesting publish=true | Set exactly true; unset means disabled | Preflight reads repository scope before the publish environment is entered |
| IMAGE_NAMESPACE | Repository or container-publish environment variable | Optional | Defaults to github.repository, lowercased; example your-owner/f1-system | Must be owner/project; token must have access to resulting GHCR packages |
| GITHUB_TOKEN | Automatic GitHub job token | Explicit publication | Created by GitHub; no manual secret required | Only publish jobs request packages:write; CI/build-only have contents:read |

These are the active pipeline inputs. No placeholder token/password is embedded and no
PAT, SSH key, production database URL, auth secret or SMTP credential is needed for CI.
Exception, by design (2026-10-14, BE-CUS-012): the CI Compose-validation step sets
`PARTNER_SERVICE_TOKEN=ci-compose-config-validation-only-not-a-secret` in that step's env,
because docker-compose.yml fails fast (`:?`) without it. It is a fixed non-secret literal
used only for `docker compose config --quiet`; nothing starts with it, it is not a GitHub
Secret and must never be reused as a runtime token. No repository setting is needed.
Custom target/registry changes must update this ledger and workflow rather than silently
accept a new credential path.

## Environment and permissions

Create **Settings -> Environments -> container-publish** before enabling publication.
Configure appropriate branch restrictions and required reviewer protection where the
repository plan supports it. A name alone is not a protection rule. Keep package access
limited to this repository and the intended namespace; do not make images public merely
to avoid authentication. GHCR can use scoped GITHUB_TOKEN from Actions.
[GHCR authentication/access](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry),
[environment protection](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

Allow the pinned actions under repository/organisation policy. Publishing requests
packages:write only in its job; organisation/package policy can still reject the push.
Checkout does not persist Git credentials. External PR CI gets no deployment/package-write
secrets. No pull_request_target workflow exists and there is no production deploy job.
Publication preflight also allows only refs/heads/dev or refs/heads/master; other branches
and tags can build without publication but cannot publish through this baseline. This gate
does not create GitHub environment reviewers/protection: configure those settings before
enabling the publication variable. Future branch-policy changes update both code and docs.

## Run

1. Publish the reviewed workflow files to GitHub using an authorized commit/push process.
   GitHub workflow_dispatch requires the workflow to exist on the default branch before
   manual discovery/execution; the local branches are dev/master, but the remote default
   branch has not been inspected or changed.
   [workflow_dispatch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch).
2. CI runs on dev/master pushes or pull requests. It uses Node from .nvmrc and pnpm from
   packageManager, frozen install, lint/build/typecheck, the four current workspace
   Vitest scripts (frontend, auth, gateway, partner), and quiet Compose syntax checks.
   Build precedes typecheck because clean Next/Prisma generated types must exist.
   `PARTNER_LIVE_TESTS=0` excludes opt-in live partner integration tests; no E2E or
   remote workflow execution is claimed by the local CI change.
3. In Actions choose **Service images -> Run workflow**, select the trusted source branch,
   and leave publish=false to build without registry login/push. Reusable CI must pass first.
4. To publish, configure ENABLE_IMAGE_PUBLISH and environment/package access first, then
   explicitly select publish=true. A requested publish with the flag absent fails preflight.
5. Record all four service results (frontend, gateway, auth, partner) and each published digest from job summaries. Partial
   matrix success is not a releasable service set. Deployments should consume recorded
   digests; source-SHA tags are traceable labels, not immutable storage guarantees.

This baseline builds linux/amd64 with max-parallel=1 and finite job timeouts. It does not
verify production CPU architecture, runtime security, startup, migrations, connectivity or
capacity. Before deployment infra confirms platform/config and appropriate runtime checks.

## Future deployment placeholders

Reserve names only; **current workflows do not read these**. They are not a ready deploy
contract. Resolve the actual target/transport/infra rollout before enabling a deploy job.

| Proposed name | Proposed kind | Purpose |
|---|---|---|
| DEPLOY_HOST | Environment variable | Real authorized target hostname |
| DEPLOY_PORT | Environment variable | Selected secure transport port |
| DEPLOY_USER | Environment variable | Scoped deployment identity |
| DEPLOY_PATH | Environment variable | Authorized host application directory |
| DEPLOY_SSH_PRIVATE_KEY | Environment secret, if SSH selected | Scoped key; never a committed placeholder |
| DEPLOY_KNOWN_HOSTS | Environment secret/config, if SSH selected | Verified host key; never disable host-key checking |
| GHCR_PULL_TOKEN | Environment/host secret, if needed | Read-only private-image pull access; do not reuse publish permissions |

Application AUTH_SECRET, CRM_API_KEY and database credentials stay in the eventual
infra-approved runtime secret contract. The same applies to backend-api-partner
(infra bundle backend-api-partner/1): `PARTNER_DATABASE_URL` (must include
`?schema=partner`), `PARTNER_SERVICE_TOKEN` (>= 32 chars, identical in gateway and partner;
production rejects the .env.example value) and gateway `PARTNER_SERVICE_URL`
(http://backend-api-partner:3201). They are runtime-only, never Docker build args, and
current workflows do not read them. Do not inject production secrets into image build
steps. All build context excludes .env variants and project skill/audit documents.

## Verified action pins

Resolved upstream release commits through the official repositories on 2026-10-11;
recheck releases/advisories before changing a pin. The workflows use full commit SHAs.
[GitHub action pinning/security](https://docs.github.com/en/actions/reference/security/secure-use).

| Action | Version | Commit |
|---|---|---|
| actions/checkout | v7.0.1 | 3d3c42e5aac5ba805825da76410c181273ba90b1 |
| actions/setup-node | v7.1.0 | 949feb2413d6458794dcd2491c4babbbce0c15c1 |
| pnpm/action-setup | v6.1.0 | ea17c68df8912ef543352723c149a84f56e3d413 |
| docker/setup-buildx-action | v4.4.1 | f87e5991a6d7451dcb8d9637bfbc97413f497069 |
| docker/login-action | v4.6.0 | dbcb813823bdd20940b903addbd779551569679f |
| docker/build-push-action | v7.4.0 | c3c9e263c25d99ce0380d002d59b67737d91b0dc |

Sources: [Node/cache action](https://github.com/actions/setup-node),
[pnpm manifest setup](https://github.com/pnpm/action-setup),
[Docker build action](https://github.com/docker/build-push-action),
[Docker GHCR guidance](https://docs.docker.com/build/ci/github-actions/push-multi-registries/).

[action-pins.json](action-pins.json) records the exact pinned official manifests, hashes
and runtime metadata used to validate workflow input keys during this setup.
