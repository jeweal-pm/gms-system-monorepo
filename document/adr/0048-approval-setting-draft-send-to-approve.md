# ADR-0048: Approval settings per document type, Draft → Send to approve, and edit-until-used when approval is off

- Status: Accepted (2026-11-10)
- Date: 2026-11-10
- Feature / source UI revision: `approval-setup` / UI revision 1 (approved 2026-11-09), phase 2; `approve-center` / UI revision 1
- SA revision: 1 (decisions with the owner's answers of 2026-11-10; the service bundle follows approval of this ADR)
- Deciders: project owner
- Approval evidence: owner chat 2026-11-10 "อนุมัติ ADR-0048" (with "Q-AS-23 ถูก" and Draft grey); answers to Q-AS-23…33 recorded below. The owner has not asked for implementation yet ("ยังไม่ต้องเริ่มทำ").
- Owner request (2026-11-10, with 4 images: Approval setup page, Approve › Reserve with the Revise dialog, the Reject dialog, the Daybook panel): "Approval เป็นหน้าสำหรับตั้งค่าได้ว่าหน้านั้นจะมี approve หรือไม่ — ถ้ามีจะมีปุ่ม send to approve … แทนปุ่ม approve … แก้ไขเท่าไหร่ก็ได้ก่อนกด send to approve เมื่อกดแล้วจะแก้ไขไม่ได้จนกว่าคนมีสิทธิ์ approve จะกด approve หรือ revise หรือ reject; revise ได้ 1 ครั้ง … ส่งกลับมาใหม่ เลือกได้ว่า approve หรือ reject; reject คือไปทำใบใหม่ — ถ้าไม่มี approve กด save คือเริ่มทำรายการเลย edit ได้จนกว่าของในรายการจะถูกนำไปทำในหน้าอื่น จะ edit/delete ไม่ได้แล้ว — daybook ในทุกหน้าต้องเปลี่ยนใหม่ … ถ้าไม่มี approve เป็นเขียวหมด. ออก adr มาถามคำถาม เริ่มออกแบบ ยังไม่ต้องเริ่มทำ"
- Supersedes / related ADRs: amends [ADR-0046](0046-approval-review-status-and-approve-center-api.md) (D1 status model, D4 permissions, D7 editability, the "no DRAFT" alternative; not yet implemented, so both ship together); amends [ADR-0045](0045-transaction-document-soft-delete.md) D2 (deletable set); amends the permission catalog of [ADR-0016](0016-per-user-menu-action-permissions.md)/[ADR-0020](0020-username-login-and-permission-matrix-v2.md); extends [ADR-0033](0033-memo-documents-in-master-service.md), [ADR-0034](0034-memo-receive-approval-and-memo-stock.md), [ADR-0036](0036-reserve-document.md), [ADR-0041](0041-purchase-order-document.md), [ADR-0042](0042-purchase-document-and-stock-deduction.md), [ADR-0043](0043-purchase-merged-memo-stock-line.md)
- Frontend: [TODO approval-setup](../task/todo/approval-setup.md) FE-AS-008…011, [TODO approve-center](../task/todo/approve-center.md) FE-AP-009…011; SA handoff [approval-setup-sa](../coordination/handoffs/approval-setup-sa.md) (SA-AS-01…10)

## Context

Today the eight transaction documents (Quotation, Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase Order, Purchase) go **Save → `PENDING_APPROVAL` → Approve → `APPROVED`**. A pending document is editable and deletable; the document page has an Approve button; stock and Memo Stock change only inside `approve()`; an approved document is read-only and not deletable. Quotation is saved approved and stays editable. Every catalog leaf has an APPROVE action. ADR-0046 (accepted 2026-11-07, backend on hold) adds Reject (`REJECTED`) and Revise (`REVISION_REQUESTED`) and the Approve Center API, and keeps Pending editable (D7). The Approval setup page (phase 1) only previews local switches.

The owner's rule (2026-11-10) changes three things:

1. **Approval ON**: Save keeps an **editable draft**. **Send to approve** replaces the document page's Approve button. After sending, the document is **locked** until an approver chooses Approve, Revise or Reject. **Revise is allowed once**; after the resubmit the approver can only Approve or Reject. Reject is final ("make a new document").
2. **Approval OFF**: Save **starts the transaction at once**. The document can be **edited and deleted until its items are used by another page**; after that it is locked.
3. **Daybook** on every document page shows each document's progress; with approval OFF every entry is green.

## Decision

**D1 — Setting store.** New table `partner.approval_setting` in `backend-api-master`: one row per document type key (11: the 8 above + `load-to-stock`, `merge-split`, `stock-transfer-location`, inactive until those pages exist), `require_approval boolean`, `version`, `updated_at`, `updated_by`, `updated_by_name`. Seed: Quotation off, others on. Router `approvalSetting.list` (any user with VIEW on that document, or `approval-setup:VIEW`) and `approvalSetting.update({ type, requireApproval, expectedVersion })` (`approval-setup:EDIT` + CSRF).

**D2 — Status model with approval ON** (all 8 types, Quotation included):

```
Save ─► DRAFT ──Send to approve──► PENDING_APPROVAL ──Approve──► APPROVED (read-only)
          (edit / delete)               │  (locked)
                                        ├──Reject (reason required)──► REJECTED (final)
     REVISION_REQUESTED ◄──Revise (reason required, once)
     (edit / delete, Send to approve again → PENDING_APPROVAL; then Approve or Reject only)
```

- `DRAFT` is new for the 7 engine documents (Quotation already has it). Drafts are not in Approve and not counted as waiting.
- `PENDING_APPROVAL` is **locked**: no update, no delete (supersedes ADR-0046 D7).
- `submit` (Send to approve) works from `DRAFT` and `REVISION_REQUESTED`, runs the normal save validation and sets `submitted_at/by/name`. Allowed with `<menu>:ADD` **or** `<menu>:EDIT` + CSRF (Q-AS-25). It replaces ADR-0046 `resubmit`.
- `requestRevision` is refused after one revise: header column `revision_count smallint NOT NULL DEFAULT 0 CHECK (revision_count BETWEEN 0 AND 1)`; error `<CODE>_REVISE_LIMIT`. Reject and Approve stay available.
- **Revise and Reject both require a reason** (1–500 characters) (Q-AS-32). The Reject dialog field is "Reason for reject".
- **The document page has no Approve button** (Q-AS-23): its actions are Save, **Send to approve**, Edit and Delete (Edit / Delete only while the document is `DRAFT` or `REVISION_REQUESTED`, or auto-approved and not used under D4). Approve / Revise / Reject are done in the Approve menu; the document no. there opens the document read-only.
- **Approved is read-only for every type, Quotation included** (Q-AS-28).
- Stock rules are unchanged: drafts and pending documents hold nothing; `approve()` re-checks and moves stock under lock. The maker may approve their own document if granted (Q-AS-31).

**D3 — Permissions** (Q-AS-23 "เอา approve ใน user permission ออก", Q-AS-33). Direction set by the owner on 2026-11-10 with [source 04](../apps/frontend/approval-setup/source/04-user-approve-field.jpg); **not part of this revision's work** ("ยังไม่ต้องแก้ บอกไว้ก่อน"):

- The APPROVE column leaves the permission matrix. Instead, the user form's Personal Information gets an **Approve** multi-select of the approval types (Quotation, Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return, Purchase Order (PO), Purchase, …). Choosing a type lets the user see that type's waiting list, open its documents read-only, and Approve / Revise / Reject.
- Existing `<doc>:APPROVE` grants become the user's initial Approve selection, so no approver loses the right.
- The storage and the User Permission UI revision are designed later (user-permission UI revision + SA). Until then the backend keeps checking `<menu>:APPROVE`, and this ADR's procedures use that check behind one helper (`canApprove(user, type)`) so the later change touches one place.
- New leaf `approval-setup` (SETUP, VIEW/EDIT, after Decimal Setup), no default grant; it is part of this revision.

**D4 — Approval OFF: Save = approved, editable until used.**

- Create and update end in `APPROVED` and run today's `approve()` effects in the same transaction; if those checks fail, the whole Save is refused with the Approve error. The header records `auto_approved = true`.
- An auto-approved document stays **editable and deletable until it is used**. An edit **reverses the previous effects and applies the new ones** in one transaction under the approve locks. A delete **reverses the effects and soft-deletes** (ADR-0045): the items it brought in disappear with it (Q-AS-27). Either is refused with `<CODE>_IN_USE` when the document is used.
- "Used" per type (owner confirmed 2026-11-10):

| Type | Used when |
|---|---|
| Quotation | a later document references it (none exists yet → always editable) |
| Reserve | its held lines are sold (Sale page not built → not yet) |
| Memo Receive | any of its Memo Stock rows has returned, reserved, memo-out, sold or purchased quantity > 0 |
| Memo Return | nothing references it; reversal re-checks the Memo Stock balance |
| Memo Out | any Memo Out Return line references its lines |
| Memo Out Return | the returned quantity was taken again (reversal would break a stock balance CHECK) |
| Purchase Order | any line has purchased > 0 |
| Purchase | Load to Stock references it (not built → not yet); reversal re-checks Memo Stock |

- A document approved through review (`auto_approved = false`) stays read-only.

**D5 — Switching a type.** `update` locks the setting row (`SELECT … FOR UPDATE`); every document create/update/submit reads it `FOR SHARE` in its own transaction, so a Save follows the setting committed at that moment. Turning **OFF** is refused (`APPROVAL_SETTING_HAS_WAITING`, with counts) while any non-deleted document of the type is `PENDING_APPROVAL` or `REVISION_REQUESTED`. **Drafts do not block**: with approval OFF the next Save of a draft approves it (Q-AS-24). Turning **ON** has no precondition; auto-approved documents keep their edit-until-used rule.

**D6 — Daybook: one row per document, latest status** (Q-AS-29, Q-AS-30). No new table. Each document's `list` (newest first, existing pagination, `<menu>:VIEW`) adds `status`, `reviewNote` (latest Revise/Reject reason) and `reviewAction` from the ADR-0046 header columns. Dot colors:

| Status | Dot | Text under the party |
|---|---|---|
| Draft | grey | none |
| Pending approval | orange | none |
| Revise (sent back) | orange | the revise reason |
| Approved (incl. approval OFF) | green | none |
| Rejected | red | the reject reason |

**D7 — Existing documents** (Q-AS-26). At go-live a one-time backend command approves every existing `PENDING_APPROVAL` document through the normal `approve()` (stock effects included), oldest first, in each environment's database (dev now). A document that cannot be approved (e.g. stock short) is **soft-deleted** (ADR-0045, reason "not approvable at go-live") and listed in the command output (owner 2026-11-10 "ลบเลย"). Approved documents get `auto_approved = false`; `revision_count = 0`.

## Questions for the owner

| ID | Question | Default | Answer (2026-11-10) |
|---|---|---|---|
| Q-AS-23 | Approve button on the document page | none | **No button; also remove Approve from User Permission** → D2, D3 |
| Q-AS-24 | Unsent drafts when turning OFF | don't block; next Save approves | **Yes** |
| Q-AS-25 | Who may Send to approve | Edit | **Users with Create and users with Edit** |
| Q-AS-26 | Pending documents at go-live | stay Pending | **Approve them all in the database** → D7 |
| Q-AS-27 | "Used" table, edit changes stock | as table | **Yes; a delete removes its items too** |
| Q-AS-28 | Approved under ON editable until used? | read-only | **Read-only** |
| Q-AS-29 | Daybook per action or per document | per action | **One row per document, latest status** (the repeated RS2611002 in the image is a design slip) |
| Q-AS-30 | Draft / Revise colors | Draft grey | **Draft orange without text**, then (after the Draft/Pending explanation) **Draft grey** |
| Q-AS-31 | Maker approves own document | yes | **Yes, as today** |
| Q-AS-32 | Reject field label / required | "Reason for reject", required | **Yes; reason required for both Reject and Revise** |
| Q-AS-33 | Approve permission after removing APPROVE from the document rows | APPROVE section, one row per type | **An "Approve" multi-select of document types on the user form ([source 04](../apps/frontend/approval-setup/source/04-user-approve-field.jpg)); not to be changed yet** → D3 |

Follow-up answers (2026-11-10): Q-AS-23 — the Edit and Delete buttons stay; Q-AS-26 — documents that cannot be approved at go-live are deleted; Q-AS-27, Q-AS-28 — confirmed; Q-AS-29/30 — the owner asked whether Draft and Pending are the same (answered in chat: Draft = saved, not sent, editable; Pending = sent, locked; Draft then becomes grey, owner 2026-11-10 "Draft เป็นสีเทา"; Q-AS-23 Edit/Delete rule confirmed "ถูก").

## Alternatives

- **Keep ADR-0046 D7 (Pending editable, no Draft)**: rejected — the owner wants editing before sending and a lock after.
- **Draft as a flag on Pending** (`sent_at` null): rejected — every count, index and guard would need the flag.
- **Revise limit from a history scan**: rejected — a counter column is checked under the row lock.
- **Approval OFF = read-only after Save**: rejected — the owner wants edit/delete until used.
- **Daybook from an activity table**: rejected by the owner (one row per document); the list already has what it needs.
- **An APPROVE section with one matrix row per type**: proposed first, replaced by the owner's multi-select field (source 04); both keep per-type control.
- **Setting in the auth service or an env variable**: rejected — the setting governs master's Save transaction and must be read under the same lock.

## Consequences and capacity

- Master migration: `approval_setting` (11 rows) and, on 7 headers, `DRAFT` in the status CHECK, `revision_count`, `auto_approved` (+ ADR-0046's columns). Auth: catalog leaf `approval-setup` only (the Approve multi-select comes later, D3). One-time approve command (D7). Deploy auth, master, the command, then frontend. Rollback: drafts map to `PENDING_APPROVAL`; copied grants map back.
- Behaviour change for every document page (Save / Send to approve, lock while Pending, Daybook colors), the Approve Center (Revise disabled after one revise, OFF types shown off), User Permission (later: Approve multi-select instead of the APPROVE column) and the Approval setup page (persisted switches).
- Edit/delete with reversal (D4) is the largest risk: each type needs a reverse function tested against every balance CHECK; it reuses the approve locks.
- Capacity (4 GB / 2 vCPU): one extra indexed single-row read per Save; Daybook reuses the paginated list; no cache, worker, polling or new container. Pools unchanged.
- No package, service, container, network or storage change; [tech-stack.md](tech-stack.md) unchanged; no infra or devops routing.

## Acceptance and approval

- On approval, SA adds the service bundle under `document/apps/backend/master/approval-setup/` (api-contract, database-diagram, sequence-diagram, authorization, error-handling, testing) and BE-AS-* items in the central TODO, and updates FE-AS-008…011, approve-center and the document-page items.
- Accepted 2026-11-10. Bundle: [approval-setup service documents](../apps/backend/master/approval-setup/architecture.md) (SA revision 1). Backend and frontend code start only when the owner says so.
