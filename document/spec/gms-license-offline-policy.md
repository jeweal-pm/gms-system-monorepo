# GMS license freshness and offline policy — approved amendment, revision 2

- Date: 2026-10-20 (Asia/Bangkok)
- Status: revision 2 approved for customer-backend code by owner reply "ok ทำโค๊ดเลย" after the 3-day-token/0–2-day-grace proposal; external server, capacity and cutover remain blocked
- Source: [ADR-0013](../adr/0013-per-user-license-with-signed-token.md), [license-server API](0005-license-server-api.md), [GMS target spec](../gms-platform-spec.md), [ADR-0026 proposal](../adr/0026-gms-access-tokens-and-live-authorization.md)
- Owner direction: on 2026-10-20 the owner chose next-request revocation, then requested a configurable choice between immediate denial and continued use for a specified number of days, with **2 days as the default** while the final business policy is being evaluated.

## Proposed rule

`LICENSE_OFFLINE_GRACE_DAYS` is a per-customer runtime integer in the range **0–2**; default **2** under approved revision 2. It is not a build-time `NEXT_PUBLIC_*` value. Changing it requires a controlled runtime configuration change and a recorded effective value. The two-day value is a default, not a claim that a remotely revoked license is detected during an outage.

**Revision 2 approval (2026-10-20):** the owner chose a three-day lifetime for
the signed license token over the earlier eight-day proposal and instructed
implementation of the [revised external contract](gms-license-server-contract-rev2.md).
The former 0–7 range from revision 1 is superseded by 0–2, default 2.
GP-AUTH-05 remains blocked for production until the external server and
capacity evidence exist.

| License-server result for a protected request | Required outcome |
|---|---|
| Reachable, signed eligible result | Allow only if account, session and exact local action grant also pass. Update the persisted last-successful-check time. |
| Reachable, explicit revoked/expired/missing result | Deny this request (403 or existing activation state). Never use a previous eligible result. |
| Transient network timeout/connection failure or server 5xx | With grace `0`, deny with 503. With grace `1–2`, allow only if a same-instance/same-user signed eligible result from a prior successful online check is still cryptographically and temporally valid. |
| No prior eligible result, invalid signature, wrong identity, bad key/configuration, 401/403/429, clock uncertainty, or expired signed token | Deny; do not classify as an eligible outage fallback. |

The fallback deadline is `min(lastSuccessfulCheckAt + configured days, signedTokenExpiresAt)`. The failed request **never** advances `lastSuccessfulCheckAt`. Reconnection checks the server before any further fallback. Do not cache an online positive decision across requests. Persist the last successful result and timestamp atomically; use database time for the deadline and fail closed if time cannot be trusted. Record the use of fallback and its deadline in safe logs/metrics without token bytes, email or license key.

**Contract blocker discovered on 2026-10-20:** the currently approved
[license-server API draft](0005-license-server-api.md) fixes signed JWT `exp`
at `iat + 24 hours`. Under the formula above, the selected two-day default
would last at most 24 hours (and often less). GP-LIC-01 must obtain the
approved revision 2 three-day signed eligibility proof
whose validity spans the configured maximum, or a separately signed offline
lease with a sufficient expiry, while retaining an online status response on
each reachable protected request. The actual claim/TTL/signature, explicit
revocation, capacity and rollback contract require separate SA/owner review.
Do not silently extend JWT expiry or report two-day outage coverage from the
24-hour draft token.

Local account, session and grant changes still apply on the next protected request through the proposed live authorization view, including during a license-server outage. A remote license revocation applies on the next request **when the server is reachable**. During a continuous outage it may remain undetected until the fallback deadline, at most the configured number of days and never beyond signed expiry. The default two-day window is an explicit availability/security tradeoff.

## Contract and target-spec changes required

The existing v1 license client refreshes roughly every 24 hours and ADR-0013 allows seven days of grace. The approved target behavior needs an online signed status check on each protected request. Customer-backend v2 client/policy code is staged against the approved opt-in `POST /v1/licenses/refresh` revision; its production implementation, rate capacity, error semantics, timeout and signed-token claims must still be confirmed by the external owner. Domain APIs would verify their user JWT locally, query current local rights, then use a private service-authenticated auth check for remote license status. This is the **approved design exception** to GMS spec §2's no-per-request-auth-call rule. Do not activate the protected online check until the external implementation and capacity evidence are verified.

Before cutover, SA/backend must specify the exact request/response for the private auth check, status-code mapping, bounded timeout/retry policy, expected request rate, license-server service level, storage migration of the last successful timestamp, and behavior for login/refresh versus ordinary protected requests. Measure the extra auth/license latency and capacity on the 4 GB / 2 vCPU host. If the remote service is absent or cannot sustain the contract, dependent migration TODOs remain blocked; the current gateway/license behavior remains authoritative until a separately approved transition.
