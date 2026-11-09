# Handoff: approval-setup → SA (phase 2 service design)

- Feature ID / UI revision: `approval-setup` / UI revision 1 (**pending-review**; not approved)
- SA revision / source UI revision (if applicable): none yet / UI 1
- From role/scope: ui-spec (documents only)
- To role/scope / parent integration owner: SA, dispatched by the parent **only after** the owner approves UI rev 1 or explicitly asks for SA design. The owner said "ตอนนี้ยังไม่ต้องทำ backend" (2026-11-09): SA may design for review; backend implementation waits for a separate owner instruction.
- Exact TODO IDs and source documents: FE-AS-008…011 and SA-AS-01…10 in [task/todo/approval-setup.md](../../task/todo/approval-setup.md); [ui-spec](../../apps/frontend/approval-setup/ui-spec.md), [data-fetching](../../apps/frontend/approval-setup/data-fetching.md), [error-handling](../../apps/frontend/approval-setup/error-handling.md), [open-questions](../../apps/frontend/approval-setup/open-questions.md) (requires-SA items Q-AS-02, 09, 12, 13, 14, 16, 21, 22), [flow](../../diagram/approval-setup-flow.md).
- Approval status, approved revision, and owner evidence: none (pending-review). Owner answers A1–A4 of 2026-11-09 are recorded in the ui-spec header.
- Required contract / diagrams / ADRs: a new ADR (proposed next number after ADR-0046) for per-type approval settings and the "Save = Approved" path; it amends ADR-0046 (statuses for Quotation), ADR-0045 D2 (deletable set when OFF), ADR-0032/0038 (Quotation create status), ADR-0033/0034/0036/0041/0042 (Save path), and the auth catalog (ADR-0020). Sequence diagrams for Save (OFF/ON), setting update with the waiting guard, and database diagram for the setting table.
- Dependency ledger entries and installation status: none.
- Allowed code/document paths: SA documents under `document/apps/backend/master/approval-setup/`, `document/apps/backend/auth/` (catalog leaf), `document/adr/`, `document/diagram/`; the central TODO backend items. No application code.
- Integration-owned changes: task pointer, registry, `tech-stack.md` (unchanged expected).
- Infra service bundle/revision: none expected (no container/network/storage change); SA confirms.
- DevOps: none expected.
- Resource budget / capacity impact (4 GB RAM / 2 vCPU total): one table of ≤ 11 rows per company; one read per document Save (cacheable per request only), one summary count query; no polling, worker or cache service.

## Requested SA design items

| ID | Need | Notes / questions |
|---|---|---|
| SA-AS-01 | **Setting store and API**: per document type `requireApproval` (11 types; seed Quotation off, others on), `version`, `updated_at`, `updated_by`(+ name snapshot). `list` (readable by any user who can save/approve the document, and `approval-setup:VIEW`), `update({ type, requireApproval, expectedVersion })` with `approval-setup:EDIT` + CSRF. | Q-AS-20 (show last change later) |
| SA-AS-02 | **Turn-OFF guard**: refuse atomically while any non-deleted document of the type is `PENDING_APPROVAL` or `REVISION_REQUESTED`; race-safe against concurrent Saves (lock order / single statement); error with counts. Turn ON has no precondition. | Q-AS-12, Q-AS-13 |
| SA-AS-03 | **Save path when OFF** for the seven engine documents: create/update ends `APPROVED` and runs today's `approve()` effects (Reserve hold, Memo Stock, Memo Out cut, Memo Out Return back to stock, PO items to Purchase, Purchase stock deduction) in the same transaction; failures refuse the Save. Afterwards the existing APPROVED rules apply (read-only, not deletable). | Q-AS-21, Q-AS-22 |
| SA-AS-04 | **Quotation when ON**: create → `PENDING_APPROVAL`, existing `quotation.approve`; Revise/Reject per ADR-0046 extended to Quotation; edit-after-approval rule. | Q-AS-14 |
| SA-AS-05 | **Waiting counts for Setup**: `PENDING_APPROVAL` + `REVISION_REQUESTED` per type, one bounded call, for `approval-setup:VIEW` (extend `approval.summary` or a setup read). | Q-AS-16 |
| SA-AS-06 | **Approve Center follows settings**: `approval.summary`/`pending` exclude or mark types turned OFF; Quotation becomes an approval type when ON (ADR-0046 registry). Frontend FE-AS-009 replaces approve-center's hard-coded Quotation "off" (Q-AP-06). | coordinate with approve-center phase 2 (BE-AP-*, FE-AP-009…011) |
| SA-AS-07 | **Auth catalog leaf** `approval-setup` (SETUP section, VIEW/EDIT, after `document-setup`); catalog stays ≤ 64 leaves (42 → 43). Grant migration: none by default (Super Admin only until granted). | Q-AS-09 |
| SA-AS-08 | **Soft delete / Restore interplay** when OFF (ADR-0045). | Q-AS-13 |
| SA-AS-09 | **Document pages contract**: how pages learn the setting (part of `get`/create response or the settings list) so Save/Approve buttons and confirm texts follow it (FE-AS-010). | — |
| SA-AS-10 | **Future inventory documents** (Load to Stock, Merge/Split, Transfer Location) adopt the setting when built (ADR-0046 D8 style). | Q-AS-04 |

- Expected output and acceptance criteria: SA bundle (decisions, api-contract, architecture, authorization, database-diagram, sequence-diagram, error-handling, testing), ADR draft, backend TODO items BE-AS-* in the central TODO, presented for one owner approval.
- Verification completed / not run: none (documents only).
- Blocking item: owner approval of UI rev 1 (or explicit SA instruction); owner answers to the requires-SA questions.
- Resume action and destination: SA → owner review → (when the owner allows backend) backend → frontend FE-AS-008…011.
- Corrective work ID / ledger: not applicable (new feature).
- Existing pass limit / allocated passes / active pass: not applicable.
- Changed evidence justifying this handoff: new owner request 2026-11-09.
- Concrete receiving-role output / next fact needed: owner answers to Q-AS-12/13/14/21/22 and the setting store decision.
- Stop reason / terminal outcome: none.
