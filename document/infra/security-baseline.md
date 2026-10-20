# Container security baseline and research

Research starting point: 2026-10-11. Recheck official docs/advisories for the exact selected
image, service version, Docker Engine, Compose and Linux host before implementation.
Record a finite research review-by date and explicit advisory/version/host/config/contract
triggers for each bundle. Refresh official security advisory/image-support evidence before
new implementation/rollout; reuse unchanged configuration research only while still valid.
The goal is the strongest justified isolation compatible with the approved service,
not a universal set of flags or a claim that configuration prevents every attack.

## Inspect the real deployment

Inventory all Compose services/profiles/helper jobs, their images and Dockerfiles, volume
ownership, effective overrides, secrets, networks, ports and resource limits. Record unknown
host/runtime facts. Merge files in deployment order and examine the effective result:
override lists may retain earlier bindings/mounts, so adding a stricter entry does not
necessarily remove an existing one. Avoid dumping resolved secret-bearing config in logs.
[Docker Compose merge rules](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/).

Inspect deployment metadata only when authorized and sanitize results. A quiet config
validation or service-name listing can avoid exposing interpolated credentials; neither
proves runtime security or connectivity. A running-state inspection must not print environment
values, secret files or full database URLs.

## Isolation with service-specific exceptions

Use a non-root runtime where the image supports it, remove capabilities not required by
the process, and avoid privileged mode, host namespaces/devices and Docker-socket/host-root
mounts. Docker daemon access is a host-level privilege boundary. Host daemon/firewall/rootless
changes need their own authorized rollout and compatibility research.
[Docker Engine security](https://docs.docker.com/engine/security/).

Keep supported default seccomp enforcement; do not disable it to solve an unexplained
startup error. Review applicable host AppArmor/SELinux controls without assuming Docker
Desktop exposes the same enforcement as the production Linux host.
[Docker seccomp](https://docs.docker.com/engine/security/seccomp/).

For each image evaluate `no-new-privileges`, capability removal, `read_only`, bounded writable
tmpfs/volumes, PID/resource constraints and user identity. Document exact supported exceptions
and writable paths. Do not drop an initialization capability or force an arbitrary UID before
checking ownership and entrypoint behavior. Compose exposes these controls; their presence
alone does not establish that the workload is safe or starts correctly.
[Compose service controls](https://docs.docker.com/reference/compose-file/services/).

## Communication and exposure

Use service DNS and container ports for required internal calls. Keep only required
network memberships, map browser/public ingress separately, and restrict database/admin
host publishing to its justified scope. List required SMTP/API/backup egress before isolating
a network. Services sharing a bridge can communicate; `expose` is not a firewall. Do not
claim per-flow denial unless the actual network/host/application policy enforces it.
[Compose networking](https://docs.docker.com/compose/how-tos/networking/).

Published ports can become reachable outside the host; explicitly select intended bind
addresses and verify effective host firewall behavior rather than assuming it blocks Docker
traffic. Development host tools may need a loopback binding; production should expose only
approved ingress/admin paths. Required cross-container listeners cannot simply bind to the
container's loopback address.
[Docker port publishing](https://docs.docker.com/engine/network/port-publishing/).

For every changed path plan a positive check for legitimate traffic and a negative check
for forbidden access. Preserve service DNS, certificates/hostnames, authentication, listener
ports, readiness and justified egress. A `depends_on` order or listening socket is not proof
that an authenticated business operation succeeds.

## Images, secrets and writable data

Use maintained official/verified images and minimal runtime contents. Record image provenance,
version/digest, platform and a refresh policy; a fixed digest does not patch itself. Keep
secrets and unnecessary workspace artifacts out of image build contexts/layers. Evaluate
multi-stage builds where they materially reduce runtime contents without breaking generated
clients or dependencies. Research actual advisories before asserting vulnerability status.
[Docker build guidance](https://docs.docker.com/build/building/best-practices/).

Grant secrets only to their consumers. Compose secret mounts require a service-supported
file reader or a coordinated application adapter; `_FILE` is not universally supported.
Plain Compose secrets are not a managed encrypted vault: protect their host source, access
and backups. Verify actual file permissions and Compose limitations. Never put actual
credentials in committed config, reports, health commands or command arguments.
[Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/).

Preserve data ownership across UID changes and distinguish clean initialization from
existing volumes. Specify backups, restore and rollback; never delete a volume to obtain
a clean security test. Production app runtime and development watch/build environments
have different write requirements and documented exceptions.

## PostgreSQL example

Check the chosen official image tag before imposing UID/GID, capabilities and filesystem
restrictions. PostgreSQL requires writable owned data and socket/runtime paths. For image
version 18+ the versioned PGDATA and recommended volume mount layout differ from older
examples; this checkout mounts `/var/lib/postgresql`. Initialization variables and init
scripts apply to an empty data directory; changing Compose does not rotate roles/passwords
on an existing database. `POSTGRES_USER` provisions an initial superuser, so design separate
restricted application roles and migration/bootstrap access rather than using that role
as the permanent app account. Coordinate actual DB-role changes with backend.
[Official PostgreSQL image documentation](https://github.com/docker-library/docs/blob/master/postgres/README.md).

Prefer SCRAM password authentication for supported clients; switching stored password
format/authentication can require actual credential changes and compatibility verification.
Do not set remote `trust` authentication as a connectivity fix.
[PostgreSQL 18 password authentication](https://www.postgresql.org/docs/18/auth-password.html).

Review ordered `pg_hba.conf` rules against actual databases/users and network ranges.
Match only approved clients, and align TLS-required rules with real server/client TLS and
certificate configuration. No static container IP guesses or indiscriminate broad rule
should stand in for the intended boundary. Test authorized roles and rejected callers only
within the authorized environment.
[PostgreSQL 18 pg_hba.conf](https://www.postgresql.org/docs/18/auth-pg-hba-conf.html).

Budget Postgres memory, shared memory, connections and aggregate application pools together
with the other containers. Protect persistent storage and avoid public database publishing
unless a specifically approved administration path requires it. Readiness must include the
actual application's authentication/permissions, not only `pg_isready`.

## Application and supporting containers

Next.js self-hosting has runtime cache/write requirements; identify actual `.next` and
image/cache paths before choosing read-only filesystems or a shared-cache design. Preserve
server-to-server endpoints and build-time/runtime configuration distinctions.
[Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting).

NestJS/Prisma setup must preserve generated clients, certificate files, startup/migration
behavior and database permissions. A secret-file-only config needs an actual consumer;
infra hands backend adaptations/migrations to backend, and Next.js adaptations to frontend.
Do not log config values.

Mailpit is the project's local email capture tool; determine SMTP/UI access, authentication,
TLS and data retention from its version's configuration. Do not carry a development mail
capture/admin exposure into production without a documented product/deployment decision.
[Mailpit configuration](https://mailpit.axllent.org/docs/configuration/).

Research any new proxy, cache, queue, worker, monitoring or other image individually. Its
own writable paths, credentials, auth/TLS and egress must be represented in the service
bundle; this PostgreSQL example is not a config template for unrelated services.

## Resources, logs and verification

Production totals are 4 GB RAM / 2 vCPU. Calculate merged CPU/memory limits, replicas,
overlapping migration/init work, tmpfs/shared memory, app/DB pools and disk/log growth.
Keep OS/Docker headroom and distinguish build from runtime demand. Record measurements
still needed rather than guaranteeing capacity from YAML alone.

Bound container log growth with a suitable driver/rotation policy; changes must account
for existing log consumers and container recreation semantics.
[Docker logging configuration](https://docs.docker.com/engine/logging/configure/).

Static configuration, live applied state, permitted connectivity, forbidden connectivity,
persistence/init and recovery are separate checks. Record which actually ran. Use finite
deadlines and the shared [bounded-remediation policy](../workflow/remediation.md); do not
invent test success, keep toggling flags without diagnosis, or restart full audits after
each adjustment. Audit execution still requires the auditor's isolation safeguards.
