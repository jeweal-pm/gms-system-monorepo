# Account menu and Docker development workflow

## Completed

- Added a rounded account menu to the home header. It shows the signed-in name and email and signs out through Better Auth. The menu closes when clicking outside or pressing Escape.
- Added a Docker development Compose override with bind-mounted source and persistent dependency volumes. Frontend uses Next.js dev mode, and Nest services use watch mode.
- Added root commands for starting, building, refreshing dependencies, viewing logs, and stopping the development stack.
- Documented the workflow in the root README. The development containers inherit the service resource limits from the base Compose file.

## Verification

- Frontend typecheck and production build passed.
- Compose configuration loaded successfully, and the development stack ran without rebuilding after its initial image build.
- Checked the account menu, sign-out redirect, and signed-out redirect to login in Chrome. Details are in `document/testing/user-check/2026-10-04-logout-menu.md`.

## Daily use

```powershell
pnpm docker:dev
pnpm docker:dev:logs
pnpm docker:dev:down
```

Run `pnpm docker:dev:build` after changing the development Dockerfile. Run `pnpm docker:dev:install` after changing workspace dependencies.
