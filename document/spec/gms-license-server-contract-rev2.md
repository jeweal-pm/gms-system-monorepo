# Proposed license-server contract amendment: GMS online status and outage grace

- Status: **owner-approved design for customer-backend code**; external service not present in this repository and not yet verified
- Date: 2026-10-20 (Asia/Bangkok)
- Feature: `gms-platform-migration`; proposed license contract revision 2; SA revision 1 architecture remains approved
- Owner approval: on 2026-10-20 the owner asked for a **3-day** signed-token lifetime because the 8-day proposal was too long, then replied **"ok ทำโค๊ดเลย"** to the revised 3-day-token/0–2-day-grace proposal.
- Sources: [current license-server API draft](0005-license-server-api.md), [approved offline policy design](gms-license-offline-policy.md), [ADR-0026](../adr/0026-gms-access-tokens-and-live-authorization.md), [central TODO GP-LIC-01](../task/todo/gms-platform-migration.md)

## Why a new contract is required

The existing API draft signs a license JWT with `exp = iat + 24 hours`. The
approved GMS fallback ends at `min(lastSuccessfulCheckAt + configured grace,
signedTokenExpiresAt, licenseExpiresAt)`. Consequently the chosen default
two-day grace and previously proposed seven-day maximum cannot be delivered by the current
token. Changing only the local configuration would misrepresent outage
availability. The license-server implementation is also absent, so neither
per-request capacity nor error behavior can be verified here.

## Proposed compatible amendment

1. Retain `POST /v1/licenses/refresh`, instance authentication, the existing
   `{ "token": "<signed JWT>" }` response shape and the current subject,
   instance, issuer, audience, `kid`, type, status and `license_expires_at`
   claims. This avoids a second bearer format in existing clients.
2. For a new **version 2** license response, sign the JWT with `exp = iat + 3
   days`. Add a signed `contract_version: 2` claim. Three days provides a
   one-day margin beyond the proposed maximum two-day grace from a successful check;
   it is not a permission to use a revoked license for three days. The
   customer backend still checks the server on **every reachable protected
   request** and uses the proposed configured 0–2-day grace (default 2) only on a transient timeout
   or 5xx. Fallback remains capped by the signed JWT's `exp` and
   `license_expires_at` and never advances from a failed check.
3. Return an explicitly signed `active`/`suspended`/`revoked` status for every
   found license. A 404 `LICENSE_NOT_FOUND` is an explicit denial, not an
   outage. Never reuse the last positive token on a 4xx denial, invalid
   signature, wrong instance/subject, unknown key or clock failure. A newly
   signed revoked/suspended token must deny the same request even if an older
   active token is still within its three-day expiry.
4. Preserve revision 1 responses for existing clients. A GMS customer backend
   sends `X-License-Contract-Version: 2` to the same endpoint. A supporting
   server returns a version 2 signed token; an unsupported server returns
   `406 {"error":{"code":"UNSUPPORTED_CONTRACT","message":"..."}}`.
   The v2 client rejects a response lacking a verified
   `contract_version: 2` claim; it never falls back to v1 while claiming a
   two-day grace. An existing caller with no header keeps the v1 response.
   The server owner must confirm signing-key overlap and error compatibility.
5. Proposed per-request client budget: one attempt, 1,500 ms overall timeout,
   zero automatic retries; timeout/5xx enters the approved fixed fallback,
   429 fails closed with 503 locally and does **not** enter offline grace
   unless the external contract explicitly classifies it as an outage in a
   later approved revision. The server owner must supply expected protected
   request rate, p95 target, per-instance rate behavior, abuse protection and
   availability/capacity evidence before GP-AUTH-05. The customer backend
   must not fan out each protected request. Log request IDs and safe status
   codes; never log API key, license key or signed token.

## Compatibility, rollout and rollback

The existing account/email/instance binding and one-email/one-license policy
remain unchanged. A version 2 token must use a purpose and audience accepted
only by the customer backend's **license verifier**, never by the separate GMS
user access-JWT verifier. Preserve existing 24-hour v1 issuance until the
external server and customer backend are both ready. In staging, verify
0/1/2-day outage boundaries with a fake clock, natural license expiry,
explicit revoke, wrong identity, invalid signature, key rotation, server
timeout/5xx and 429. Run bounded load against the real license server and
4 GB/2 vCPU customer host, then select a cutover/rollback window. Roll back
to the old gateway/license behavior as a whole; do not silently downgrade a
GMS protected request to 24-hour v1 proof while claiming a two-day grace.

## Approval gate

The owner approved this **separate contract revision**, including the change
of `LICENSE_OFFLINE_GRACE_DAYS` from 0–7 to **0–2 (default 2)**, for code work.
The external server's implementation and measured capacity are still missing;
do not activate GP-AUTH-05 or protected-route cutover before those are verified.
This approval does not authorize deployment or change existing license-server
behavior by itself.
