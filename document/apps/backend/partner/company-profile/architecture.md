# Architecture: company-profile (SA 2, approved)

**Current implementation remains the approved named-volume behavior below.** Proposed [GMS file-storage SA revision 3](../../../../reviews/sa/2026-10-21-gms-file-storage-rev3.md) would migrate the logo to `@gms/storage` under the platform-wide indefinite upload-retention policy; pending owner approval.

> **Revision 2:** the logo is a file under the partner working directory `storage/company-profile/logo`, overwritten on upload (temp + rename under the profile row lock), deleted on removal. Production: named volume `partner-storage` at `/app/backend-api-partner/storage` ([infra bundle 2](../../../../infra/services/backend-api-partner/2/security.md)); the Dockerfile creates the folder owned by uid 1000; dev: git-ignored repo folder. Backups must include the volume. Compose, Dockerfile, `.gitignore`, `.dockerignore` change (the 'No … volume' statement below is superseded).

Decisions: [decisions.md](decisions.md) · ADR: [ADR-0021](../../../../adr/0021-company-profile-in-partner-service.md)

## Boundaries

- **Partner** (`backend-api-partner`) owns the data: new module `company-profile`, schema `partner` tables `company_profile` and `company_logo`. It reuses `common/reference-data.ts` for currency/country membership and options, `internal-auth` (service token + actor), `common/errors.ts`, `persistence.ts`.
- **Gateway** owns browser access: tRPC router `companyProfile`, a REST controller for the logo, session + permission checks, and Zod validation (shared shapes in a new `company-profile-schemas.ts`).
- **Auth** is unchanged: it already provides session context and the `company-profile` catalog leaf.
- **Frontend**: tRPC hooks and the logo upload/GET via `/api/v1` (FE-CP-009/010); FE-CP-007 changes the editor value to JSON.

## Files that change

| Workspace | Files |
|---|---|
| partner | `prisma/schema.prisma` (2 models), `prisma/migrations/<ts>_company_profile/migration.sql` (+ CHECKs), `src/company-profile/{company-profile.controller,company-profile.service,company-profile.schemas,company-profile.errors,rich-text}.ts`, `src/app.module.ts` (register module), `src/main.ts` (route-specific `express.raw` for `/internal/v1/company-profile/logo`, 10 MB, before the JSON parser) |
| gateway | `src/trpc/company-profile-schemas.ts` (new), `src/trpc/router.ts` (`companyProfile` router), `src/company-profile-logo.controller.ts` (new REST GET/PUT), `src/request-context.ts` (extract the existing cookie → session/authz resolution from `main.ts` so REST and tRPC share it), `src/trpc/partner-client.ts` (binary GET/PUT helper), `src/app.module.ts` |
| frontend | `features/company-profile/{api,hooks}.ts`, page wiring, `rich-text-field.tsx` value as JSON, `schema.ts` rich-text length from JSON |

No new package, container, network, volume or environment variable. Compose and Dockerfiles are unchanged (no infra/devops routing).

## Behaviour

- Get returns `null` until the first save. Save is a whole replacement of the fields with optimistic `version`.
- Rich text: gateway and partner both parse with the strict schema (defence in depth); partner computes the plain-text length.
- Logo: gateway streams the request body with a byte counter (abort at 10 MB + 1 → 413) and forwards it as a buffer of at most 10 MB to partner; partner checks signature/type, hashes, and upserts in one transaction with the version check. GET responses are immutable per version.
- Actor id is stored as `updated_by` (no cross-schema FK, ADR-0018).

## Capacity (4 GB / 2 vCPU host)

- Memory per upload ≈ 2 × file size across gateway and partner (≤ 20 MB transient). Uploads are rare admin actions; concurrency is bounded by admins. Partner container limit is 384 MiB since ADR-0024 (2026-10-19; was 512 MiB); a 10 MB upload still fits.
- One extra DB row ≤ 10 MB; logo GET is cached by the browser for a year per version, so it is read from the DB about once per browser per change.
- No background jobs, caches or new connections.

## Rollout

Additive migration (runs with the partner `db:migrate` on start in dev). Old frontend builds are unaffected. Rollback: revert code and drop the two tables.
