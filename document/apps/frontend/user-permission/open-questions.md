# Open questions and conflicts: user-permission

- Feature ID / UI revision: `user-permission` / 1 and 2 (revision 2 questions at the end)
- Status: pending-review (answers not recorded)
- Source: [five supplied screenshots](source/) (see [ui-spec.md](ui-spec.md#source-and-evidence))
- Central TODO: [user-permission.md](../../../task/todo/user-permission.md)

These questions come from inspecting the screenshots and comparing them with accepted ADRs, specs
and code. Questions marked **blocking** change flow, data, or contracts. The TODO items they block
stay `blocked` until the owner answers. An answer that changes flow, source, API, or schema
creates UI revision 2 and requires a new review of the affected items.

## Conflicts with accepted decisions (for owner + SA)

| ID | Conflict | Evidence | Affected TODO IDs |
|---|---|---|---|
| C-01 | **Users are created only by CRM today.** In-app "Create User" is a new creation path. | [ADR-0015 §1](../../../adr/0015-remove-forgot-password-and-email.md), [Login requirements BR-01](../../../spec/0002-login-requirements.md), `POST /api/v1/users` (CRM API key) in `backend-api-auth/src/auth/auth.controller.ts` | FE-UP-012 |
| C-02 | **Each account requires an issued license before it is created.** It is not known whether in-app creation must run the same license preflight (`pending` or `active` for that email and instance). | [ADR-0013](../../../adr/0013-per-user-license-with-signed-token.md), [license spec AC-L12](../../../spec/0006-license.md), BE-LIC-007 | FE-UP-012 |
| C-03 | **The user limit is "0 of 3 users added. Super Admin is not counted."** ADR-0013 sells one license per user and requires a license for every account, *including* Super Admin. No seat or quota concept exists in the license-server contract. Only `GET /v1/licenses` (a list of the instance's licenses) could supply a count. | Screenshot 1 drawer text; [ADR-0013](../../../adr/0013-per-user-license-with-signed-token.md) "Every account, including Super Admin, must hold a license"; [license-server API §2.4](../../../spec/0005-license-server-api.md); license spec QL5 | FE-UP-007, FE-UP-012 |
| C-04 | **An admin-set password is a new password channel.** ADR-0015 lists "Admin sets/resets passwords through an admin page" as a rejected alternative that needs a separate ADR. tech-stack.md also lists an admin password-reset tool as a pending decision. | [ADR-0015 Alternatives](../../../adr/0015-remove-forgot-password-and-email.md), [tech-stack.md pre-production list](../../../adr/tech-stack.md) | FE-UP-005, FE-UP-012 |
| C-05 | **Username versus email.** Login uses email and password, and a licensed account's email is immutable (QL2, BE-LIC-008). The "Username" field reads "Used to sign in" and is filled with an email-shaped value (`User_001@example.com`). Editing it on an existing user would violate QL2 if it is the email. | Screenshot 3; [license spec QL2](../../../spec/0006-license.md); [authorization](../../backend/auth/license-integration/authorization.md) | FE-UP-004, FE-UP-005 |
| C-06 | **Deleting a user while license policy is open.** What happens to the remaining license time after a delete (QL1) is still undecided. | Screenshot 4; license spec QL1 | FE-UP-009 |
| C-07 | **There is no role/permission model.** `auth.User.role` is a single string (default `user`). The gateway checks only the session and license, and `license.view` role mapping is still pending. A menu-by-action permission matrix needs a new schema and new authorization enforcement. | `backend-api-auth/prisma/schema.prisma`; `backend-api-gateway/src/trpc/router.ts` | FE-UP-006, FE-UP-012, FE-UP-014 |
| C-08 | **New profile fields.** Phone, location(s), photo and Active are not stored anywhere. The photo needs file storage, a new runtime resource that may need infra review. | Prisma `User` model; screenshot 1 | FE-UP-004, FE-UP-012, FE-UP-013 |
| C-09 | **No conflict on password minimum.** The "Must be at least 4 characters" hint matches [Password Policy §1](../../../spec/0003-password-policy.md) and `backend-api-auth/src/auth/password-policy.ts` (`min(4)`, `max(64)`). ADR-0010 (system-generated passwords) is superseded by ADR-0015, so it no longer applies. **Gap:** the screenshots never show the 64-character maximum, but the UI must enforce it with the existing message. | password-policy.ts; spec 0003 | FE-UP-005 |

## Questions for the owner

| ID | Blocking? | Question | Observed evidence | TODO IDs |
|---|---|---|---|---|
| Q-UP-01 | blocking | Which fields are required? Password and Phone No. have no `*` (screenshot 1), but both show "is required" errors after submit (screenshot 2). Should the asterisks be added, or the errors removed? When editing an existing user, is Password optional, with blank meaning "keep current"? | Screenshots 1–2 | FE-UP-004, FE-UP-005 |
| Q-UP-02 | blocking | What is "0 of 53 on"? The badge stays at 0 even when VIEW/ADD/EDIT Select All are indeterminate (screenshot 3) and after every permission is copied (screenshot 5). Should it update live? What is 53 counting? It is not a multiple of the 6 action columns, which suggests some menu/action cells do not apply. | Screenshots 1, 3, 5 | FE-UP-006 |
| Q-UP-03 | blocking | The Duplicate toast says "department and permissions are copied", but no Department field exists. Should "department" be removed from the copy, or is a Department field missing? Does Location count as "department"? | Screenshot 5 | FE-UP-008 |
| Q-UP-04 | blocking | After Duplicate, the matrix shows grey checkmarks without checkbox borders. Are copied permissions read-only, or should they appear as normal checked, editable boxes? Are Super Admin's permissions always "all" and locked? | Screenshot 5 (check glyph sampled `#A9A9A9`, no box) | FE-UP-006, FE-UP-008 |
| Q-UP-05 | blocking | Where does the limit of 3 come from (licenses issued to the instance, deployment config, or a product plan)? Do inactive users count? What happens at the limit: is Create User disabled, does a message appear, or does the server reject it? See C-03. | Screenshot 1 | FE-UP-007, FE-UP-012 |
| Q-UP-06 | blocking | Does in-app creation replace CRM creation or run alongside it? Must the email already have an issued license (C-01, C-02)? If not, what does the admin see? | ADR-0015, AC-L12 | FE-UP-012 |
| Q-UP-07 | blocking | Approve an admin-set initial password and later password changes on this page (C-04)? If a password changes, are the user's sessions revoked? Should the field have a show/hide toggle (the design-system PasswordField has one; the screenshot does not)? | Screenshots 1–3 | FE-UP-004, FE-UP-005, FE-UP-012 |
| Q-UP-08 | blocking | Is "Username" the sign-in email? If so, it must be read-only on existing licensed users (C-05). What are the format, uniqueness and case rules? | Screenshot 3 | FE-UP-004, FE-UP-005 |
| Q-UP-09 | blocking | Phone: which countries appear in the country-code selector, which country is the default (screenshot shows US +1), and how strict is validation (per-country rules or length only)? Is the number stored as E.164? | Screenshots 1–3 | FE-UP-004, DEP-UP-01/02 |
| Q-UP-10 | blocking | Location: where do the options come from (Setup › Main Location / Sub Location)? What is "primary" (is it a default preselected value)? Can one user have several locations? Does location restrict which data the user can access? | Screenshot 1 | FE-UP-004, FE-UP-012 |
| Q-UP-11 | blocking | Photo: maximum file size, minimum and maximum dimensions, cropping, removal, and where it is shown (header avatar?). Storage location (needs SA/infra). | Screenshot 1 ("JPEG or PNG only") | FE-UP-004, FE-UP-013 |
| Q-UP-12 | blocking | What does Active = off do: block sign-in, revoke sessions, free a seat from the limit, affect the license? | Screenshot 1 | FE-UP-004, FE-UP-012 |
| Q-UP-13 | blocking | Permission catalog: please supply the full list of menus/sub-menus and the actions each one supports. Observed mismatches: the sidebar has **Sale** but the matrix does not show it between Reserve and Partner Master; the matrix says "Stone Master **8** sub-menus" but the sidebar lists **9** (including Stone Code). What do **CANCEL** and **Price** (for example, "can see prices") mean? Are there implied rules, such as ADD/EDIT/DELETE also turning on VIEW? | Screenshots 1–3 | FE-UP-006, FE-UP-012 |
| Q-UP-14 | blocking | Edit mode is not shown. When an existing user is selected in the drawer, what are the page title and primary button text (for example "Save")? Which fields can be edited? Can Super Admin be edited? | None (missing screen) | FE-UP-004, FE-UP-007, FE-UP-012 |
| Q-UP-15 | blocking | Delete: where is the trigger (toolbar, drawer item menu, form footer)? Can Super Admin or the signed-in user be deleted? What feedback appears after a successful or failed delete? See also C-06. | Screenshot 4 (dialog only) | FE-UP-009 |
| Q-UP-16 | blocking | Toolbar: what does **Print** print (this user's form, or the list)? Which data and columns does **Excel export** produce? Does **Refresh** reload the list or discard edits? Is **Duplicate** enabled only when a saved user is selected? It looks disabled in every screenshot, yet screenshot 5 shows a completed duplicate. | Screenshots 1–5 | FE-UP-003, FE-UP-008 |
| Q-UP-17 | non-blocking | The drawer count badge reads "3" in screenshot 1 but "0 / 3" in screenshot 5. Under the new draft item, screenshot 1 shows `superadmin@example.com` while screenshot 5 shows "Not saved yet". Which one is correct? (Proposal: "0 / 3" and "Not saved yet".) | Screenshots 1, 5 | FE-UP-007 |
| Q-UP-18 | non-blocking | Is "User list 1" next to the page title real UI text, or a leftover design frame name? | Screenshots 1–3, 5 | FE-UP-003 |
| Q-UP-19 | non-blocking | Unsaved changes: if the admin switches drawer items, changes tabs, refreshes or leaves with a dirty form, should the page warn first? Is a draft kept anywhere? (Proposal: confirm before discarding; do not persist drafts.) | None | FE-UP-015 |
| Q-UP-20 | blocking | Who can open this page: Super Admin only, or anyone with a permission? Is the saved matrix enforced on every menu/API now, or only stored for later? | None | FE-UP-014, FE-UP-012 |
| Q-UP-21 | blocking | The app shell differs from the current `AppShell`: the sidebar is wider (~235 vs 187 CSS px) and uses different groups ("Sales Process" vs "Main Menu", top-level Setup, Stone Code). The header has a fullscreen icon and different date text and no Settings/help links, and there is a Setup tab bar. Should this feature restyle the global shell, or keep the current shell and add only the Setup tabs? | Screenshot 1 vs `frontend/src/features/home/app-shell.tsx` | FE-UP-002, FE-UP-017 |
| Q-UP-22 | non-blocking | The screenshot marks required fields with `*`, but the project design-system template marks optional fields "(ไม่บังคับ)". Should this page follow the screenshot? (Proposal: follow the screenshot.) | Screenshot 1; [design-system template §7](../template/design-system-template.md) | FE-UP-004 |
| Q-UP-23 | non-blocking | Only a 1920-wide desktop is supplied. Accept the proposed tablet/mobile behavior in [ui-spec.md](ui-spec.md#responsive-behavior-proposal-not-in-source)? | None | FE-UP-016 |
| Q-UP-24 | non-blocking | The toast appears top-center, while the template uses bottom-right. How long until it dismisses itself? (Proposal: top-center as shown, 5 s, with a close button.) | Screenshot 5 | FE-UP-010 |
| Q-UP-25 | non-blocking | Is all copy on this page English, as shown, even though existing auth/license messages are Thai? | Screenshots | FE-UP-004..010 |
| Q-UP-26 | non-blocking | Screenshot 3 shows a light grey band behind the title row (`#F3F3F5`). Is it a hover state or an artifact? The header "Price" is not uppercase while the other column headers are. Is that intentional? | Screenshot 3; screenshot 1 | FE-UP-003, FE-UP-006 |
| Q-UP-27 | non-blocking | The sampled primary color is `#006A70`, while the existing `--gms-teal` is `#006c68`. The sampled font looks like IBM Plex Sans, while the app body uses Arial. Should the design tokens be adopted globally? (Proposal: add tokens; global font change only if Q-UP-21 approves a shell restyle.) | Pixel sampling; `frontend/src/app/globals.css` | FE-UP-011 |
| Q-UP-28 | non-blocking | The "Draft" badge text (sampled `~#FFAB00` on `#FFE7B8`) is below the 4.5:1 contrast requirement. Is a darker amber text color acceptable? | Pixel sampling | FE-UP-007 |

## Revision 2 (ADR-0020) questions

Raised 2026-10-15 while implementing UI revision 2. None blocks the approved scope; the stated
default is implemented until the owner answers. Answers that change flow or contracts create a
new revision.

| ID | Kind | Question | Default implemented | Evidence | Affected TODO IDs |
|---|---|---|---|---|---|
| Q-UP2-01 | non-blocking | Which options does the "All Permissions" filter offer? | All Permissions / Turned on (menu has any permission on) / Turned off (menu has none on) | rev2-02 shows only the closed control | FE-UP2-003 |
| Q-UP2-02 | non-blocking | What does Print output for this page? | Browser print of the open saved user (view mode only); drawer, header and drawer toggle hidden. No dedicated print layout | ADR-0020 §4 says Print follows `user-and-permission:PRINT`; no print design supplied | FE-UP2-001 |
| Q-UP2-03 | non-blocking | Is the drawer badge "Users 3" the seat limit or the number of users? | Seat limit (`usage.limit`): rev2-02/03 show 3 with one listed user and "0 of 3 users added". "User List N" in the title is the number of saved users (1 in both images) | rev2-02, rev2-03 | FE-UP2-006 |
| Q-UP2-04 | non-blocking | Password is required on create (ADR-0020 §4) but has no asterisk in rev2-02. Add one in create mode? | Asterisk shown only on create, where the field is required (deviation from rev2-02 for an accurate required marker); none in edit/view | rev2-02, ADR-0020 §4 | FE-UP2-004 |
| Q-UP2-05 | cross-scope | The avatar menu (`features/home/account-menu.tsx`, frontend-home scope) shows `session.user.email`, which becomes the internal `<id>@users.invalid` after the migration. Show `session.user.username` instead? | Resolved 2026-10-15: the parent assigned it with backend deviation 6; the menu now shows `username` (FE-UP2-010) | ADR-0020 §1 ("ไม่แสดงในหน้าจอ") | FE-UP2-010 |
| Q-UP2-06 | non-blocking | In rev2-01 the "Memo" heading is indented further than other section headings. Intentional? | Same indent as other sections; label rendered as delivered ("Memo") | rev2-01 | FE-UP2-003 |
