# Focused sec-auditor review: GMS access JWT/JWKS slice

- Feature/TODO: `gms-platform-migration`, GP-AUTH-01/03 partial
- Source: `44d5eb9` plus SHA-256 manifest of changed auth source/tests `06BD3751A2113D5290E88F11044B6B51BF2559CA08D51218FC46A1F83454C553`
- Scope: `backend-api-auth/src/auth/auth.ts`, `access-token.ts`, and `backend-api-auth/test/auth/access-token*.test.ts`; Better Auth mount in `src/main.ts` inspected as affected entry point
- Mode: Cloudflare-derived focused changed-code guidance, read-only; **not** a full audit
- Execution: parent applied the sec-auditor skill sequentially because the scoped backend/infra agents hit their usage limit; no independent sec-auditor agent ran
- Verdict: **clear for this staged signer and public JWKS route**; no investigation ticket

The new `GET /api/auth/jwks` route uses a fixed path and returns at most two Ed25519 public JWKs. The private `d` field is derived out of the response, and an unconfigured route returns 503/no-store. A configured route returns a bounded public response with `max-age=600`; the HTTP boundary tests verify no `Set-Cookie`. The route does not accept a caller-selected key URL, file path, identity or token. Better Auth's database-backed global rate limiter is disabled only on `/jwks`, so public-key retrieval does not require a database read; the response is small and fixed. Existing sign-in rate limiting and hooks are unchanged. [Better Auth's rate-limit documentation](https://better-auth.com/docs/concepts/rate-limit) documents the exact per-path exemption.

The signer pins `EdDSA`, validates key type and `kid`, sets issuer/audience, `sub`/`sid`/`jti`, `nbf` and a 15-minute expiry; its keys are separate from license-server keys and Better Auth's session secret. Tests cover public-only keys, issuer/expiry rejection, rotation order, unavailable configuration and the mounted HTTP route. `pnpm --filter @gem-crm/backend-api-auth test` passed 35/35 and `typecheck` passed. No token issuance is wired to login, no access cookie is set, no domain consumer validates JWT yet, and no license-server call was changed. Those future boundaries require their own review and GP-AUTH TODOs remain open. The existing login path was not exercised against a live database in this review; this verdict does not claim end-to-end login parity.
