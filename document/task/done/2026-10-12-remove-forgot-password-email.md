# Remove forgot password and email (ADR-0015)

## Authorization

- ADR-0015 revision 1 written at the user's request, then implemented on the user's instruction
  "นี่ยังไม่เริ่มทำใช่ไหมถ้ายังเริ่มทำได้เลย" (2026-10-12). ADR-0010 is now superseded.
- Branch `12-10-26-change-flow-login`, created by the user from `dev`. Not committed.
- SA, backend, frontend, infra and devops roles were applied inline in one session; no subagent ran.

## Completed

- CRM provisioning now requires `password` (4–64 characters). Missing password returns
  `400 VALIDATION_ERROR`; a policy failure returns `400 PASSWORD_POLICY_VIOLATION`. The system no
  longer generates or emails passwords.
- Forgot password removed: gateway and auth routes, service logic, its rate-limit table, the
  frontend page/form/schema, and the Login link. Per the user's follow-up, the Login page shows
  no replacement text.
  Better Auth `/request-password-reset` and `/reset-password` are disabled.
- Email removed: `EmailService`, `nodemailer`, `@types/nodemailer`, `SMTP_*` variables and the Mailpit service.
- Migration `20261012000000_remove_forgot_password` drops `auth.ForgotPasswordAttempt`.
- Updated API contract, login flow, login requirements, password policy, test cases, tech stack,
  backend architecture, infra/devops service indexes, glossary, open questions and README.

## Verification (Docker dev stack)

- Typecheck passed for auth, gateway and frontend; lint passed with two existing `useEffect` warnings in `login-form.tsx`.
- Migration applied on the existing database; auth started without SMTP variables or Mailpit.
- Create user with password → 201 without password in the response, and that password signs in.
- Missing password → 400 `VALIDATION_ERROR`; `abc` → 400 `PASSWORD_POLICY_VIOLATION`; neither created a user.
- Forgot-password API via gateway and auth, Better Auth reset endpoints, and `/forgot-password` all return 404.
- Login page has no forgot-password link or text; demo login still works.
- The test password did not appear in auth, gateway or frontend logs. The temporary test user was deleted.
- Not run: browser UI check, profile password change, lockout regression, production image build.

## Remaining decisions

- Agree with the CRM team on sending `password` over HTTPS without logging it before deploying.
- Users who forget their password have no recovery path; an admin reset tool needs its own ADR.
