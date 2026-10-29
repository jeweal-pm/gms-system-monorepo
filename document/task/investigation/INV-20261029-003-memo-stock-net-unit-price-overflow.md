# INV-20261029-003 — `memo_stock.net_unit_price` too narrow: some valid documents can never be approved

## Tracking

- Ticket revision: 1
- Status: pending-review
- Owner: backend
- Priority: awaiting user review
- Auditor / mode / run ID: security-auditor, focused pre-handoff review, 2026-10-29
- Date and audit scope: 2026-10-29; memo-receive rev 3 working-tree changes (base e1b8bcb)
- Source commit, dirty paths, and relevant content hashes: uncommitted; migration `20261029090000_memo_receive`, `memo-receive.service.ts`
- Related ticket / root-cause fingerprint: save accepts a unit price that the approve-time column cannot hold
- Category: hardening
- Verdict: not-applicable

## Evidence and impact

- `quotation.schemas.ts:41` allows `unitPrice: decimal(16, 2)`, which is up to 16 integer digits. The migration's `"net_unit_price" DECIMAL(18,4)` holds only 14 integer digits.
- `memo-receive.service.ts:66-74` computes `netUnitPrice = amount ÷ basis`, falling back to the gross price when the basis is 0. `:213` inserts it when the document is approved.
- Example 1, per pieces: pcs = 1 and unitPrice = 1e15. Create and update succeed, because the value is under `AMOUNT_MAX`. Approve then hits PostgreSQL numeric overflow (22003). The transaction rolls back, the caller gets a generic 500, and the document can never be approved.
- Example 2, per carat: weight 0.001 with a unitPrice of about 1e14 does the same.

## Proposed work

- Choose one:
  - (a) Reject at save with `VALIDATION_ERROR lines.N.unitPrice` when `netUnitPrice` would exceed 14 integer digits. This is within the approved contract.
  - (b) Widen the column to DECIMAL(20,4) or more. This is an additive schema change; confirm it with SA.
- Acceptance:
  - Unit tests with 1e15 per pieces and with a 0.001 ct line are either rejected at save with a field error, or approve successfully.
  - Approve never returns 500 for input that save accepted.

## User selection and approval

- Approved ticket revision:
- Actual user instruction / approval evidence:
- Approval date:
