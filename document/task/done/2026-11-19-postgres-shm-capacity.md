# Local PostgreSQL shared memory capacity

- Date: 2026-11-19 (Asia/Bangkok)
- Scope: Existing local GMS Compose stack (`docker-compose.yml` + dev and GMS preview overlays).
- Change: Set PostgreSQL `shm_size: 256mb`, matching [GMS platform spec §3.2](../../gms-platform-spec.md#32-memory-budget-compose-mem_limit). The existing 1024 MiB container memory limit is unchanged.
- Reason: Before the change, Docker reported a 64 MiB `/dev/shm` mount for PostgreSQL. PostgreSQL can allocate dynamic shared memory for parallel queries; increasing the container's `/dev/shm` capacity addresses that specific resource ceiling. It does not prove that every generic “No space left on device” error came from `/dev/shm`; database data/temp disk, host storage, or another quota can cause similar failures.
- Config evidence: Merged Compose rendered PostgreSQL `shm_size=268435456` and `memory=1073741824` bytes. `docker-compose.yml` SHA-256: `90bd3aafa312c78e47c97ce0d290b8959c695e61d81636ffc034440ed47a4a37`.
- Runtime evidence: Recreated only the Postgres container. `/dev/shm` reports 256 MiB; `pg_isready` and `SELECT 1` passed. The existing `gms-system-monorepo_postgres-data` volume remained mounted. Postgres reports healthy; frontend and GMS ingress returned HTTP 200 after restart.
- Limits: No synthetic parallel-query/load test was run. The change raises the available shared-memory ceiling, not Postgres `work_mem`, `shared_buffers`, CPU, or the 1 GiB container cap. Production load/capacity remains unverified.
- References: [Docker Compose `shm_size`](https://docs.docker.com/reference/compose-file/services/#shm_size), [PostgreSQL 18 resource consumption](https://www.postgresql.org/docs/18/runtime-config-resource.html), and [parallel query](https://www.postgresql.org/docs/18/parallel-query.html).
