# INV-20261019-001 — Stone master options bound can exceed the gateway 1 MiB partner-response cap

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: sa (contract bound); implementation backend (partner + gateway)
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / focused changed-code review (guidance mode, security-review.md) / no full run
- Date and audit scope: 2026-10-19; stone-master UI rev 1 + SA rev 1 + ADR-0024, partner `src/stone-master/*`, gateway `stoneMaster` router, partner-client
- Source commit, dirty paths, and relevant content hashes: HEAD 79dfe91 + working tree; review hash `403639a6858cd27a` (sha256 first 16 hex over the stone-master diff + file list defined in the review handoff)
- Related ticket / root-cause fingerprint: `stone-master/options-response-size-vs-gateway-MAX_RESPONSE_BYTES`; not a duplicate of INV-20261017-008 (photo binary routes)
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers:
  - `backend-api-partner/src/stone-master/stone-master.service.ts:13` (`OPTIONS_LIMIT = 1_000`), `:276-293` (`options` returns up to 1,000 rows per requested kind, plus every `sizeIds` for each shape)
  - `backend-api-partner/src/stone-master/stone-master.schemas.ts:20` (a shape may hold up to 100 `sizeIds`)
  - `backend-api-gateway/src/trpc/partner-client.ts:11` (`MAX_RESPONSE_BYTES = 1_048_576`), `:40-58` (oversize body aborts with `PartnerUnavailable("oversize")`), `:93-99` (mapped to `SERVICE_UNAVAILABLE / PARTNER_UNAVAILABLE`)
  - `backend-api-gateway/src/trpc/stone-master-schemas.ts:103-114` (output schema accepts 1,000 per kind and 100 `sizeIds` per shape)
  - Contract: `document/apps/backend/partner/stone-master/decisions.md` SA-SM-08 (options ≤ 1,000 per kind) and SA-SM-11 (expected < 5,000 rows per table)
- Attacker prerequisites and reachable entry point: an authenticated licensed user with `stone-master:ADD`/`EDIT` (trusted master-data role) creating or editing records within the validated limits; or ordinary data growth. Effect is seen through `stoneMaster.options` (`stone-master:VIEW`).
- Concrete trust boundary and source-to-sink trace: browser → `/api/trpc` → gateway `stoneMaster.options` → `callPartner` → partner `GET /internal/v1/stone-master/options?kinds=…` → Prisma `findMany(take: 1000)` per kind → JSON body → gateway `readBoundedBytes` (1 MiB cap).
- Observed impact and independent verification evidence: static estimate only. The Stone Code page requests 7 kinds. With the allowed field sizes (`id` 36, `code` ≤ 20, `name` ≤ 120 chars, which is up to 360 bytes for Thai UTF-8 text), 7 × 1,000 rows is about 1.5 to 3 MB. 1,000 shapes × 100 `sizeIds` add about 3.9 MB. Typical short names (~20 chars) reach about 0.8 MB at 7,000 rows, close to the cap. Once a response exceeds 1 MiB, every `options` call fails closed with `PARTNER_UNAVAILABLE`. The Stone Code, Shape and Stone Name selects then become unusable for all users until data shrinks. Memory stays bounded (partner builds a few MB; gateway aborts at 1 MiB), so this is a robustness and availability gap, not a confirmed vulnerability. Separately, when a kind exceeds 1,000 active rows, options are silently cut off by code order (a functional effect).
- Missing validation fact / capability (if any): real expected per-kind cardinality and shape–size fan-out in production; no load test was run (static review only, no live calls by this auditor).
- Sanitized evidence sufficient for owner review: yes (file/line trace above; no data or payloads).
- Raw report/run links: none (focused review; no run tree).

## Proposed work

- Allowed code scope and assigned implementation role: backend. Paths are `backend-api-partner/src/stone-master/*` and `backend-api-gateway/src/trpc/{router.ts,stone-master-schemas.ts,partner-client.ts}`. Only after SA confirms the bound.
- Suggested remediation (choose one in SA review):
  1. Make the documented bounds consistent with the 1 MiB cap. For example, lower `OPTIONS_LIMIT` and the shape `sizeIds` fan-out in options, or omit `sizeIds` from options and fetch them per shape, then document the worst-case byte budget in SA-SM-08/11.
  2. Or pass an explicit, documented `maxBytes` for this route only (as `getPartnerBinary` already does), sized from the worst-case budget and the 8 GB / 4 vCPU headroom.
  3. Optionally return a `truncated` flag per kind so the UI can tell users that options were cut off.
- SA design / contract / flow / dependency change needed: yes, SA-SM-08/11 bound or contract change (separate SA approval).
- Acceptance criteria: the worst-case `options` response for the documented limits fits within the gateway read bound (or the route's explicit bound). A test covers the maximum allowed payload (or the truncation signal). There is no unbounded growth in partner or gateway memory.
- Safe verification plan and prerequisites: a unit or integration test with generated maximum-size rows against a test database. Do not use production data.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
- Separate approved SA bundle/revision, if required:

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

Apply [bounded remediation](../../workflow/remediation.md); counts persist across roles,
revisions, and sessions for the same cause. Do not allocate a fresh budget on handoff.

- Selected work ID / root-cause fingerprint:
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 0
- Active pass: none
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|

- Assigned owner and start date:
- Changed files / implementation revision:
- Checks performed, results, and limitations:
- Follow-up auditor and verification evidence:
- Remaining risk or reopened validation gap:
- Completion report under document/task/done/:
- Final status / date:
