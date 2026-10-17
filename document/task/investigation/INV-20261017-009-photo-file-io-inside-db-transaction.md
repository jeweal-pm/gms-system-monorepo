# INV-20261017-009 — Photo file is written inside the DB transaction: it holds a pool connection and row lock, and a failure leaves file and metadata out of step

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: backend (auth `user-admin`)
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor / focused pre-handoff review (read-only, static) / no run ID
- Date and audit scope: 2026-10-17. Feature: user-permission user photo with file storage (user-photo.md PH-01…10, owner approval "อนุมัติ PH"). Scope: auth photo routes and storage, gateway photo REST and `userAdmin.removePhoto`, frontend photo tile.
- Source commit, dirty paths, and relevant content hashes: HEAD d19aa55 + working tree. Review hash c6dee7f33779f161 = sha256 (first 16) of `git diff -- backend-api-auth/src backend-api-auth/prisma backend-api-gateway/src frontend/src/features/user-permission` followed by the contents of photo-storage.ts, user-photo.controller.ts, photo.ts, photo-tile.tsx and migration.sql, in that order.
- Related ticket / root-cause fingerprint: related to INV-20261017-008 (resource bounds), but a different root cause / `auth-photo:file-io-in-interactive-transaction`
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers in `backend-api-auth/src/user-admin/user-admin.service.ts`:
  - L315-325, `putPhoto`: takes the `FOR UPDATE` lock, then calls `replacePhotoFile` (write, fsync, rename), then `userPhoto.upsert`. The transaction has `timeout: 4_000`.
  - L333-339, `removePhoto`: unlinks the file, then calls `deleteMany`.
  - L431-438, `readUserPhoto`: reads the row, then the file, without a lock.
- Attacker prerequisites and reachable entry point: one of these:
  - an EDIT holder with a manageable target (upload or remove)
  - an ordinary failure, such as a slow volume, a DB error or a transaction timeout
- Concrete trust boundary and source-to-sink trace:
  1. **Pool connection and row lock held during file I/O.** The 5 MB write and `fsync` run while the transaction holds one pg pool connection (PrismaPg default pool) and the target `User` row lock, for up to 4 s. A few concurrent uploads can delay auth sign-in and session queries.
  2. **Failure after rename (upload).** If the upsert or the commit fails or times out after `rename`, the file holds the new bytes but the row keeps the old `contentType`/`sha256`. The previous photo is lost. The old `?v=` URL now serves different bytes under `immutable` caching.
  3. **Rollback of a remove.** If remove rolls back, the row survives without a file, and GET returns 404.
  4. **Read during upload.** A GET that runs during an upload can pair the old version with the new bytes.
- Observed impact and independent verification evidence: static reading only. Content stays safe:
  - Every stored byte passed the JPEG/PNG signature check.
  - The gateway serves it with an allowlisted image type, `nosniff` and `CSP sandbox`.
  - There is no XSS and no disclosure across users. This is data-integrity and availability hardening, not a vulnerability.
- Missing validation fact / capability (if any): fsync latency on the production `auth-storage` volume.
- Sanitized evidence sufficient for owner review: yes.
- Raw report/run links: none.

## Proposed work

- Allowed code scope and assigned implementation role: backend. Files: `backend-api-auth/src/user-admin/user-admin.service.ts`, `backend-api-auth/src/user-admin/photo-storage.ts`, and tests.
- Suggested remediation:
  - Write and fsync the temp file before opening the transaction.
  - Inside the transaction: lock, check, upsert, then `rename` as the last step before commit.
  - Remove the temp file on any failure.
  - For remove, delete the row inside the transaction and unlink the file after commit. A leftover file is harmless, as with user delete.
  - Optionally, take the version header from the same read as the bytes, for example by putting the version in the file name.
- SA design / contract / flow / dependency change needed: no; PH-02 is met either way. Record the new ordering in the SA note if it changes.
- Acceptance criteria:
  - Apart from a rename, no file I/O happens while the transaction is open.
  - A failure or timeout in the DB step leaves the previous file and row unchanged.
  - Tests cover a failed upsert and a failed remove.
- Safe verification plan and prerequisites: auth unit tests with mocked Prisma and a temporary storage directory.

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
