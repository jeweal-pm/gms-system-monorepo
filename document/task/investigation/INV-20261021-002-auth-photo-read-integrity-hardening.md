# INV-20261021-002 — Auth photo read integrity hardening

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: backend
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / scoped changed-code review / none
- Date and audit scope: 2026-10-21; auth user-photo reads in GMS storage migration revision 3
- Source commit, dirty paths, and relevant content hashes: HEAD plus changed-file manifest SHA-256 `5d6b78fc9d09ba698244ba4dc98267bec50b2a907925aa1276f8f9f00265d700`; `backend-api-auth/src/user-admin/user-admin.service.ts`, `backend-api-auth/src/user-admin/photo-storage.ts`
- Related ticket / root-cause fingerprint: `gms-storage/auth-photo-read-integrity`
- Category: hardening
- Verdict: not-applicable
- Vulnerability severity: none

## Evidence and impact

- Affected files and line numbers: `backend-api-auth/src/user-admin/user-admin.service.ts:480-493`; `backend-api-auth/src/user-admin/photo-storage.ts:40-69`.
- Attacker prerequisites and reachable entry point: local modification or corruption of the storage file; no remote attacker-controlled write path was identified in the scoped review.
- Concrete trust boundary and source-to-sink trace: authenticated photo read loads a `StoredFile` record and returns the associated object. The auth adapter enforces a maximum/actual size, but does not compare the returned bytes' SHA-256 against stored metadata. The legacy fallback reads the whole file without enforcing the 5 MiB bound. Partner logo reads perform size, hash, and signature checks.
- Observed impact and independent verification evidence: a locally corrupted/replaced photo could be returned without detecting metadata mismatch; an oversized legacy photo could be read into memory. This is hardening advice, not a confirmed vulnerability.
- Missing validation fact / capability (if any): none needed to establish the code difference; exploitability from an external principal was not demonstrated.
- Sanitized evidence sufficient for owner review: scoped sec-auditor review against the revision above; no app execution was performed by the auditor.
- Raw report/run links (local, ignored evidence may not exist on another checkout): none

## Proposed work

- Allowed code scope and assigned implementation role: backend; auth photo storage adapter/read path and focused tests only.
- Suggested remediation: enforce the existing 5 MiB limit on legacy reads and compare stored object size/hash against authoritative photo/StoredFile metadata before returning bytes; preserve current API error behavior unless a separately approved contract is needed.
- SA design / contract / flow / dependency change needed: none expected if API contract remains unchanged.
- Acceptance criteria: corrupted or mismatched stored bytes are not returned; oversized legacy bytes are rejected without unbounded buffering; tests cover valid, mismatch, and oversized legacy cases; existing authorization, photo versioning, and permanent-retention behavior remain unchanged.
- Safe verification plan and prerequisites: focused auth unit/integration tests using isolated temporary storage and test persistence; run existing auth checks.

## User selection and approval

- Approved ticket revision: none
- Actual user instruction / approval evidence: none; finding is staged for owner review.
- Approval date: none
- Separate approved SA bundle/revision, if required: existing GMS file-storage SA revision 3; no contract change currently proposed.

## Implementation and resolution

- Selected work ID / root-cause fingerprint: none
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 0
- Active pass: none
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: owner selection required before remediation
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|

- Assigned owner and start date: pending user selection
- Changed files / implementation revision: none
- Checks performed, results, and limitations: scoped static review only; no confirmed vulnerability
- Follow-up auditor and verification evidence: pending ticket selection
- Remaining risk or reopened validation gap: auth photo read does not verify stored digest/size parity; legacy fallback has no explicit size bound
- Completion report under document/task/done/: none
- Final status / date: pending-review
