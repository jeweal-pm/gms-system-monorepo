# Open questions and conflicts: vendor

- Feature ID / UI revision: `vendor` / 3 (revision 1 questions below; [revision 3 notes](#revision-3-adr-0021-2026-10-16) at the end)
- Status: answered 2026-10-15 (UI revision 2). Owner answers: **Q-VEN-01** labels as Customer; **Q-VEN-02** Phone optional (as Customer); **Q-VEN-03** " default ไม่ต้องติ๊ก" = a default invoice address is **not required**: new items start unchecked, the user may tick at most one (ticking another moves it), it can be unticked, and saving with none is valid (the S4 red frame is not used). Q-VEN-04/05/06: documented defaults.
- Source: [four unique screenshots](source/) (see [ui-spec.md](ui-spec.md#source-and-evidence)); pattern [customer UI rev 1](../customer/ui-spec.md) (approved 2026-10-14)
- Central TODO: [vendor.md](../../../task/todo/vendor.md)

The customer answers (Q-CUS-01…06) are reused: US/TH phone codes, Delete in the toolbar, "Edit …" title +
"Save", tab placement after a related tab, the responsive proposal, Default badge `#22C55E` on `#C1EFD2`.
The questions below are new. Q-VEN-02 and Q-VEN-03 change the data rules, so SA needs them before
writing the `vendor.*` contract; the others have defaults that frontend builds unless the owner says otherwise.

## Questions for the owner

| ID | Blocks | Question | Default if unanswered | TODO IDs |
|---|---|---|---|---|
| Q-VEN-01 | no | The images use different labels: "Default Currency" / "Currency", "First Name" / "First name", "Name/Company Name" / "Company Name". Which wording do you want? | Same as Customer: **"Currency"**, **"First name"**, **"Name/Company Name"** | FE-VEN-004, 005 |
| Q-VEN-02 | SA contract | Is **Phone No. required** for a vendor? S3 shows the error "Phone No. is required", but the label has no `*` in any image, and Phone is optional for customers. | **Optional** (as Customer); the S3 phone error is treated as a format error example | FE-VEN-005, 007; SA-VEN-03 |
| Q-VEN-03 | SA contract | **Default address.** S2/S4 show the only address with the default box **unchecked** and no "Default" badge, and S4 shows its frame red without any field error. Should the user be able to have no default (and get an error on submit), or should it work like Customer (the first address is the default automatically and the default can't be unchecked)? | **Like Customer**: #1 is default automatically; the default can't be unchecked; removing the default makes #1 the default. S2/S4 states can't happen. | FE-VEN-006, 007; SA-VEN-03 |
| Q-VEN-04 | no | Drawer second line: the design shows "V-0001 · Sample Vendor A Co., Ltd." For Customer you decided the bold line is Name and the second line is Code Name only. Same for Vendor, or "Code Name · invoice company name"? | **Same as Customer** (Code Name only) | FE-VEN-008; SA-VEN-02 |
| Q-VEN-05 | no | Setup tab position for **Vendor**. Proposal: right before "Customer" (same order as the sidebar Partner Master group). | As proposed | FE-VEN-002 |
| Q-VEN-06 | no | Is Vendor missing anything Customer has, or does it need extra fields (payment terms, bank account, vendor type…)? None are in the images. | No extra fields; exactly the fields in the images | all |

## Conflicts and notes for SA / parent

| ID | Observation | Handling | Affected IDs |
|---|---|---|---|
| A-01 | ADR-0018 §1 says `backend-api-partner` will own Vendor "in the future" but defines only Customer's model, API, errors and limits | SA decides whether this needs a new ADR (proposed ADR-0019 "Vendor master") or an ADR-0018 revision. The UI assumes `vendor.*` mirrors `customer.*` without Shipping. | SA-VEN-01 |
| A-02 | Currency/Country options are the same lists for both entities | SA chooses `vendor.options` or a shared partner options procedure; the UI accepts either | SA-VEN-04 |
| A-03 | The customer page components are typed to the customer form, so Vendor can't use them directly, and copying is not allowed | FE-VEN-001 extracts them to `frontend/src/features/partner/` and moves customer onto them. Touches the customer feature (regression check TC-VEN-20). | FE-VEN-001 |
| A-04 | ADR-0018 says future Quotation/Sale documents must store their own copy of the customer's name, because delete is permanent. Purchase documents will reference vendors. | SA decides whether Vendor delete is also permanent and records the same rule for PO/Purchase | SA-VEN-05 |
| A-05 | Duplicate icon is grey in S1 (draft mode) | Matches the customer rule (enabled only for a loaded saved record) | FE-VEN-003 |

## Revision 3 (ADR-0021), 2026-10-16

ADR-0021 decides the header, modes, required Code Name with `V001` suggestions and the drawer row for Vendor too.
It **supersedes Q-VEN-04**: the bold first line is the Code Name and the second line is the Name only (owner:
"SAMPLE_VENDOR_A คือ codename V-0001 · Sample Vendor A Co., Ltd. คือ name").

The open UI-detail questions are shared with Customer and listed once in
[customer open questions, revision 2](../customer/open-questions.md#revision-2-adr-0021-2026-10-16): Q-CUS-07
(code-taken replacement copy), Q-CUS-08 (Cancel in create mode), Q-CUS-09 (no hint when `nextCode` fails),
Q-CUS-10 (legacy rows without a code), A-07 (no test runner; FE-VEN-018 blocked). None blocks; the defaults are built.

## Revision 4 (draft row and address card), 2026-10-16

Shared with [customer revision 3](../customer/open-questions.md#revision-3-draft-row-and-address-card-2026-10-16):
the draft row title is always "New vendor"; P-07 (collapsed "Has errors" tag) no longer applies; #1 trash is shown
disabled (A-09); automated tests wait for a runner (A-11; FE-VEN-R4-005 blocked).

Vendor-specific note: the vendor default rule is unchanged (0 or 1 default, ADR-0019 / Q-VEN-03 as implemented in
revision 2). A new vendor starts with #1 **unchecked**, which matches rev4-01; ticking one unticks the others and the
ticked one can be unticked. No new question.
