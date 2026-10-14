# Backend dependency decisions: auth + gateway / user-permission

- Source UI revision / SA revision: 1 / 1 (pending-review)
- Central ledger: [tech-stack.md](../../../../adr/tech-stack.md) (parent integrates the rows below; SA did not edit it)
- Frontend dependencies: [frontend dependencies.md](../../../frontend/user-permission/dependencies.md) (DEP-UP-01/02 remain frontend-only proposals)

**No new backend package is proposed.** Everything uses packages already installed in the checkout
(verified in the manifests and `pnpm-lock.yaml` on 2026-10-12):

| Need | Installed package (version) | Workspace |
|---|---|---|
| Input validation | `zod` 4.4.3 (`^4.4.3`) | auth, gateway |
| Password hash | `argon2` ^0.44.0 (Argon2id) | auth |
| Persistence/migration | `@prisma/client`, `@prisma/adapter-pg`, `prisma` 7.10.0; `pg` ^8.16.3 | auth |
| Session/sign-in hook, `additionalFields` | `better-auth` 1.7.7 | auth |
| tRPC procedures/middleware/errorFormatter | `@trpc/server` 11.19.0 | gateway |
| JSON body limit per route | `express` 5.2.1 (`express.json`) | auth |
| Logging/redaction | `nestjs-pino` 5.3.1, `pino` ^10 | auth, gateway |
| SHA-256, base64, UUID | Node 24 `node:crypto`, `Buffer` | auth |

| Package / workspace | Status | Purpose / TODO IDs | Official compatibility evidence | Alternatives | Host CPU/RAM impact | ADR | Approval | Installed version |
|---|---|---|---|---|---|---|---|---|
| `exceljs` (backend) | rejected for this revision | real .xlsx export (SA-UP-07) | not evaluated further | **CSV with BOM (chosen)**: opens in Excel, no dependency | would add a library and memory per export | none | n/a | not installed |
| `sharp` (backend) | rejected for this revision | server-side image re-encode/resize (SA-UP-06) | native binary; adds an image build step | **client canvas resize + server magic-byte/size check (chosen)** | native memory spikes per decode | none | n/a | not installed |
| `multer` direct use / `@nestjs/platform-express` `FileInterceptor` | not proposed | multipart upload | `multer@2.4.0` exists only as a transitive dependency of `@nestjs/platform-express` | **base64 inside a bounded tRPC mutation (chosen)**: no multipart forwarder in gateway | none | none | n/a | transitive only |
| `libphonenumber-js` (backend) | not proposed | per-country phone validation (Q-UP-09) | see frontend DEP-UP-01 | **server checks the E.164 shape + ISO country only (chosen)**; frontend may validate per country if DEP-UP-01 is approved | none | none | n/a | not installed |
| Better Auth `admin` / `username` plugins | not proposed | ban/role/username features | part of the installed `better-auth` 1.7.7 | own `active` field + hook (chosen); username rejected (C-05) | none | ADR-0017 | n/a | n/a |

No worker, queue, cache service or container is added. Runtime cost is in
[architecture.md](architecture.md#capacity-and-rollout).

### Ledger rows for the parent to add to `tech-stack.md`

| Package / workspace | Status | Purpose / feature / revision | Official evidence / alternatives | Bundle / host cost | ADR / review bundle | Owner approval evidence | Installed version |
|---|---|---|---|---|---|---|---|
| none (backend) for `user-permission` SA revision 1 | proposed (no new package) | Users, permissions, photo (PostgreSQL bytea), CSV export use the installed zod, argon2, Prisma 7.10, better-auth 1.7.7, @trpc/server 11.19.0, express 5.2.1 | Rejected for this revision: `exceljs` (CSV instead), `sharp` (client resize), direct `multer` (base64 tRPC), backend `libphonenumber-js` (E.164 shape check) | No container; +1 indexed query per tRPC request; photos ≤ 512 KiB each in PostgreSQL | [ADR-0016](../../../../adr/0016-per-user-menu-action-permissions.md), [ADR-0017](../../../../adr/0017-super-admin-managed-users.md), [bundle](architecture.md) | none | n/a |
