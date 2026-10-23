# SA review: GMS license-server contract revision 2

- Status: **owner approved for customer-backend implementation**; external license-server implementation, compatibility and capacity remain unverified
- Date: 2026-10-20 (Asia/Bangkok)
- Feature: `gms-platform-migration`; SA revision 2 is limited to GP-LIC-01 / GP-AUTH-05
- Previous approval: [SA revision 1](2026-10-20-gms-platform-migration-rev1.md) approved on 2026-10-20 for nonblocked work; this new external contract was expressly left open
- Approval evidence: after the revised 3-day-token/0–2-day-grace proposal was presented, the owner replied **"ok ทำโค๊ดเลย"**. This approves the revised SA contract for code work, not deployment or claims that the external server exists.
- Exact proposed contract: [signed 3-day v2 token and per-request status](../../spec/gms-license-server-contract-rev2.md)
- Related: [existing 24-hour API draft](../../spec/0005-license-server-api.md), [offline policy](../../spec/gms-license-offline-policy.md), [ADR-0026](../../adr/0026-gms-access-tokens-and-live-authorization.md), [auth API](../../apps/backend/auth/gms-platform/api-contract.md), [central TODO](../../task/todo/gms-platform-migration.md)

The current signed license token expires after 24 hours. The approved GMS
offline rule caps fallback at signed expiry, so its selected two-day default
is impossible under that contract. Revision 2 proposes an opt-in response on
the existing refresh endpoint, with a three-day signed token, explicit
`contract_version: 2`, unchanged license identity/status claims, no silent
downgrade, and one bounded online check per protected request. Runtime grace
would change from the approved 0–7-day range to **0–2 days, default 2**,
matching the owner's request for a shorter signed token. It stops at the earlier of
the configured deadline, signed expiry and natural license expiry. A reachable
explicit revoke denies the same request. During an outage, remote revocation
cannot be learned until reconnection or grace expiry.

Owner clarification: "แล้วถ้า 3 วันได้มั้ย ไม่อยากให้นานไป" was interpreted as
the signed-token lifetime, not the outage grace; the subsequent instruction
"ok ทำโค๊ดเลย" approves this complete revised contract, including the 0–2-day
range. A three-day token cannot truthfully support
the earlier seven-day setting under the signed-expiry cap.

This is a **contract proposal**, not external-server implementation evidence.
The license-server owner must confirm the v2 header/406 negotiation, signing
key overlap, request-rate capacity, p95/availability and error semantics.
The customer host needs measured 4 GB/2 vCPU p95 and connection-pool impact.
Until external implementation and those measurements, GP-LIC-01, GP-AUTH-05, dependent
frontend protected-route work and cutover remain blocked. No deployment or
remote service change is authorized here.

The owner approved the exact v2 design for customer-backend code work. External
license-server changes still need an owner/implementer handoff and demonstrated
compatibility/capacity. This approval does not assert that the external service
exists or waive its load/compatibility verification.
