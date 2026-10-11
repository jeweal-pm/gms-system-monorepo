# License enforcement and activation flow (backend proposal)

- Status: proposed, pending SA review `auth-license` revision 2; revision 1 approval recorded separately
- Source: [license spec](../spec/0006-license.md)
- Backend contract: [auth license integration](../apps/backend/auth/license-integration/architecture.md)

```mermaid
flowchart TD
  A[User signs in using existing Better Auth flow] --> B[Gateway resolves authenticated session]
  B --> C{License status}
  C -->|VALID / EXPIRING / eligible GRACE| D[Allow licensed procedures]
  C -->|REQUIRED| E[Allow status, activation, logout only]
  C -->|EXPIRED / REVOKED| F[Allow status and logout; deny licensed procedures]
  C -->|UNVERIFIABLE| G[Return service unavailable; deny licensed procedures]
  E --> H[User submits license key]
  H --> I[Auth uses session email and calls LicenseClient]
  I --> J{Signed token verifies?}
  J -->|yes| K[Cache token by local user ID]
  K --> D
  J -->|no / upstream unavailable| E
  B -->|CRM provisions user| P[Auth checks license before account creation]
  P -->|pending issued or usable active| Q[Create local user and send credentials]
  P -->|none, ineligible or outage| R[Reject without creating account]
  B --> S[Auth keeps only newest of one user session]
  T[Licensed user requests email change] --> U[Reject; keep account email and license binding unchanged]
  U --> V[For another email, create a new account and issue a separate license]
```

This document describes backend states only. UI routes, redirects, screens and banner are
outside this revision. License transfer is unsupported; proposed JWT defaults remain pending review. See
the [detailed sequence](../apps/backend/auth/license-integration/sequence-diagram.md).
