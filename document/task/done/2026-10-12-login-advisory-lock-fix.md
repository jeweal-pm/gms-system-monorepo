# Login failed after password check (advisory lock query)

## Authorization

- User instruction on 2026-10-12: "backend แก้บั๊ก login", then selected fixing on branch `dev` (base `db133ee`).
- Backend role applied inline from its skill definition; custom agents were unavailable in the session.
- Corrective pass 1 of 3; resolved in this pass.

## Cause

Every email sign-in returned HTTP 500 after the password was accepted. `retainOnlyNewestSession`
ran `SELECT pg_advisory_xact_lock(...)` through `$queryRaw`. The function returns `void`, and the
Prisma 7.10 pg adapter cannot deserialize that column (`P2010`, `UnsupportedNativeDataType`).

## Change

- `backend-api-auth/src/auth/auth.ts`: the lock statement now uses `$executeRaw`, which does not
  read result columns. Lock scope and session-deletion behavior are unchanged.

## Verification (Docker dev stack)

- Sign-in through the frontend auth proxy returned 200, `get-session` returned the session, and Home returned 200.
- A second sign-in left exactly one session row for the user, so the newest-session rule still applies.
- No auth service errors were logged after the change.
- Not run: browser UI sign-in, typecheck, and automated tests.
