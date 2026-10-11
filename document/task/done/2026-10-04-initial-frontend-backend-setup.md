# Initial frontend/backend setup

> **Status update (2026-10-09):** Q1 (credential delivery by email) and Q7 (three failures, one-minute lock) are now specified and implemented. Product confirmed that generated passwords do not expire and password changes require the current password. No analytics/tracking is planned now; privacy ownership details remain for production. See [`open-questions.md`](../../open-questions.md) and [`2026-10-09-password-provisioning-login-lockout.md`](2026-10-09-password-provisioning-login-lockout.md). The historical notes below describe the initial setup as of 2026-10-04.

- **Date:** 2026-10-04
- **Status:** Built and statically verified; full runtime verification awaits Docker/PostgreSQL startup
- **Architecture:** Accepted Microservices monorepo, with a Next.js frontend, NestJS gateway, and NestJS auth service

## Delivered

- Login and forgot-password screens follow the supplied compact layout. Successful sign-in redirects to the GMS home screen.
- Home has a GMS sidebar, top bar, shortcut groups, and navigation placeholders for modules whose workflows are not yet specified.
- Better Auth email/password sessions use HttpOnly cookies. The auth service uses Argon2id and Prisma migrations in the `auth` PostgreSQL schema.
- Gateway serves typed tRPC procedures for the protected dashboard and forwards CRM provisioning, forgot-password, and profile password requests to the auth service.
- CRM user provisioning requires `X-API-Key`, accepts a Super Admin, does not return the generated password, and validates the API input. Login/forgot requests use persistent database rate limits.
- SMTP configuration is included. Local development uses Mailpit at `http://localhost:8025` so generated account emails can be inspected without sending real mail.
- Docker Compose defines PostgreSQL 18.6, Mailpit, frontend, gateway, and auth services. The auth container applies committed Prisma migrations before serving traffic.
- Production target is 8 GB RAM / 4 vCPUs. Compose limits the current stack to 3 vCPUs / 5.25 GiB combined, leaving host headroom for the OS and Docker; review actual workload measurements before scaling.
- Stack and task documentation now use the accepted Microservices ADR and align Better Auth, tRPC, Prisma, and the actual workspace layout.

## Local startup

Run these commands from the repository root in PowerShell:

```powershell
Copy-Item .env.example .env
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`. To create the first Super Admin after startup:

```powershell
$body = @{ email = "admin@example.com"; name = "GMS Admin"; role = "SUPER_ADMIN" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:4000/api/v1/users" -ContentType "application/json" -Headers @{ "X-API-Key" = "local-development-crm-key-change-before-deploy" } -Body $body
```

Open Mailpit at `http://localhost:8025` and use the generated password from that inbox to sign in. For an all-container run, use `docker compose up --build -d`; that path applies migrations automatically.

## Verification

- `pnpm lint` — passed.
- `pnpm typecheck` — passed.
- `pnpm build` — passed for frontend, gateway, and auth service.
- `docker compose config --quiet` — passed.
- `pnpm db:migrate` — passed from Windows after correcting Prisma's workspace `.env` path and using `127.0.0.1` for the host PostgreSQL URL.
- `pnpm dev` — passed; frontend, gateway, and auth started from the documented host workflow. Both readiness routes and all three pages returned 200.
- HTTP smoke check — `/login` and `/forgot-password` both returned 200 and contained their expected headings.
- `prisma validate` and Prisma Client generation — passed; initial migration was generated from the committed schema.
- `docker compose up --build -d` — passed; PostgreSQL, Mailpit, auth, gateway, and frontend containers started. All 5 configured service limits were applied.
- PostgreSQL initial migration — passed; auth tables were created in the `auth` schema and migration history recorded in `public`.
- Startup fixes found during runtime checks: the initial migration now qualifies its `auth` tables explicitly; the auth image includes OpenSSL; auth declares its direct `express` dependency; and Prisma config resolves the root `.env` correctly from its workspace.
- Runtime health checks — auth and gateway `/health/ready` both returned 200; login, forgot-password, and home pages returned 200.
- Provisioned a temporary Super Admin through the gateway, received the generated credential in Mailpit, signed in through the frontend auth proxy, read the session, and loaded the protected dashboard procedure — passed.
- Submitted forgot-password through the frontend proxy, received the reset credential in Mailpit, and signed in with it — passed. The temporary test account was deleted afterward.
- Chrome UI flow — login redirected to Home; forgot-password showed confirmation, delivered a reset credential, and the replacement password signed in successfully. Desktop screenshots are saved under `document/testing/user-check/artifacts/`.
- Mobile Home at 390×844 — loaded with no horizontal overflow. Keyboard-only behavior, sign-out, and password-change page remain untested.
- Visual comparison found one reference mismatch: the supplied Home image says 38 shortcuts while the current menu data contains 33; the five additional labels are not present in the written docs or visible image area, so they remain to be confirmed.
- See `document/testing/user-check/2026-10-04-initial-setup.md` for the customer report and screenshots.

## Decisions and remaining production setup

- **Q1 (initial credential delivery):** the current code sends generated passwords by SMTP, with Mailpit in local development. The user has been asked to confirm this channel; update the implementation if another channel is selected.
- **Q7 (account lockout threshold):** the source documents leave this open; this setup does not implement a separate temporary account lockout policy. Better Auth logs that the current container path cannot identify the client IP and falls back to a shared per-path sign-in bucket. Forgot-password applies five requests per email plus thirty per observed gateway peer per minute. Before production, define the ingress and have it overwrite a trusted client-IP header; configure the auth service against that trusted proxy.
- Cookie consent ADR-0009 remains Proposed and requires DPO review. No analytics or marketing scripts are loaded in this initial setup.
- Domain screens beyond authentication and the initial shortcut shell remain navigation placeholders because the supplied docs do not define their workflows.
- Before deployment outside localhost, replace `AUTH_SECRET`, `CRM_API_KEY`, database credentials, and SMTP settings with managed secrets; configure HTTPS, backups, deployment topology, and monitoring.
- Configure ingress to sanitize and set the client-IP header used for per-client rate limits. Better Auth specifically warns that forwarded IP headers must come from a trusted proxy; accepting client-supplied `X-Forwarded-For` can let users spoof the limit key.
- A real Super Admin has not been provisioned because no production user email was supplied. Use the documented CRM provisioning endpoint after startup.
