# Dependencies: auth / GMS platform migration

- SA revision: 1, approved-design; see central TODO gates; ledger: [tech-stack](../../../../adr/tech-stack.md); TODO GP-AUTH-01..06

| Package/workspace | Status | Purpose | Evidence / alternative | Host impact / decision |
|---|---|---|---|---|
| `better-auth@1.7.7`, `backend-api-auth` | installed; reuse | Login and session authority | [official sessions](https://better-auth.com/docs/concepts/session-management); existing source | Existing process; do not equate session with JWT |
| Better Auth JWT plugin shipped in installed package | available, not activated | Alternative for a later complete token/session contract | [official plugin](https://better-auth.com/docs/plugins/jwt); current staged slice uses a custom issuer on existing `jose` | No new package; do not activate a second issuer without SA review |
| `jose@6.2.12`, auth | installed; reused in staged code | Existing license EdDSA and separate user JWT signing | [jose documentation](https://github.com/panva/jose); [staged verification](testing.md) | No new package; do not share license-server keys |
| Auth read-only DB view / hashed refresh tables | proposed schema, no package | Next-request rights and refresh rotation | Alternative: TTL lag or event feed | +indexed query/request; DB pool <=5, view readers use own pools |

Version changes and package installation remain pending separate owner approval and parent-owned lockfile edits. Refer to [SA review](../../../../reviews/sa/2026-10-20-gms-platform-migration-rev1.md) for the consolidated proposal.

The staged signer reads optional server-only `AUTH_ACCESS_JWT_ISSUER` and
`AUTH_ACCESS_JWT_KEYS` (JSON array of one or two `{kid,privateJwk}` Ed25519
entries). The first key signs and both public keys appear at `/api/auth/jwks`.
Keep the private JWK in an approved secret source, never in frontend/build
variables or this repository. With both settings absent the JWKS route returns
503 and existing Better Auth login continues; incomplete/invalid configuration
fails startup. Issuance remains disconnected from login until GP-AUTH-01/02
and the deployment secret/rotation contract are complete.

**SA revision 3 approved and staged:** [ADR-0028](../../../../adr/0028-gms-license-current-decision-order.md) uses installed Prisma/PostgreSQL and Node APIs. An additive auth-owned table and sequence migration is implemented, with no new library, container, GitHub variable or lockfile change. No image/pipeline change is required; the auth app role needs sequence usage and table write privileges when separate managed DB roles are provisioned. The added DB round trips and pool pressure require measurement before cutover.
