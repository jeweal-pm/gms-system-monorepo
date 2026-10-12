# TODO: remove-forgot-password-email

- Revision: 1
- Status: done
- Source: [ADR-0015](../../adr/0015-remove-forgot-password-and-email.md) revision 1; UI revision none (removal only); SA revision 1
- Approval evidence: 2026-10-12, user instructed implementation: "นี่ยังไม่เริ่มทำใช่ไหมถ้ายังเริ่มทำได้เลย"
- Branch: `12-10-26-change-flow-login` (user-created from `dev`)
- Contracts: [API Contract §1, §3](../../spec/0001-api-contract.md), [Login Flow](../../diagram/login-flow.md), [Login Requirements](../../spec/0002-login-requirements.md)
- Roles: SA, backend, frontend, infra and devops applied inline in the parent session; no subagent ran

## Items

| ID | Owner | Allowed paths | Work | Status |
|---|---|---|---|---|
| BE-RFP-001 | backend | `backend-api-auth/src/auth/**`, `backend-api-auth/src/app.module.ts` | `POST /api/v1/users` requires `password` (policy 4–64); remove generated password and email step | done |
| BE-RFP-002 | backend | `backend-api-auth/src/auth/**`, `backend-api-gateway/src/app.controller.ts` | Remove forgot-password route/service/rate limit; disable Better Auth `/request-password-reset`, `/reset-password` | done |
| BE-RFP-003 | backend | `backend-api-auth/src/email/**`, `backend-api-auth/package.json`, `pnpm-lock.yaml` | Delete `EmailService`; remove `nodemailer`, `@types/nodemailer` | done |
| BE-RFP-004 | backend | `backend-api-auth/prisma/**` | Drop `auth.ForgotPasswordAttempt` via migration `20261012000000_remove_forgot_password` | done |
| FE-RFP-001 | frontend | `frontend/src/app/forgot-password/**`, `frontend/src/features/auth/**` | Delete page/form/schema; remove the Login link with no replacement text (user follow-up 2026-10-12) | done |
| INF-RFP-001 | infra | `docker-compose.yml`, `.env.example`, `package.json`, `README.md` | Remove Mailpit service, `SMTP_*` env and auth dependency | done |
| OPS-RFP-001 | devops | `.github/**`, `document/devops/**` | Remove SMTP variables if present — none in workflows; docs updated | done |

## Acceptance

All checks in [ADR-0015 Acceptance](../../adr/0015-remove-forgot-password-and-email.md#acceptance-and-approval).
Evidence: [completion report](../done/2026-10-12-remove-forgot-password-email.md).
