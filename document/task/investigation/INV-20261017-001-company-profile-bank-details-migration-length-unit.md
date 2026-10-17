# INV-20261017-001 — Bank-details migration truncates by code points; gateway output bound counts UTF-16 units

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: backend
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor / focused pre-handoff review (read-only) / none
- Date and audit scope: 2026-10-17; feature `company-profile` UI revision 3 / SA revision 3 (SA-CP-12…18) working-tree diff
- Source commit, dirty paths, and relevant content hashes: HEAD `2bcf7b2` on branch `fix/17-10-26-company-profile-and-vendor-customer` (the handoff named `00b64bf`, which is an ancestor with in-scope differences; the review used the actual HEAD) plus the uncommitted working tree. `sha256(git diff HEAD --binary)` = `5de871f14accd0caf3de28baf4b7d26dcf03930cfaac2dc4e09c14da7f9a8d43`; untracked `backend-api-partner/prisma/migrations/20261017100000_company_profile_rev3/migration.sql` sha256 `79aad7975abc8846f75b0e59c5a004a8a063b5254f770ecc2d651d30d4de21e9`
- Related ticket / root-cause fingerprint: none / `company-profile:bank_details:length-unit-mismatch(code-point LEFT vs UTF-16 max)`
- Category: hardening
- Verdict: not-applicable
- Vulnerability severity: (none; hardening)

## Evidence and impact

- Affected files and line numbers:
  - `backend-api-partner/prisma/migrations/20261017100000_company_profile_rev3/migration.sql:9-19` — converts the old JSON to text with `LEFT(<lines joined by E'\n'>, 5000)`. In a UTF8 PostgreSQL database `LEFT` counts characters (code points).
  - `backend-api-gateway/src/trpc/company-profile-schemas.ts:69` — `bankDetails: z.string().max(BANK_DETAILS_MAX_CHARS)` on the get/save output; JavaScript `.length` counts UTF-16 code units.
  - `backend-api-gateway/src/trpc/partner-client.ts:109-110` — when the output does not parse, the gateway raises `unavailable(..., "malformed response")`.
  - Removed SA-CP-03 validator (previous `rich-text.ts`): it limited the *sum of text-node* `.length` (UTF-16) to 5,000. The migration adds one LF between top-level blocks, so the joined value can be longer than 5,000 before `LEFT`.
- Attacker prerequisites and reachable entry point: no attacker is needed. It needs an existing (pre-rev3) bank-details value near the old 5,000 limit, with more than one block and characters outside the BMP (such as emoji) in the first 5,000 code points. Only a `company-profile:EDIT` user could have written that value.
- Concrete trust boundary and source-to-sink trace: DB row (migrated) → partner `toProfile` (`company-profile.service.ts:31`, no bound) → gateway `companyProfileGetOutputSchema` / `companyProfileMutationOutputSchema` → parse failure → `companyProfile.get` returns unavailable.
- Observed impact and independent verification evidence: this is a static trace. Example: 2 emoji (4 UTF-16 units) plus 4,996 ASCII characters in 10 paragraphs. The joined text is 5,009 units / 5,007 code points. `LEFT(...,5000)` keeps 5,000 code points, which is 5,002 UTF-16 units, and that fails `max(5000)`. The profile page then cannot load until someone edits the DB. Saving does not help, because the save output uses the same schema and the page needs the loaded version first. The impact is availability of one settings page. There is no confidentiality or integrity exposure. SA-CP-14 says production is not deployed yet and only one row can exist, so real-world likelihood is low.
- Missing validation fact / capability (if any): the migration SQL was not executed against PostgreSQL in this review, and no test exercises it. Other behaviour was only read from the PostgreSQL semantics, not run: the `strict $.**.text` traversal, the `LEFT` character count, and whether the migration runs in one transaction. Whether any non-dev database holds a pre-rev3 value is unknown.
- Sanitized evidence sufficient for owner review: yes (file/line references above; no data copied).
- Raw report/run links: none.

## Proposed work

- Allowed code scope and assigned implementation role: backend — `backend-api-partner/prisma/migrations/20261017100000_company_profile_rev3/migration.sql` (only if it has not yet been applied to any shared database; otherwise a follow-up migration), optionally a partner/gateway test.
- Suggested remediation (owner chooses one):
  1. Bound the migrated value with a margin that cannot exceed 5,000 UTF-16 units. For example, truncate and then trim further while `octet_length`/UTF-16 length is too large, or simply truncate to 2,500 code points when the value contains non-BMP characters. Also apply the same `rtrim` normalization as SA-CP-13 (`trimEnd`).
  2. Or have the partner's `toProfile` mapper clamp `bankDetails` to 5,000 UTF-16 units, so the stored data can never break the gateway output contract.
- SA design / contract / flow / dependency change needed: no contract change for option 1. Option 2 is a mapper behaviour note for SA-CP-13/14 that SA should confirm.
- Acceptance criteria: for any pre-rev3 JSON accepted by the old SA-CP-03 validator, `companyProfile.get` succeeds after migration. A test or fixture covers a multi-block value with non-BMP characters at the 5,000 limit.
- Safe verification plan and prerequisites: run the migration against a disposable local PostgreSQL (container per the existing dev setup, within the 8 GB / 4 vCPU budget). Seed one row with such a JSON value, then call partner GET and the gateway output parse. Do not use a shared or live database.

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
