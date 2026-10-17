# Frontend TODO: company-profile

- feature-id: `company-profile`
- revision: **3** (owner redesign 2026-10-17; revision 2 items below remain the base)
- status: in-progress — UI revision 3 and SA revision 3 implemented (unit tests, typecheck, lint pass); browser check and security reviews pending (FE-CP-017)
- sa-revision-3-approval: owner 2026-10-17 "อนุมัติ company-profile SA revision 3" ([decisions](../../apps/backend/partner/company-profile/decisions.md))
- rev3-approval-evidence: owner 2026-10-17 "design หน้า company profile เปลี่ยน ช่วยแก้แบบ companyprofile ให้หน่อยเอาแบบในรูปนะ" + answers (Road/Street "เพิ่มจริง ทำ SA + backend"; City/State "ทำหน้าตาแบบ dropdown แต่ยังพิมพ์เองได้"; Bank "เปลี่ยนเป็นข้อความธรรมดา"; Terms "เอาออกจากหน้า เอาออกจาก schema ด้วย…"). Instruction to implement the supplied design = UI revision 3 approval; it does not approve SA revision 3.

## Revision 3 items (2026-10-17)

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Verification |
|---|---|---|---|---|---|---|---|
| [ ] | FE-CP-013 | implemented, browser not run | frontend | R3-01/02/06/09: logo left column, section titles in the form column, notched labels, "Company Currency"/"Select", checkbox "Need to show on invoice" | page, `components/profile-section.tsx` | UI rev 3 | UT-CP-F32; typecheck/lint pass |
| [ ] | FE-CP-014 | implemented, browser not run | frontend | R3-03: 200 px logo tile, uploading spinner state, `object-contain` | `components/logo-upload-tile.tsx` | UI rev 3 | UT-CP-F36…F38 |
| [ ] | FE-CP-015 | implemented, browser not run | frontend | R3-04/05 (UI part): Address No.1/No.2 labels; City before State with chevron, free text (`TextField` `endIcon`) | page, `schema.ts` (field order), `components/ui/outlined-field.tsx` | UI rev 3 | UT-CP-F33…F35, F39 |
| [ ] | FE-CP-016 | implemented, browser not run (Tiptap removed; lockfile updated in the frontend container) | frontend | Road/Street field (Road/Street │ Country row); Bank Details `<textarea>` (plain text ≤ 5,000); remove Terms section/fields; remove `rich-text-field.tsx` + Tiptap packages (via integration owner); update api/schema/tests | page, `api.ts`, `schema.ts`, `components/**`, `frontend/test/**`, `frontend/package.json` + lockfile (parent) | SA-CP-12…18 approved + BE-CP-011…014 | unit tests, typecheck, lint |
| [x] | BE-CP-011 | done (2026-10-17): migration applied in dev; conversion dry-run verified | backend | Prisma + migration: add `road_street`; `bank_details` JSONB → TEXT with conversion (SA-CP-14); drop `terms`, `show_terms_on_invoice` | `backend-api-partner/prisma/**` | SA rev 3 | migrate in dev |
| [x] | BE-CP-012 | done (2026-10-17): partner 253 tests pass, typecheck + lint pass | backend | Partner schemas/service/mapper: `roadStreet`, plain `bankDetails`, remove terms; delete `rich-text.ts` | partner `src/company-profile/**`, `test/company-profile/**` | BE-CP-011 | unit tests |
| [x] | BE-CP-013 | done (2026-10-17): gateway 210 tests pass, typecheck + lint pass | backend | Gateway schemas/router: same contract; delete `src/trpc/rich-text.ts` | gateway `src/trpc/**`, `test/company-profile/**` | BE-CP-012 | unit tests |
| [x] | BE-CP-014 | done: frontend integrated in the same session | backend → frontend | Handoff of the verified rev 3 contract | — | BE-CP-013 | — |
| [ ] | FE-CP-017 | security done 2026-10-17 (source: HEAD `2bcf7b2` + same uncommitted working tree, no edits between the two reviews): **sec-auditor `clear`**; **security-auditor `advisory`** — no confirmed issue, hardening ticket [INV-20261017-001](../investigation/INV-20261017-001-company-profile-bank-details-migration-length-unit.md) (owner backend, pending owner review, does not block). Browser check pending | frontend → security | Browser check of rev 3; sec-auditor + security-auditor scoped review of the final rev 3 diff | none | FE-CP-016 | testing.md |
- source: six owner-supplied screenshots (2026-10-16) in [source/](../../apps/frontend/company-profile/source/)
- owner-request: 2026-10-16 "uxui ทำ spec Company profile ให้หน่อย" (request for the spec, not approval)
- ui-spec: [ui-spec.md](../../apps/frontend/company-profile/ui-spec.md)
- dependencies: [dependencies.md](../../apps/frontend/company-profile/dependencies.md) (DEP-CP-01 Tiptap 3.31.4 and DEP-CP-02 libphonenumber-js 1.13.14: approved and installed)
- backend-bundles: SA revision 2 **approved** (revision 1 + owner storage change): [decisions](../../apps/backend/partner/company-profile/decisions.md), [architecture](../../apps/backend/partner/company-profile/architecture.md), [api-contract](../../apps/backend/partner/company-profile/api-contract.md), [database](../../apps/backend/partner/company-profile/database-diagram.md), [sequences](../../apps/backend/partner/company-profile/sequence-diagram.md), [authorization](../../apps/backend/partner/company-profile/authorization.md), [errors](../../apps/backend/partner/company-profile/error-handling.md), [dependencies](../../apps/backend/partner/company-profile/dependencies.md), [testing](../../apps/backend/partner/company-profile/testing.md), [ADR-0021](../../adr/0021-company-profile-in-partner-service.md) (accepted), infra [backend-api-partner/2](../../infra/services/backend-api-partner/2/security.md)
- sa-revision: 2; sa-approved-revision: 2; sa-approval-evidence: owner 2026-10-16 ≈12:00 +07:00: "บันทึกลงใน folder ใน backend เลยเมื่ออัพรูปใหม่ไปจะไปทับรูปเก่า  logic นี้ แค่ module company profile เท่านั้น  อนุมัติ company-profile SA revision 1"
- approved-revision: 2 (revision 1 + the owner's answers in the same instruction)
- approved-by: owner (developer-07-jeweal)
- approved-at: 2026-10-16T11:00+07:00 (approximate)
- approval-evidence: "Phone ให้ลง lib ที่นายแนะนำเลยเอาที่เขาใช้กันทั่วไป 10 MB โลโก้พื้นเทาคือโหมดอ่านอย่างเดียว ส่วนพื้นขาวที่มีปุ่มถังขยะคือโหมดแก้ไข ปุ่ม Print และ Excel ปิดไว้ก่อน / อนุมัติ company-profile revision 1". Answers: Q-CP-02 → PhoneField validated with libphonenumber-js (DEP-CP-02); Q-CP-04 → logo ≤ 10 MB; Q-CP-03 and Q-CP-07 defaults confirmed; Q-CP-05 not answered → Tiptap default (stated before approval); other questions take their defaults.
- review-bundle: [ui-spec](../../apps/frontend/company-profile/ui-spec.md), [open questions](../../apps/frontend/company-profile/open-questions.md), [design system](../../apps/frontend/company-profile/design-system.md), [conventions](../../apps/frontend/company-profile/conventions.md), [form guidelines](../../apps/frontend/company-profile/form-guidelines.md), [data fetching](../../apps/frontend/company-profile/data-fetching.md), [error handling](../../apps/frontend/company-profile/error-handling.md), [dependencies](../../apps/frontend/company-profile/dependencies.md), [testing](../../apps/frontend/company-profile/testing.md), [flow](../../diagram/company-profile-flow.md), [source](../../apps/frontend/company-profile/source/)
- updated-at: 2026-10-16T10:30+07:00

## Implementation items

Nothing starts before the owner approves UI revision 1. FE-CP-001…008 and 011 are independent UI work. FE-CP-007 also needs DEP-CP-01 approved (or the Markdown alternative chosen). FE-CP-009/010 need an approved SA bundle and backend delivery.

| Done | ID | Status | Owner | Task / component | Allowed files | Depends on / requires-sa | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|---|
| [ ] | FE-CP-001 | implemented, browser not run | frontend | **Route + navigation**: `/setup/company-profile` in `AppShell` (crumbs Home › Setup › Company Profile); Setup tile → new route; remove `company-profile` from `setupOwnedPlaceholders` | `frontend/src/app/setup/company-profile/page.tsx` (new), `frontend/src/features/setup/setup-destinations.ts`, `frontend/src/features/home/navigation.ts` | UI approval | Tile opens the page; Setup active; `/modules/company-profile` still renders the old placeholder catalog entry only if linked elsewhere | TC-CP-01 |
| [ ] | FE-CP-002 | implemented, browser not run | frontend | **Layout**: header (sticky, Q-CP-08), `ProfileSection` label/form columns, dividers, section order | `frontend/src/features/company-profile/company-profile-page.tsx`, `components/profile-section.tsx` (new) | FE-CP-001 | Matches S1/S2 within ±4 px of the estimates | TC-CP-04 |
| [ ] | FE-CP-003 | implemented, browser not run | frontend | **Header + modes**: Setup / View / Edit button states; Print/Excel disabled "Not available yet" (DV-03); Refresh | page, `PartnerPageHeader` (extend props only if needed) | FE-CP-002 | Button states per D-03 | TC-CP-02, 03 |
| [ ] | FE-CP-004 | implemented, browser not run | frontend | **General Information** fields + Zod schema (Phone via `PhoneField`, validated with libphonenumber-js `isValidPhoneNumber`, DEP-CP-02) | `features/company-profile/schema.ts` (new), page | FE-CP-002 | Rules per form-guidelines; blur-then-change timing | TC-CP-05, 06 |
| [ ] | FE-CP-005 | implemented, browser not run (local placeholder option lists until FE-CP-009) | frontend | **Address + Currency**: partner address pattern (Country select, State/City free text gated); Currency select labelled "Currency" (DV-01) | page, schema | FE-CP-002; options source from SA (local fixture until then) | Gating and reset behaviour; options load/error states | TC-CP-07, 08 |
| [ ] | FE-CP-006 | implemented, browser not run (client checks only) | frontend | **LogoUploadTile**: empty / uploaded-view (grey) / uploaded-edit (white + trash) / uploading / error; JPEG/PNG + size check; object-URL preview cleanup | `components/logo-upload-tile.tsx` (new) | FE-CP-002; size limit **10 MB** (owner) | S1, S4–S6 states; keyboard operable | TC-CP-09…12 |
| [ ] | FE-CP-007 | implemented (value = editor JSON, SA-CP-03), browser not run | frontend | **RichTextField** ×2 + invoice-preview checkboxes: toolbar groups, active state (S3), link URL safety, read-only (disabled toolbar) | `components/rich-text-field.tsx` (new); `frontend/package.json` + lockfile via the integration owner | DEP-CP-01 approval (or Markdown alternative), FE-CP-002 | Toolbar per S2/S3; output only allowed formatting | TC-CP-13…15 |
| [ ] | FE-CP-008 | implemented, browser not run (Cancel/Refresh dialog + browser unload prompt; sidebar links are not intercepted, same as the partner pages) | frontend | **Unsaved changes**: discard dialog on Cancel/Refresh/in-app navigation; `beforeunload` | page; reuse `DiscardChangesDialog` | FE-CP-003 | As partner pages | TC-CP-16 |
| [ ] | FE-CP-009 | implemented, browser not run (get/options/save/removeLogo via tRPC, logo upload/GET via REST; conflict dialog; logo step failure keeps saved fields) | frontend | **Data wiring**: get / upsert / logo / options; error mapping; conflict dialog; toasts | `features/company-profile/{api,hooks}.ts` (new), page | approved SA bundle + backend | Per data-fetching and error-handling | TC-CP-17, 18 |
| [ ] | FE-CP-010 | implemented, browser not run: VIEW gate; `canEdit = access.edit` (SA-CP-07) | frontend | **Permissions**: `permission.mine` gate for `company-profile` (VIEW/EDIT per SA) | page | SA action keys | Denied / read-only states | TC-CP-19 |
| [ ] | FE-CP-011 | implemented, browser not run | frontend | **Responsive** per ui-spec table | files above | FE-CP-002…007 | No horizontal scroll at the listed widths | TC-CP-20 |
| [x] | FE-CP-012-UT | done (2026-10-16) | frontend | Unit tests in `frontend/test/company-profile/` (UT-CP-F01…F31, 40 pass) | `frontend/test/**`, `frontend/vitest.config.mts`, `frontend/package.json` | owner request | pass | [testing](../../apps/frontend/company-profile/testing.md) |
| [ ] | FE-CP-012 | in progress: typecheck + lint pass; build not completed in the agent environment (Windows 0xc0000142); browser/manual not run | frontend → manual-tester | **Verification**: typecheck, lint, build, browser cases, security reviews (file upload + rich text) | none | all | Results recorded in testing.md | testing.md |

## Backend items (SA revision 2, approved 2026-10-16)

| Done | ID | Status | Owner | Task | Allowed files | Depends on | Acceptance criteria | Verification |
|---|---|---|---|---|---|---|---|---|
| [x] | BE-CP-001 | done (2026-10-16) | backend | Prisma model `CompanyProfile` (logo metadata columns, no logo table) + migration with CHECKs | `backend-api-partner/prisma/**` | SA approval | database-diagram.md | BT-CP-16 |
| [x] | BE-CP-002 | done (2026-10-16) | backend | Rich-text JSON schema (shared shape gateway/partner), length/depth/node limits | partner `src/company-profile/rich-text.ts`, gateway `src/trpc/company-profile-schemas.ts` | BE-CP-001 | SA-CP-03 | BT-CP-06 |
| [x] | BE-CP-003 | done (2026-10-16) | backend | Partner module: GET/PUT profile, options, optimistic version, actor | partner `src/company-profile/**`, `src/app.module.ts` | BE-CP-001/002 | api-contract internal routes | BT-CP-01…05, 11 |
| [x] | BE-CP-004 | done (2026-10-16) | backend | Partner logo GET/PUT/DELETE: route-specific raw parser 10 MB, signature check, sha256; **file** `storage/company-profile/logo` overwritten via temp + rename under the row lock; metadata + version | partner `src/company-profile/**`, `src/main.ts` | BE-CP-003 | SA-CP-04…06 | BT-CP-07…10 |
| [x] | BE-CP-005 | done (2026-10-16) | backend | Gateway `companyProfile` tRPC router (get, options, save, removeLogo) with `company-profile:VIEW/EDIT` | gateway `src/trpc/{router,company-profile-schemas,partner-client}.ts` | BE-CP-003 | api-contract tRPC table | BT-CP-12, 15 |
| [x] | BE-CP-006 | done (2026-10-16) | backend | Gateway REST logo GET/PUT: shared request context, streaming byte limit, Origin check, cache headers | gateway `src/{request-context,company-profile-logo.controller,main,app.module}.ts` | BE-CP-004/005 | api-contract REST table | BT-CP-13, 14 |
| [x] | BE-CP-007 | done: typecheck + lint pass (partner, gateway); migration applied in dev; BT-CP-01…11 pass (23 checks); build not run | backend | Checks: typecheck, lint, build (partner + gateway), migrate in dev, BT cases | none | all | testing.md results recorded | testing.md |
| [x] | BE-CP-009 | done in config; dev verified (volume created, file written/overwritten/removed in the volume, not in git); production image not built (S2-1 not run) | infra (parent) | Volume `partner-storage` in `docker-compose.yml`, storage folder in `backend-api-partner/Dockerfile`, `.gitignore` + `.dockerignore` for `backend-api-partner/storage/` | `docker-compose.yml`, `backend-api-partner/Dockerfile`, `.gitignore`, `.dockerignore` | SA rev 2 | infra bundle 2 | S2-1…3 |
| [x] | BE-CP-010 | done (2026-10-16) | backend | Unit tests in `test/company-profile/` of partner (UT-CP-P01…P58, 76 pass) and gateway (UT-CP-G01…G56, 49 pass) | `backend-api-{partner,gateway}/test/**`, `vitest.config.mts`, `package.json`, `tsconfig.json` | owner request | pass | [SA testing](../../apps/backend/partner/company-profile/testing.md) |
| [x] | BE-CP-008 | done: frontend integrated in the same session | backend → frontend | Handoff of the verified contract; frontend FE-CP-007 (JSON value), FE-CP-009, FE-CP-010 (`canEdit = access.edit`) | — | BE-CP-007 | — | — |

## Approval and revisions

| Revision | Date | Change | Affected IDs | Approval |
|---|---|---|---|---|
| SA 3 | 2026-10-17 | Draft: Road/Street, plain-text Bank Details, Terms removed, rich-text + Tiptap removed (SA-CP-12…18) | BE-CP-011…014, FE-CP-016 | **pending** — owner states "อนุมัติ company-profile SA revision 3" |
| 3 | 2026-10-17 | Owner redesign S7–S9 (R3-01…09) | FE-CP-013…017 | owner 2026-10-17, see rev3-approval-evidence |
| SA 2 | 2026-10-16 | SA revision 1 approved with the owner's change: logo as a file in the partner folder, overwritten on upload (SA-CP-05) | BE-CP-001, 004, 009 | owner 2026-10-16 ≈12:00 +07:00: "บันทึกลงใน folder ใน backend เลยเมื่ออัพรูปใหม่ไปจะไปทับรูปเก่า  logic นี้ แค่ module company profile เท่านั้น  อนุมัติ company-profile SA revision 1" |
| 2 | 2026-10-16 | Owner answers with approval: libphonenumber-js for Phone (DEP-CP-02, package choice), logo 10 MB, grey = read-only / white + trash = edit, Print/Excel disabled. Approved together | FE-CP-004, 006, 007; DEP-CP-01/02 | owner, 2026-10-16 ≈11:00 +07:00: "Phone ให้ลง lib ที่นายแนะนำเลยเอาที่เขาใช้กันทั่วไป 10 MB โลโก้พื้นเทาคือโหมดอ่านอย่างเดียว ส่วนพื้นขาวที่มีปุ่มถังขยะคือโหมดแก้ไข ปุ่ม Print และ Excel ปิดไว้ก่อน / อนุมัติ company-profile revision 1" |
| 1 | 2026-10-16 | Created from S1–S6 (ui-spec run inline by the parent) | FE-CP-001…012 | none |

To approve, the owner states approval of `company-profile` UI revision 1, optionally answering Q-CP-01…12 and choosing for DEP-CP-01 (Tiptap) or the Markdown alternative. UI approval releases the independent items and the SA request. It does not approve the SA bundle.

## Handoffs, evidence, and completion

- SA: [company-profile-sa.md](../../coordination/handoffs/company-profile-sa.md) (ready since UI approval on 2026-10-16; **SA documents not written yet**).
- Check results, the manual-tester report and the completion report are linked here when they exist.

## Corrective work

None open. Use [bounded remediation](../../workflow/remediation.md) (default 3 passes, initial fix included) for defects.
