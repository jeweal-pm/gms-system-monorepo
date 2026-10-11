# Login screen and local demo users

## Completed

- Updated the login form to match the supplied reference: English labels, two demo-account information cards, labeled gray inputs, remember-device checkbox, blue forgot-password link, password visibility control, and teal Log in button.
- Prefilled the Super Admin demo account in development. The account cards and demo credentials are hidden from production builds.
- Added an idempotent auth database seed for `superadmin@demo.com` (admin role) and `user@demo.com` (user role). Both accounts use the requested test password. The seed refuses to run unless `NODE_ENV=development`.
- Kept the existing Better Auth password hashing and the production login behavior.

## Verification

- Frontend typecheck and production build passed after implementation.
- Auth service typecheck and build passed after adding the seed.
- Ran the development seed successfully; both local sign-in requests returned the corresponding account.
- Captured the login page in Chrome at the reference viewport. The manual customer report is in `document/testing/user-check/2026-10-05-login-screen.md`.

## Run the local seed again

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T backend-api-auth pnpm --filter @gem-crm/backend-api-auth db:seed
```
