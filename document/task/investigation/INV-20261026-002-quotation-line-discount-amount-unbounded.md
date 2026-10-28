# INV-20261026-002 — Quotation per-line discount amount is not range-checked before the DECIMAL(18,2) write

## Tracking

- Ticket revision: 1
- Status: resolved
- Owner: backend (api-master)
- Priority: awaiting user review
- Auditor / mode / run ID: sec-auditor / focused pre-handoff review (read-only, static) / no run ID
- Date and audit scope: 2026-10-26; owner follow-up "per-line discount + 5 photos per line" on `feat/26-10-26-integrate-quotation-api`.
- Source commit, dirty paths, and relevant content hashes: HEAD b4136f5 + uncommitted working tree. File hashes (sha256, first 16): `quotation.calculate.ts` aacd901cdf4ab899, `quotation.service.ts` a452f3434bd25655, `quotation.schemas.ts` 0d42be202d74491d, migration `20261026150000_quotation_line_discount/migration.sql` 5f161ab584c2f5da.
- Related ticket / root-cause fingerprint: `quotation-amounts:oversize-check-misses-line-discount`.
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- Affected files and line numbers:
  - `backend-api-master/src/quotation/quotation.calculate.ts` L53 `oversizeAmounts` checks each `lineAmounts[i]` and the document totals against `AMOUNT_MAX`, but not `lineDiscounts[i]`.
  - `backend-api-master/src/quotation/quotation.calculate.ts` L24 `lineDiscount` caps the discount at the line gross, and the gross itself can reach about 1e22 (`pcs` up to 999 999 × `unitPrice` with 16 integer digits).
  - `backend-api-master/src/quotation/quotation.service.ts` L545 writes `discountAmount: lineDiscounts[index]` into `quotation_line.discount_amount DECIMAL(18,2)`.
- Attacker prerequisites and reachable entry point: an authenticated user with `quotation:ADD`/`EDIT` sends a create/update mutation for a line whose gross is above 9 999 999 999 999 999.99, with a 100 % (or larger AMOUNT) line discount.
- Concrete trust boundary and source-to-sink trace: client input → zod (each field in range) → `calculateTotals` → `lineAmount = gross − discount = 0` passes `oversizeAmounts` → Prisma insert of an out-of-range `discount_amount` → numeric-overflow DB error. `mapQuotationError` does not map it, so the request fails with an unexpected 500 instead of `VALIDATION_ERROR`. Before this change the line amount equalled the gross, so the existing check covered it.
- Observed impact and independent verification evidence: static trace only. The transaction rolls back, so nothing is corrupted or disclosed, and no other user or tenant is affected. Impact is an unhandled-error path, plus error noise in logs.
- Missing validation fact / capability (if any): not run against PostgreSQL. I did not check whether the gateway hides the 500 body, but that is existing behaviour and is not changed here.
- Sanitized evidence sufficient for owner review: the trace above.
- Raw report/run links: none.

## Corroborating review (security-auditor, 2026-10-26)

security-auditor traced the same root cause independently (same file hashes) and noted it is a regression of the line-discount change: before it, the line amount equalled the gross, so the old check covered it. Extra fact (needs_validation): the master tRPC errorFormatter (`backend-api-master/src/master/router.ts` errorFormatter) uses `error.message` as `domainCode` for an unmapped error and `trpc-handler.ts` has no `onError` sanitizer, so a Prisma/PostgreSQL overflow message might reach the client; this was not verified against a database. The proposed fix (flag the line discount or gross above `AMOUNT_MAX` as `lines.<i>.unitPrice too_big`) closes this path either way. Merged here by the parent rather than a second record.

## Proposed work

- Allowed code scope and assigned implementation role: backend; `quotation.calculate.ts` (`oversizeAmounts`) plus its unit test.
- Suggested remediation: also flag `lineDiscounts[i] > AMOUNT_MAX` (or the line gross) as `lines.${i}.unitPrice` `too_big`.
- SA design / contract / flow / dependency change needed: none. This uses the existing `VALIDATION_ERROR` contract.
- Acceptance criteria: an oversize gross with a 100 % line discount returns `VALIDATION_ERROR` at `lines.<i>.unitPrice`, and no DB write is attempted.
- Safe verification plan and prerequisites: a unit test on `oversizeAmounts`/`calculateTotals`, then run the api-master suite.

## User selection and approval

- Approved ticket revision: 1
- Actual user instruction / approval evidence: owner 2026-10-27 "แก้ INV-20261026-002"
- Approval date: 2026-10-27
- Separate approved SA bundle/revision, if required: none (existing VALIDATION_ERROR contract)

Do not infer approval from creation of this ticket or approval of a different revision.

## Implementation and resolution

- Selected work ID / root-cause fingerprint: INV-20261026-002 / `quotation-amounts:oversize-check-misses-line-discount`
- Corrective pass limit: 3 (initial fix included)
- Passes allocated: 1
- Active pass: none
- User-authorized extension and new limit: none
- Stop reason / missing prerequisite: none
- Reopen evidence and explicit selection: none

| Pass | Owner(s) / input revision or hash | Causal hypothesis / new evidence | Meaningful change | Authorized verification / result / failure signature | Next fact or terminal decision |
|---|---|---|---|---|---|
| 1 | backend (parent, sequential) / branch fix/27-10-26-quotation-decimal-setup @ 11981aa | `oversizeAmounts` checked only the amount after discount; a 100 % discount makes it 0 | `oversizeAmounts` also flags `lineDiscounts[i] > AMOUNT_MAX` as `lines.<i>.unitPrice` `too_big` (`quotation.calculate.ts`); test UT-QT-B14c | UT-QT-B14c fails before the fix, passes after; api-master 385 passed / 19 skipped; tsc + eslint clean | resolved |

- Final status / date: resolved 2026-10-27 (no DB write is attempted; the possible raw DB message path is no longer reachable from this input)
