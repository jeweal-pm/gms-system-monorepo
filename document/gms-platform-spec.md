# GMS Platform — Engineering Spec

Version 1.1 · 20 October 2026
(1.1: `api-partner` renamed to `api-master`; Next.js frontend added; PostgreSQL may be local or managed.)

This spec defines how services in the GMS platform are built and deployed. It is written for
developers and coding agents. Rules marked **MUST** are mandatory; **SHOULD** are strong defaults
that need a written reason to break.

---

## 1. Context and scope

- Product: GMS, a jewelry ERP (auth, master data, inventory, more modules later).
- Naming: `GMS` is the app name and `gms` is its namespace for package, database,
  role, image and host-path examples. `ERP` describes the category of software.
- Stack: Next.js frontend; Node.js APIs (NestJS for existing services, Hono for new ones);
  PostgreSQL (minimum major version 16, tested on 16 and 18); Redis; Nginx; Docker Compose.
  One server per customer installation.
- Design baseline: **4 GB RAM, 1–2 vCPU**. Code MUST run within this budget. Larger servers
  only add headroom.
- Deployment profiles are chosen per customer on two independent axes:
  - Database: **db-local (default)** — PostgreSQL container on the same server;
    **db-managed** — a managed PostgreSQL service. Switching changes configuration only
    (connection URLs, TLS settings), never application code.
  - Files: **fs (default)** — the server's own disk, no external dependency;
    **s3-cloud** — AWS S3 or Cloudflare R2; **s3-garage** — Garage (S3 API) on the same server.
- Customer data MAY be forbidden from leaving customer-controlled infrastructure. The default
  profiles (db-local + fs) send no data to any third party.

---

## 2. Architecture

### 2.1 Containers

| Container | Tech | Role | Published port |
|---|---|---|---|
| `nginx` | Nginx | Reverse proxy, TLS, static and protected file delivery | 80, 443 (only one) |
| `frontend` | Next.js (standalone) | Web UI, server-side rendering | none |
| `api-auth` | NestJS | Users, roles, login, token issuing | none |
| `api-master` | NestJS | Customers, suppliers, contacts, general master data | none |
| `api-inventory` | Hono | Items, units, warehouses/locations, lots, stock, documents | none |
| `worker` | Node.js | Queue jobs: reports, exports, imports, batch PDF | none |
| `postgres` | PostgreSQL 16+ | **db-local only.** One schema per service | none |
| `redis` | Redis | BullMQ queues, short-lived cache | none |
| `garage` | Garage v2.x | **s3-garage only** | none |

- Only `nginx` publishes ports. Database, Redis and Garage ports MUST NOT be published on the host.
- There is no Node.js API gateway. Nginx routes by path:
  `/api/auth/` → api-auth, `/api/master/` → api-master, `/api/inventory/` → api-inventory,
  everything else → frontend.
- The browser talks to one origin only (the Nginx host). Frontend and APIs share it, so the
  frontend calls APIs with relative URLs (`/api/...`) and no CORS is needed for the web app.
- Each service verifies JWTs itself with the auth service's public key (no per-request call to auth).
  **Approved GMS migration exception (SA revision 1, 2026-10-20):** a protected
  domain request also checks current local account/session/grants through the
  auth-owned read-only PostgreSQL view. While the license server is reachable,
  it makes a private auth-mediated online license check so remote revocation
  takes effect on the next request. Only a transient outage may use the bounded
  policy in [the license amendment](spec/gms-license-offline-policy.md):
  `LICENSE_OFFLINE_GRACE_DAYS` 0–2, default 2, limited by the last signed
  result's expiry and natural license expiry under the approved three-day
  license-contract revision 2. This exception is staged; the online path and
  route cutover remain blocked until external implementation and capacity are verified.

### 2.2 Data ownership

- One PostgreSQL schema per service (`auth`, `master`, `inventory`), each with its own DB users.
  A service writes **only** to its own schema.
- Cross-service reads go through the owning service's API or a read-only view granted to the reader.
  No cross-schema writes, no cross-schema foreign keys.
- Placement of master data:
  - `master`: customers, suppliers, contacts, provinces, currencies, payment terms and other
    general masters not tied to stock.
  - `inventory`: items/SKUs, units and unit conversions, warehouses/locations, lots/serials —
    anything used inside a stock transaction.
- A service MAY keep a local read copy of another service's master data it needs on hot paths,
  refreshed by events or on a schedule.

---

## 3. Runtime constraints (4 GB baseline)

### 3.1 Server

- OS: Ubuntu Server 24.04 LTS (Debian 12/13 acceptable). No control panels (cPanel etc.).
- Swap: 2 GB.
- All persistent data lives under `/srv/gms/` on the host (bind mounts):
  `/srv/gms/postgres`, `/srv/gms/storage`, `/srv/gms/redis`, `/srv/gms/backups`.

### 3.2 Memory budget (compose `mem_limit`)

| Container | mem_limit | Process setting |
|---|---|---|
| OS + Docker | ~500 MB (not limited) | — |
| postgres (db-local only) | 1024 MB | see 3.3, `shm_size: 256mb` |
| frontend | 256 MB | `--max-old-space-size=160` |
| api-auth | 384 MB | `--max-old-space-size=256` |
| api-master | 384 MB | `--max-old-space-size=256` |
| api-inventory | 256 MB | `--max-old-space-size=192` |
| worker | 512 MB, `cpus: 1.0` | `--max-old-space-size=384` |
| redis | 192 MB | `maxmemory 128mb` |
| nginx | 32 MB | — |
| garage (s3-garage only) | 192 MB | — |

| Profile | Total | Fits 4 GB? |
|---|---|---|
| db-local + fs (default) | ~3.5 GB | Yes (with 2 GB swap) |
| db-managed + fs or s3-cloud | ~2.5 GB | Yes, comfortable |
| db-local + s3-garage | ~3.7 GB | No — requires ≥ 8 GB |

Frontend sizing was measured with Next.js 16 standalone: ~85 MB idle; an SSR page under load
peaked at ~280 MB without a heap cap and ~180 MB with `--max-old-space-size=160`, with no errors.

### 3.3 PostgreSQL settings (db-local, 1 GB container)

For db-managed, the provider's parameter settings apply; only role-level settings (section 4.6)
are portable.

```
shared_buffers = 256MB
effective_cache_size = 768MB
work_mem = 8MB
maintenance_work_mem = 64MB
max_connections = 40
max_parallel_workers_per_gather = 1
idle_in_transaction_session_timeout = 60s
log_min_duration_statement = 500ms
```

- Connection pools: api-auth 5, api-master 10, api-inventory 10, worker 5 (total 30 < 40).
  Pool sizes come from env (`DB_POOL_MAX`) so they can be lowered for managed plans.
- Reports and exports run under a dedicated read-only role with `statement_timeout = 120s`.
- The official `postgres:18` image stores data under `/var/lib/postgresql`; mount
  `/srv/gms/postgres:/var/lib/postgresql` (for 16/17 images the data path is
  `/var/lib/postgresql/data`).

### 3.4 Redis

- One instance, `maxmemory-policy noeviction` (required by BullMQ), `appendonly yes`.
- Every cache key MUST have a TTL. Keep cached values small.

### 3.5 Coding rules that protect memory

- Never load unbounded result sets. List endpoints paginate (max 200 rows).
- Never buffer a whole file or export in memory; stream (see sections 5.3 and 8).
- No unbounded in-process caches.
- No Puppeteer/Chromium. PDFs use pdfmake or pdfkit.
- Do not use tmpfs for temporary files (tmpfs consumes RAM). Use `/srv/gms/storage/.tmp`.

---

## 4. Database rules

### 4.1 General

- Quantities and money use `numeric`, never float.
- Primary keys: UUIDv7 generated in application code (e.g. the `uuid` package, `v7()`);
  column default `gen_random_uuid()` as a fallback. Do not use `uuidv7()` in SQL — it exists only
  in PostgreSQL 18+, and managed providers may run 16 or 17.
- Every column used for filtering in lists or reports has an index. Text search uses `pg_trgm`
  (never `LIKE '%x%'` on unindexed columns).
- No N+1 queries: load related rows in one query or one batched query.
- Migrations are versioned; see section 4.6 for how they run.

### 4.2 Stock

- `inventory.stock_movements` is append-only (never updated or deleted). Corrections are new movements.
- `inventory.stock_balances` holds current quantity per (item, location, lot), unique with
  `NULLS NOT DISTINCT` so non-lot items get exactly one row.
- Posting a document (MUST, in one transaction):
  1. Aggregate lines by (item, location, lot) — duplicate lines in one document are merged first.
  2. Ensure balance rows exist (`INSERT ... ON CONFLICT DO NOTHING`).
  3. Lock balance rows in a stable order: `SELECT ... ORDER BY item_id, location_id, lot_id FOR UPDATE`.
  4. Update balances with a guard against negative stock; if any line fails, roll back and return
     the failing lines.
  5. Insert movements in one multi-row insert.
- See Appendix E for SQL.

### 4.3 Document numbers

- Running numbers per (document type, period) come from a counter table updated inside the posting
  transaction (gap-free; concurrent posts of the same type serialize on that row).
- The period is derived from the document date in `Asia/Bangkok`, never from the server's time zone.
- Never compute "max number + 1" in application code.
- Plain PostgreSQL sequences are only for internal IDs where gaps are acceptable.

### 4.4 Idempotency

- Every write endpoint that creates or posts a document accepts an `Idempotency-Key` header.
- The key is stored in the same transaction as the write. A repeated key returns the stored result;
  the same key with a different request body returns 409. Keys are purged after 24 hours.

### 4.5 Connecting to PostgreSQL — local or managed (Backend)

The same code MUST run against db-local and db-managed. Only configuration changes.

- Each service reads three connection URLs:
  - `DATABASE_URL` — app role (DML on its own schema only);
  - `DATABASE_URL_REPORTS` — read-only role (`statement_timeout = 120s`), used by reports and exports;
  - `DATABASE_URL_MIGRATIONS` — schema owner role, used only by the migration job.
- TLS is configured from env, not inferred from the URL:
  `DB_SSL=off|verify-full` and `DB_SSL_CA_FILE`. db-local inside the Docker network: `off`.
  db-managed: `verify-full` with the provider's CA bundle. Build the driver's `ssl` option explicitly
  (`{ ca, rejectUnauthorized: true }`); never use `rejectUnauthorized: false` in production.
- Pool size from `DB_POOL_MAX`; idle timeout 30 s. Never hard-code pool sizes.
- Startup: never assume the database is up. Retry with exponential backoff for up to 2 minutes,
  then exit non-zero so the container restarts. `GET /healthz` = process alive;
  `GET /readyz` = database and Redis reachable.
- Pooler compatibility — code MUST work behind a transaction-mode pooler (PgBouncer, provider pools):
  - no session state: use `SET LOCAL` inside a transaction, never plain `SET`;
  - advisory locks only `pg_advisory_xact_lock` (transaction-scoped);
  - no `LISTEN/NOTIFY` (use Redis pub/sub);
  - cursors and temp tables only inside a single transaction (no `WITH HOLD`);
  - no named prepared statements unless the pooler is confirmed to support them.
- Round trips: a managed database adds network latency to every query, so round trips per request are
  bounded — list/read ≤ 3 queries; posting a document ≤ 10 queries regardless of line count
  (batch with `unnest` / multi-row statements).
- Time: all timestamps are `timestamptz`; sessions run in UTC. Business dates (document period,
  report day) are computed explicitly in `Asia/Bangkok`.
- Thai sorting: default collations may differ between local and managed. Where Thai order matters,
  use an explicit ICU collation and verify it exists on the target (`SELECT collname FROM pg_collation
  WHERE collname LIKE 'th%'`).

### 4.6 Portable PostgreSQL subset (Backend)

- Minimum major version 16. Features newer than 16 (for example `uuidv7()`) are not used.
- Extensions are limited to an allowlist commonly offered by managed providers:
  `pg_trgm`, `pgcrypto`, `citext`, `btree_gist`, `pg_stat_statements`. Confirm availability on the
  chosen provider before adding any other.
- No superuser at runtime or in migrations. Forbidden: `ALTER SYSTEM`, server-side file access
  (`COPY ... TO/FROM '<file>'`, `pg_read_file`), untrusted languages, custom C extensions.
  `COPY ... TO STDOUT` / `FROM STDIN` is allowed.
- Timeouts are set per role in migrations (portable), not in postgresql.conf:
  `ALTER ROLE gms_reports SET statement_timeout = '120s';`
  `ALTER ROLE gms_<service>_app SET idle_in_transaction_session_timeout = '60s';`
  `ALTER ROLE gms_<service>_app SET timezone = 'UTC';`
- Migrations run as a one-off job (`docker compose run --rm migrate-<service>`) before the new
  version starts — never on application startup. They are backward compatible with the running
  version (expand → migrate → contract).
- CI runs migrations and integration tests on PostgreSQL 16 and 18; a nightly job runs them against
  a managed test database over TLS.

### 4.7 Operating PostgreSQL per profile (Infra)

| Topic | db-local | db-managed |
|---|---|---|
| Provisioning | `postgres` container from `compose.db-local.yml` | Provider instance in the region closest to the app server; private network when the provider offers it, otherwise TLS + IP allowlist limited to the app server's IP |
| Roles and schemas | Same provisioning SQL script for both, run with admin credentials (superuser locally, the provider's admin user on managed) | ← same |
| Connections | `max_connections = 40` | Provider plan limit; if the sum of `DB_POOL_MAX` + migration + admin headroom exceeds it, use the provider's pooler |
| Tuning | postgresql.conf (section 3.3) | Provider parameter settings; application must not depend on non-default server parameters |
| TLS | Not used inside the Docker network | `verify-full`; CA file at `/srv/gms/secrets/db-ca.pem` (read-only mount) |
| Backups | pgBackRest + off-server copy (section 9) | Provider automated backups/PITR **plus** nightly `pg_dump -Fc` per schema to the customer's backup target (exit strategy; restorable into db-local) |
| Major upgrades | Infra runs `pg_upgrade` or dump/restore | Provider maintenance; pin the major version |
| Monitoring | Slow query log + `pg_stat_statements` | Provider insights + `pg_stat_statements` |

- Moving between profiles: `pg_dump -Fc` → run the provisioning script on the target →
  `pg_restore --no-owner --role=<schema owner>` → verify row counts per table. Files are independent
  of the database profile.
- Applications log every query slower than 200 ms with its duration (works on both profiles).

---

## 5. Heavy work

### 5.1 Definition

A task is **heavy** if ANY applies:

- runs longer than 2 s;
- touches more than 1,000 rows;
- generates a file (PDF batch, Excel, CSV, image, ZIP), except a single-document PDF under 1 s;
- may use more than 50 MB of memory;
- calls an external service;
- holds locks on stock rows across many lines.

Heavy work MUST run as a queued job or a scheduled off-hours job, never inside the HTTP request.
The API returns a job ID; the client polls or is notified.

### 5.2 Job queue rules

- Two BullMQ queues: `fast` (concurrency 2) and `heavy` (concurrency 1).
  Route by size: exports ≤ 10,000 rows → `fast`; larger exports, imports, period close → `heavy`.
- Workers run in the `worker` container (`cpus: 1.0`, own `mem_limit`). The API never runs heavy work.
- Deduplicate: `jobId = sha256(jobType + normalized params)`. Identical requests share one job.
- Reuse outputs: same report type + params within 10 minutes returns the existing file; for closed
  periods, reuse until the file expires.
- Limits: max 2 pending jobs per user; one import per entity type at a time (Redis lock, `SET NX PX`).
- Expose queue position and ETA; support cancel; jobs have a timeout and retry with backoff for
  external calls.
- Pre-generate common daily reports at 06:00.

### 5.3 Large exports and imports

- Count (or estimate) rows first and tell the user the expected format and time.
- Format by size: ≤ 200k rows → XLSX (streaming) or CSV; > 200k → CSV + ZIP;
  > 1,048,576 rows → CSV only, or require a narrower date range.
- Read with a DB cursor in batches of 1,000–5,000 rows; for CSV prefer `COPY ... TO STDOUT`.
- XLSX uses the ExcelJS streaming `WorkbookWriter` only. Building a full workbook in memory is forbidden
  (measured: ~780 MB RSS at 100k rows; crashes at 500k).
- Imports: streaming reader → staging table → SQL validation → apply in 1,000-row committed batches →
  return an error-row report file.

---

## 6. Performance targets

Measured at the API, p95:

| Operation | Target |
|---|---|
| List / search / read | < 300 ms |
| Save a document (≤ 20 lines) | < 500 ms |
| Post a document (≤ 200 lines) | < 2 s, one transaction, batched SQL |
| Single-document PDF (inline) | < 1 s |
| Enqueue a job | < 200 ms, returns job ID |
| Queue wait for `heavy` jobs | < 3 min |

If p95 exceeds a target for 15 minutes, alert. Sustained queue wait above target after caching and
pre-generation is the signal to move to a larger server.

---

## 7. Authentication

- Passwords: argon2id (or bcrypt). Login is rate-limited at Nginx (`limit_req`).
- Access token (JWT, RS256 or EdDSA) lifetime 15 minutes; refresh tokens rotate, lifetime 7–30 days,
  so users rarely re-enter passwords (password hashing is CPU-heavy at morning login peaks).
- Services verify tokens locally using the public key published by api-auth.

---

## 8. File storage

### 8.1 Interface

- All file access goes through the shared package `@gms/storage` (Appendix A). Services never touch
  the filesystem or S3 SDK directly for stored files.
- A service may only access keys under its own `{service}/` prefix (enforced by the package).

### 8.2 Drivers

Selected by `STORAGE_DRIVER`:

- **`fs` (default, no external dependency)**
  - Files at `/srv/gms/storage/{bucket}/{key}` on the host, bind-mounted at the same path into
    api containers and worker (read-write) and nginx (read-only). Files survive container rebuilds.
  - Upload URL: API endpoint + HMAC token (TTL ≤ 15 min). The body streams to
    `/srv/gms/storage/.tmp/{uuid}`, is size-checked while streaming, then atomically renamed.
  - Download URL: API endpoint + HMAC token. The API verifies the token and permission, sets
    `Content-Type` and `Content-Disposition`, and returns `X-Accel-Redirect: /_storage/{bucket}/{key}`.
    Nginx serves the bytes from disk; file bytes never pass through Node.
  - Keys are validated: `^[a-z0-9][a-z0-9/_.-]*$`, no `..`, no leading `/`, max 512 chars.
- **`s3`** — AWS S3, Cloudflare R2 or Garage.
  - AWS SDK v3. `putStream` uses multipart upload (`@aws-sdk/lib-storage`).
  - Presigned URLs (TTL ≤ 15 min) are generated with the **public** endpoint; server-side calls use
    the **internal** endpoint (the signature is bound to the host).
  - Portable subset only: Put/Get/Head/Delete/ListObjectsV2, multipart, presigned GET/PUT.
    Do not use lifecycle rules, versioning, ACLs, bucket policies or event notifications.

| Setting | AWS S3 | Cloudflare R2 | Garage |
|---|---|---|---|
| `S3_ENDPOINT_INTERNAL` | empty (SDK default) | `https://<account>.r2.cloudflarestorage.com` | `http://garage:3900` |
| `S3_ENDPOINT_PUBLIC` | empty | same as internal | `https://s3.<customer-domain>` (via Nginx) |
| `S3_REGION` | real region, e.g. `ap-southeast-1`, `ap-southeast-7` (Thailand) | `auto` | value of `s3_region` in garage.toml |
| `S3_FORCE_PATH_STYLE` | `false` | `true` | `true` |
| `S3_CHECKSUM_MODE` | default | default | `WHEN_REQUIRED` |
| Public files | CloudFront or presigned | custom domain | Garage web endpoint via Nginx |

- Garage specifics: `replication_factor = 1` (no redundancy — backups are mandatory), behind Nginx with
  `proxy_set_header Host $host`, `client_max_body_size 0`, `proxy_request_buffering off`.
  Do not use MinIO (upstream archived in 2026).
- AWS: least-privilege IAM policy scoped to the system's buckets; Block Public Access stays on.

### 8.3 Buckets and keys

| Bucket | Content | Lifetime | Backed up |
|---|---|---|---|
| `files` | User uploads (attachments, scans) | Permanent (soft delete) | Yes |
| `public` | Product images | Permanent | Yes |
| `documents` | Documents issued by the system (tax invoices, delivery notes, POs) | Immutable; retention per document type | Yes |
| `exports` | On-demand generated files (reports, CSV/XLSX/PDF exports, ZIP, import error reports) | Default TTL 7 days | No |

Key formats (identical across drivers, ASCII only; display names live in metadata):

- uploads: `{service}/{entity}/{yyyy}/{mm}/{uuid}.{ext}`
- documents: `{service}/{docType}/{yyyy}/{mm}/{docNo}-{uuid}.pdf`
- exports: `{service}/{reportType}/{yyyy}/{mm}/{dd}/{jobId}.{ext}`

Because keys are identical, data can move between drivers with `rclone copy` without DB changes.

### 8.4 Metadata

- Every stored object has a row in `{schema}.stored_files` (Appendix B), owned by the service.
  Postgres stores metadata only, never file bytes.
- Deletes are soft: set `deleted_at` and `purge_after = deleted_at + 30 days`; a job purges the object
  later. This keeps DB point-in-time restores consistent with files.

### 8.5 Uploads

- Default limit 20 MB; allowlist of content types (pdf, jpg, png, webp, xlsx, csv) checked by
  content sniffing, not only by extension.
- Flow: client requests upload URL → uploads directly → confirms → service writes metadata
  (`status = pending`) → worker computes sha256 and sets `ready`.

### 8.6 Generated files

- Inline (single document, < 1 s): generate, `putStream` into storage, return a download URL.
  Previews may stream directly to the response without storing.
- Queued: the job streams output into `exports` (or `documents`), updates status and progress;
  the client polls `GET /jobs/:id` until `ready`.
- Generators write to a stream that goes straight to storage (pdfmake/pdfkit, ExcelJS streaming,
  CSV via cursor/COPY, archiver for ZIP). sha256 and size are computed while streaming.
- Documents are immutable: re-download returns the same bytes (verify sha256). Corrections create a
  new document version; an existing key is never overwritten. Documents are never auto-purged;
  deletion requires an explicit admin action and respects the configured retention.
- Download URLs are created on click (TTL ≤ 15 min), bound to the requesting user, never stored.
  Access requires permission on the source document or report, not just the file ID.
- `Content-Disposition`: `attachment` by default, `inline` for PDF preview. Filenames use RFC 5987
  (`filename*=UTF-8''...`) so Thai names work. s3: `ResponseContentDisposition` on the presigned GET;
  fs: set by the API alongside `X-Accel-Redirect`.

### 8.7 Format rules

- CSV: UTF-8 **with BOM** (Excel then displays Thai correctly). Prefix cells starting with
  `=`, `+`, `-`, `@` with a single quote (formula injection).
- XLSX: ExcelJS streaming only; > 200k rows → CSV + ZIP.
- PDF: embed a Thai font (e.g. Sarabun or Noto Sans Thai). Insert U+200B at Thai word boundaries
  (`Intl.Segmenter`, locale `th`) so lines wrap. Golden-file tests check wrapping, tone-mark placement
  and that no missing-glyph boxes appear.

### 8.8 Cleanup and disk guard

- Hourly job (both drivers): delete expired exports and mark rows `expired`; purge soft-deleted objects
  past `purge_after`; delete objects without a metadata row after 24 h; delete temp files older than 1 h.
- fs: refuse new exports and alert when free disk < 10%. Per-user cap on active exports: 2 GB.

---

## 9. Backup and restore

- Production servers MUST NOT hold credentials that can delete backups.
- PostgreSQL, db-local: pgBackRest with a local repository in `/srv/gms/backups/pgbackrest`
  (WAL archiving for point-in-time recovery; weekly full, daily differential, keep 2 full).
- PostgreSQL, db-managed: the provider's automated backups and PITR, plus a nightly `pg_dump -Fc`
  per schema copied to the customer's backup target (independent of the provider).
- Off-server copy, within customer-controlled infrastructure, one of:
  - restic (encrypted) pushing to a restic `rest-server` on the customer's NAS in `--append-only` mode; or
  - the NAS pulls with rsync over SSH and keeps its own snapshots.
- What is copied off-server:
  - fs: `/srv/gms/storage` excluding `exports/` and `.tmp/`.
  - db-local: the pgBackRest repository. db-managed: the nightly `pg_dump` files.
  - s3: nightly `rclone copy` (never `sync`) of `files`, `public`, `documents` to the customer's backup target.
  - s3-garage: additionally `garage meta snapshot --all` output and `garage.toml`.
  - Always: compose files and Nginx config (from git), secrets from the password manager.
- Targets (proposed): RPO ≤ 15 min for the database, ≤ 24 h for files; RTO ≤ 4 h.
- Restore drill every quarter onto a fresh server, including file/DB consistency checks.
- Alert when disk usage > 80% or a backup job fails.

---

## 10. Security

- Secrets in `.env` (mode 600), never in git. Separate DB users per service.
- Redis `requirepass`; Garage keys per bucket; least privilege everywhere.
- CORS: the web app is same-origin and needs none. Only s3 buckets (browser uploads) and any
  external API consumers get an explicit allowlist.
- Managed database: TLS `verify-full`, access limited to the app server's IP or a private network.
- HMAC secrets for fs URLs (`STORAGE_URL_SECRET`) support rotation via a key ID.
- Containers run as non-root with `init: true`.
- Responses for downloads include `X-Content-Type-Options: nosniff`.

---

## 11. Docker and deployment

- Images: multi-stage builds, `node:<lts>-slim` or alpine, production dependencies only, pinned versions.
  Images are built in CI and pulled on the server — never built on the server.
- Compose files:
  - `compose.yml` — base: nginx, frontend, APIs, worker, redis, migration jobs. No `postgres`
    service and no `depends_on: postgres` (services retry the database themselves, section 4.5).
  - `compose.db-local.yml` — adds `postgres` and `depends_on: { postgres: { condition: service_healthy } }`
    for the APIs, worker and migration jobs.
  - `compose.db-managed.yml` — mounts the provider's CA bundle into services that connect to the database.
  - `compose.garage.yml` — adds `garage` (s3-garage only).
  - db-local: `docker compose -f compose.yml -f compose.db-local.yml up -d`
  - db-managed: `docker compose -f compose.yml -f compose.db-managed.yml up -d`, with managed
    connection URLs in the env files.
  - Migrations: `docker compose -f compose.yml -f compose.db-<profile>.yml run --rm migrate-<service>`.
- Every service: `restart: unless-stopped`; logging `json-file` with `max-size: 10m`, `max-file: 5`.
- Healthchecks: postgres (`pg_isready`), redis (`redis-cli ping`), APIs (`GET /readyz`),
  frontend (`GET /healthz`).
- Bind mounts only for persistent data (no named volumes), so `docker compose down -v` cannot remove data.
- Directory ownership: `chown -R 1000:1000 /srv/gms/storage` (container user `node`).

---

## 12. Observability

- Structured JSON logs (pino) with `request_id` (from Nginx `$request_id`), `user_id`, route, status,
  `duration_ms`. Same error response format across NestJS and Hono services.
- Slow queries: applications log queries slower than 200 ms (both DB profiles); db-local also
  uses PostgreSQL's slow query log at 500 ms.
- Queue metrics logged every minute: waiting count, active count, wait time p95.
- No Prometheus/Grafana stack on the 4 GB server; ship logs/metrics to a monitoring host if required.
- Alerts: performance targets (section 6), queue wait, disk > 80%, backup failure, uptime.

---

## 13. Testing

- Storage contract tests (both drivers; Garage on every commit, R2/AWS test buckets nightly):
  put/get/head/delete/list, putStream, multipart, upload/download URLs, CORS preflight, Thai filenames,
  inline vs attachment, expiry cleanup, key validation (path traversal).
- Concurrency tests: N parallel posts against the same item/location → balance correct, never negative,
  document numbers unique and gap-free; duplicate `Idempotency-Key` creates one document.
- Load tests (k6): realistic users with think time at expected peak concurrency; record p95 and CPU.
- Golden-file tests for Thai PDF rendering.
- Database portability: migrations and integration tests on PostgreSQL 16 and 18 in CI; nightly run
  against a managed test database over TLS and through a transaction-mode pooler.
- Quarterly restore drill (section 9), including a `pg_dump` restore into db-local for db-managed customers.

---

## 14. Frontend (Next.js)

- Build with `output: 'standalone'`; the image runs `node server.js` as non-root with
  `PORT=3000`, `HOSTNAME=0.0.0.0`, `mem_limit: 256m`, `--max-old-space-size=160`.
- **One image for every customer.** `NEXT_PUBLIC_*` values are inlined at build time, so they MUST NOT
  hold anything that differs per customer (domains, API URLs, feature flags). The browser calls APIs
  with relative URLs (`/api/...`). Per-customer settings are read from env on the server and passed
  to the client at runtime.
- Server-side fetching (server components, route handlers) calls APIs directly on the Docker network
  via `INTERNAL_API_URL_AUTH`, `INTERNAL_API_URL_MASTER`, `INTERNAL_API_URL_INVENTORY`, forwarding the
  user's credentials. It never loops back through the public domain.
- Next.js MUST NOT define routes under `/api/auth`, `/api/master` or `/api/inventory` (Nginx sends them
  to the APIs). Its own route handlers live under `/bff/`; health check at `/healthz`.
- Auth: tokens live in httpOnly, Secure, `SameSite=Lax` cookies set by api-auth on the shared origin —
  never in localStorage. State-changing requests also carry a CSRF token (or a required custom header).
- Rendering: SSR responses never contain unbounded lists (pagination as in section 3.5). No heavy work
  in Next.js — no PDF/Excel generation; the frontend calls API endpoints that enqueue jobs and polls them.
- Downloads: request a download URL from the API, then navigate to it (works with both storage drivers).
  Files never stream through Next.js.
- Images: `images.unoptimized: true` (images are resized at upload), avoiding the CPU/RAM cost of the
  built-in optimizer on a small server.
- No runtime calls to third parties in the default profile: `NEXT_TELEMETRY_DISABLED=1` at build and
  runtime; fonts via `next/font/local` (or `next/font/google`, which self-hosts at build time);
  no external analytics or CDN scripts unless the customer opts in.
- `/_next/static/*` is immutable; Nginx may serve it with long-lived cache headers.
- Dates display in `Asia/Bangkok` using `Intl` with locale `th-TH`.

---

## 15. Open decisions per customer

- Database profile: db-local or db-managed (provider, region, plan connection limit, pooler).
- Data residency level: (1) no third-party SaaS, (2) customer-owned infrastructure only, (3) data must
  stay in Thailand (requires a Thai data center or on-premise server).
- Retention period per document type (confirm with the customer's accounting team).
- Backup target (NAS model, location) and RPO/RTO acceptance.
- Garage (AGPL-3.0) license review if the s3-garage profile is offered.

---

## Appendix A — `@gms/storage` interface (TypeScript)

```ts
import type { Readable } from 'node:stream';

export type BucketName = 'files' | 'public' | 'documents' | 'exports';

export interface ObjectInfo {
  bucket: BucketName;
  key: string;
  size: number;
  contentType: string;
  lastModified: Date;
  etag?: string;
}

export interface PutOptions {
  contentType: string;
  contentLength?: number;
  /** hex sha256; verified when provided */
  sha256?: string;
}

export interface StoredObject extends ObjectInfo {
  sha256: string;
}

export interface UploadUrlOptions {
  userId: string;
  contentType: string;
  maxBytes: number;          // default 20 MB
  expiresInSec?: number;     // default 900, max 900
}

export interface UploadTarget {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface DownloadUrlOptions {
  userId: string;
  /** display name, may contain Thai; sent via RFC 5987 */
  filename: string;
  disposition?: 'attachment' | 'inline';   // default 'attachment'
  expiresInSec?: number;                   // default 900, max 900
}

export interface ListResult {
  items: ObjectInfo[];
  nextCursor?: string;
}

export interface StorageDriver {
  put(bucket: BucketName, key: string, body: Uint8Array, opts: PutOptions): Promise<StoredObject>;
  /** streams to storage without buffering; computes sha256 and size on the fly */
  putStream(bucket: BucketName, key: string, body: Readable, opts: PutOptions): Promise<StoredObject>;
  get(bucket: BucketName, key: string): Promise<Readable>;
  head(bucket: BucketName, key: string): Promise<ObjectInfo | null>;
  delete(bucket: BucketName, key: string): Promise<void>;
  list(bucket: BucketName, prefix: string, opts?: { cursor?: string; limit?: number }): Promise<ListResult>;
  createUploadUrl(bucket: BucketName, key: string, opts: UploadUrlOptions): Promise<UploadTarget>;
  createDownloadUrl(bucket: BucketName, key: string, opts: DownloadUrlOptions): Promise<string>;
}

export interface KeyParts {
  service: string;
  kind: 'upload' | 'document' | 'export';
  entity?: string;      // uploads
  docType?: string;     // documents
  docNo?: string;       // documents
  reportType?: string;  // exports
  jobId?: string;       // exports
  ext: string;
  date?: Date;          // defaults to now
}

/** Builds a key in the format of section 8.3 and validates it. */
export declare function buildKey(parts: KeyParts): string;

/** Throws on '..', leading '/', characters outside [a-z0-9/_.-] or length > 512. */
export declare function assertSafeKey(key: string): void;

export declare function createStorage(env: NodeJS.ProcessEnv): StorageDriver;
```

---

## Appendix B — `stored_files` migration

Each service creates this table in its own schema (example: `inventory`).

```sql
CREATE TABLE inventory.stored_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- app supplies UUIDv7
  kind          text NOT NULL CHECK (kind IN ('upload', 'document', 'export')),
  bucket        text NOT NULL CHECK (bucket IN ('files', 'public', 'documents', 'exports')),
  object_key    text NOT NULL,
  filename      text NOT NULL,                 -- display name (may be Thai)
  content_type  text NOT NULL,
  size_bytes    bigint,
  sha256        char(64),
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'ready', 'failed', 'expired', 'deleted')),
  source_type   text,                          -- e.g. 'goods_receipt', 'report:sales_monthly'
  source_id     text,
  params_hash   char(64),                      -- exports: sha256 of normalized params
  job_id        text,
  error         text,
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  ready_at      timestamptz,
  expires_at    timestamptz,                   -- exports only
  deleted_at    timestamptz,
  purge_after   timestamptz,
  UNIQUE (bucket, object_key)
);

CREATE INDEX stored_files_source_idx  ON inventory.stored_files (source_type, source_id);
CREATE INDEX stored_files_reuse_idx   ON inventory.stored_files (source_type, params_hash)
  WHERE kind = 'export' AND status = 'ready';
CREATE INDEX stored_files_expiry_idx  ON inventory.stored_files (expires_at)
  WHERE kind = 'export' AND status IN ('pending', 'ready', 'failed');
CREATE INDEX stored_files_purge_idx   ON inventory.stored_files (purge_after)
  WHERE deleted_at IS NOT NULL;
CREATE INDEX stored_files_user_idx    ON inventory.stored_files (created_by, created_at DESC);
```

---

## Appendix C — Environment variables

Database (every API service and the worker):

| Variable | db-local | db-managed |
|---|---|---|
| `DATABASE_URL` | `postgres://gms_inventory_app:…@postgres:5432/gms` | provider host, app role |
| `DATABASE_URL_REPORTS` | read-only role on `postgres` | provider host, read-only role |
| `DATABASE_URL_MIGRATIONS` | schema owner on `postgres` (migration job only) | provider host, schema owner |
| `DB_SSL` | `off` | `verify-full` |
| `DB_SSL_CA_FILE` | — | `/run/secrets/db-ca.pem` |
| `DB_POOL_MAX` | per section 3.3 | within the provider's connection limit |

Frontend:

| Variable | Example / note |
|---|---|
| `INTERNAL_API_URL_AUTH` | `http://api-auth:3000` |
| `INTERNAL_API_URL_MASTER` | `http://api-master:3000` |
| `INTERNAL_API_URL_INVENTORY` | `http://api-inventory:3000` |
| `NEXT_TELEMETRY_DISABLED` | `1` |

Storage:

| Variable | Driver | Example / note |
|---|---|---|
| `STORAGE_DRIVER` | all | `fs` (default) or `s3` |
| `STORAGE_FS_ROOT` | fs | `/srv/gms/storage` |
| `STORAGE_URL_SECRET` | fs | HMAC secret; `STORAGE_URL_SECRET_KID` for rotation |
| `STORAGE_PUBLIC_BASE_URL` | all | fs: `/public`; s3: CDN/custom domain |
| `STORAGE_UPLOAD_MAX_BYTES` | all | `20971520` |
| `STORAGE_EXPORT_TTL_DAYS` | all | `7` |
| `S3_ENDPOINT_INTERNAL` | s3 | see section 8.2 |
| `S3_ENDPOINT_PUBLIC` | s3 | see section 8.2 |
| `S3_REGION` | s3 | see section 8.2 |
| `S3_FORCE_PATH_STYLE` | s3 | `true` / `false` |
| `S3_CHECKSUM_MODE` | s3 | empty or `WHEN_REQUIRED` |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | s3 | least privilege |
| `S3_BUCKET_FILES`, `S3_BUCKET_PUBLIC`, `S3_BUCKET_DOCUMENTS`, `S3_BUCKET_EXPORTS` | s3 | physical bucket names |

---

## Appendix D — Nginx and compose excerpts

```nginx
# Protected files (fs driver): reachable only via X-Accel-Redirect from an API
location /_storage/ {
    internal;
    alias /srv/gms/storage/;
    add_header X-Content-Type-Options nosniff;
}

# Public files (fs driver): fully static
location /public/ {
    alias /srv/gms/storage/public/;
    expires 30d;
}

# Upload endpoints: stream the body to the API (one block per service)
location /api/inventory/storage/upload {
    client_max_body_size 25m;
    proxy_request_buffering off;
    proxy_set_header X-Request-Id $request_id;
    proxy_pass http://api-inventory:3000;
}
```

```nginx
# Routing: APIs by prefix, everything else to the frontend
location /api/auth/      { proxy_pass http://api-auth:3000;      proxy_set_header X-Request-Id $request_id; }
location /api/master/    { proxy_pass http://api-master:3000;    proxy_set_header X-Request-Id $request_id; }
location /api/inventory/ { proxy_pass http://api-inventory:3000; proxy_set_header X-Request-Id $request_id; }
location /_next/static/  { proxy_pass http://frontend:3000; expires 365d; add_header Cache-Control "public, immutable"; }
location /               { proxy_pass http://frontend:3000;      proxy_set_header X-Request-Id $request_id; }
```

`compose.yml` (base — no database container):

```yaml
x-logging: &default-logging
  driver: json-file
  options: { max-size: "10m", max-file: "5" }

services:
  frontend:
    image: registry.example.com/gms/frontend:1.0.0
    mem_limit: 256m
    init: true
    logging: *default-logging
    env_file: .env
    environment:
      NODE_OPTIONS: --max-old-space-size=160
      NEXT_TELEMETRY_DISABLED: "1"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
    restart: unless-stopped

  api-inventory:
    image: registry.example.com/gms/api-inventory:1.0.0
    mem_limit: 256m
    init: true
    logging: *default-logging
    env_file: .env.inventory          # DATABASE_URL*, DB_SSL*, DB_POOL_MAX, STORAGE_*
    environment:
      NODE_OPTIONS: --max-old-space-size=192
    volumes:
      - /srv/gms/storage:/srv/gms/storage
    restart: unless-stopped

  migrate-inventory:
    image: registry.example.com/gms/api-inventory:1.0.0
    command: ["node", "dist/migrate.js"]
    env_file: .env.inventory
    profiles: ["migrate"]               # run with: docker compose run --rm migrate-inventory

  worker:
    image: registry.example.com/gms/worker:1.0.0
    mem_limit: 512m
    cpus: 1.0
    init: true
    logging: *default-logging
    environment:
      NODE_OPTIONS: --max-old-space-size=384
    volumes:
      - /srv/gms/storage:/srv/gms/storage
    restart: unless-stopped

  nginx:
    image: nginx:<pinned-stable>-alpine
    mem_limit: 32m
    logging: *default-logging
    ports: ["80:80", "443:443"]
    volumes:
      - /srv/gms/storage:/srv/gms/storage:ro
    restart: unless-stopped
```

`compose.db-local.yml` (added only for db-local):

```yaml
services:
  postgres:
    image: postgres:18                  # pin the minor version
    mem_limit: 1024m
    shm_size: 256mb
    volumes:
      - /srv/gms/postgres:/var/lib/postgresql
      - ./postgres/postgresql.conf:/etc/postgresql/postgresql.conf:ro
    command: ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
    restart: unless-stopped

  api-inventory:
    depends_on: { postgres: { condition: service_healthy } }
  migrate-inventory:
    depends_on: { postgres: { condition: service_healthy } }
  worker:
    depends_on: { postgres: { condition: service_healthy } }
```

`compose.db-managed.yml` (added only for db-managed — mounts the provider's CA bundle):

```yaml
services:
  api-inventory:
    volumes: ["/srv/gms/secrets/db-ca.pem:/run/secrets/db-ca.pem:ro"]
  migrate-inventory:
    volumes: ["/srv/gms/secrets/db-ca.pem:/run/secrets/db-ca.pem:ro"]
  worker:
    volumes: ["/srv/gms/secrets/db-ca.pem:/run/secrets/db-ca.pem:ro"]
```

`compose.garage.yml` (s3-garage only):

```yaml
services:
  garage:
    image: dxflrs/garage:<pinned-v2.x.y>
    mem_limit: 192m
    volumes:
      - /srv/gms/garage:/var/lib/garage
      - ./garage/garage.toml:/etc/garage.toml:ro
    restart: unless-stopped
```

Other API services (api-auth, api-master) follow the api-inventory pattern with their own env file,
migration job and override entries.

---

## Appendix E — Stock posting and document numbers (SQL)

Validated on PostgreSQL 16 (NULL-lot uniqueness, negative-stock guard, gap-free counter on rollback).

```sql
CREATE TABLE inventory.stock_balances (
  item_id     uuid          NOT NULL,
  location_id uuid          NOT NULL,
  lot_id      uuid,                                   -- NULL = not lot-tracked
  qty         numeric(18,4) NOT NULL DEFAULT 0 CHECK (qty >= 0),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  -- NULLS NOT DISTINCT (PostgreSQL 15+): one row per item/location when lot_id is NULL
  CONSTRAINT stock_balances_uq UNIQUE NULLS NOT DISTINCT (item_id, location_id, lot_id)
);

CREATE TABLE inventory.doc_counters (
  doc_type text   NOT NULL,
  period   text   NOT NULL,      -- e.g. '2026-10'
  last_no  bigint NOT NULL,
  PRIMARY KEY (doc_type, period)
);
```

```sql
-- Inside one transaction. $1..$4 are arrays of aggregated lines
-- (one entry per item/location/lot; duplicates merged in application code).

-- 1. Ensure balance rows exist (receipts)
INSERT INTO inventory.stock_balances (item_id, location_id, lot_id, qty)
SELECT l.item_id, l.location_id, l.lot_id, 0
FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS l(item_id, location_id, lot_id)
ON CONFLICT ON CONSTRAINT stock_balances_uq DO NOTHING;

-- 2. Lock rows in a stable order (prevents deadlocks between concurrent postings)
SELECT 1
FROM inventory.stock_balances b
JOIN unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS l(item_id, location_id, lot_id)
  ON b.item_id = l.item_id AND b.location_id = l.location_id
 AND b.lot_id IS NOT DISTINCT FROM l.lot_id
ORDER BY b.item_id, b.location_id, b.lot_id
FOR UPDATE OF b;

-- 3. Apply deltas with a negative-stock guard
UPDATE inventory.stock_balances b
SET qty = b.qty + l.delta, updated_at = now()
FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::numeric[])
     AS l(item_id, location_id, lot_id, delta)
WHERE b.item_id = l.item_id AND b.location_id = l.location_id
  AND b.lot_id IS NOT DISTINCT FROM l.lot_id
  AND b.qty + l.delta >= 0
RETURNING b.item_id, b.location_id, b.lot_id;
-- If fewer rows return than lines sent: ROLLBACK and report the missing lines.

-- 4. Insert movements in one statement (multi-row insert or INSERT ... SELECT FROM unnest(...)).
```

```sql
-- Gap-free document number, inside the posting transaction
INSERT INTO inventory.doc_counters (doc_type, period, last_no)
VALUES ($1, $2, 1)
ON CONFLICT (doc_type, period)
DO UPDATE SET last_no = inventory.doc_counters.last_no + 1
RETURNING last_no;
```

```sql
-- Idempotency
CREATE TABLE inventory.idempotency_keys (
  user_id         uuid        NOT NULL,
  key             text        NOT NULL,
  endpoint        text        NOT NULL,
  request_hash    char(64)    NOT NULL,
  response_status int,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
```

---

## Appendix F — Skill mapping

How this spec splits across skills. Each skill MUST also follow the shared rules marked "All".

| Section | Infra | Backend | Frontend |
|---|---|---|---|
| 1 Context, profiles | ✓ | ✓ | ✓ |
| 2.1 Containers and routing | ✓ (Nginx, compose) | ✓ (service boundaries) | ✓ (same-origin, route prefixes) |
| 2.2 Data ownership | — | ✓ | — |
| 3.1–3.4 Server, memory, PostgreSQL/Redis settings | ✓ | memory flags only | memory flags only |
| 3.5 Coding rules that protect memory | — | ✓ | ✓ (pagination, no heavy work) |
| 4.1–4.4 Database rules (stock, numbers, idempotency) | — | ✓ | — |
| 4.5 Connecting to local or managed PostgreSQL | env files, CA bundle | ✓ | — |
| 4.6 Portable PostgreSQL subset | provisioning script | ✓ | — |
| 4.7 Operating PostgreSQL per profile | ✓ | — | — |
| 5 Heavy work, queues, exports/imports | worker limits | ✓ | job status UI |
| 6 Performance targets | alerts | ✓ | ✓ (perceived speed, no unbounded SSR) |
| 7 Authentication | login rate limit | ✓ | cookies, CSRF |
| 8 File storage | buckets, Nginx, Garage | ✓ (`@gms/storage`) | upload/download flow |
| 9 Backup and restore | ✓ | soft-delete rules | — |
| 10 Security | ✓ | ✓ | ✓ |
| 11 Docker and deployment | ✓ | Dockerfiles, health endpoints | Dockerfile (standalone) |
| 12 Observability | ✓ | ✓ (logging, query timing) | request IDs |
| 13 Testing | restore drills | ✓ | — |
| 14 Frontend (Next.js) | Nginx caching | — | ✓ |
| 15 Open decisions | ✓ | — | — |
| Appendices A, B, E | — | ✓ | — |
| Appendices C, D | ✓ | env contract | env contract |
