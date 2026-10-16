# Open questions: company-profile

- UI revision: 2 (approved 2026-10-16). Owner answers (2026-10-16): Q-CP-02 yes + libphonenumber-js (DEP-CP-02); Q-CP-03 confirmed; Q-CP-04 **10 MB**; Q-CP-07 confirmed (disabled); Q-CP-05 not answered → Tiptap (stated default). All other questions use their defaults.
- None of these blocks the review. Each has a default that the spec uses unless the owner answers otherwise. An answer that changes a route, the flow, the data or a package creates revision 2.

| ID | Question | Default used in revision 1 | Affects |
|---|---|---|---|
| Q-CP-01 | The Company Currency field is labelled "Contact Person Name \*" in the design. Is that a copy mistake? | Yes: label it "Currency \*", select from the currency list (DV-01) | FE-CP-005 |
| Q-CP-02 | Phone No. is drawn as a plain field. Use the same country-code `PhoneField` as Vendor and Customer? | Yes, reuse `PhoneField` (DV-02) | FE-CP-004 |
| Q-CP-03 | The uploaded logo appears on a dark-grey tile (S4/S6) and on a white tile with a trash button (S5). Is grey the read-only look, or the hover look in edit mode? | Grey = read-only (view mode); white + trash = edit mode | FE-CP-006 |
| Q-CP-04 | Logo limits: maximum file size and dimensions? | 2 MB, JPEG/PNG checked by file signature on the server; no resize in the browser (SA confirms) | FE-CP-006, SA |
| Q-CP-05 | Rich-text editor: add the Tiptap library (full toolbar as drawn), or use a Markdown textarea with a toolbar (no new package; output is Markdown text)? | Tiptap (DEP-CP-01, proposed). Needs owner approval of the package | FE-CP-007, DEP-CP-01 |
| Q-CP-06 | In view mode, should the editor toolbar be hidden or shown disabled? | Shown disabled, so the layout does not jump between modes | FE-CP-007 |
| Q-CP-07 | What should Print and Excel produce for a single company record? | Disabled with "Not available yet" until defined (DV-03) | FE-CP-003 |
| Q-CP-08 | Should the header (title and buttons) stay fixed while the sections scroll? | Yes, sticky at the top of the content area | FE-CP-002 |
| Q-CP-09 | Are Tax ID or Postcode format rules needed (e.g. 13-digit Thai tax ID)? | No format rule; length limits only (SA sets the limits) | FE-CP-004/005, SA |
| Q-CP-10 | Who may edit: only Super Admin, or anyone granted the `company-profile` edit permission? | Permission catalog (`company-profile` leaf); Super Admin has every permission | FE-CP-010, SA |
| Q-CP-11 | Is there exactly one company profile per installation (licence instance)? | Yes, a single record | SA |
| Q-CP-12 | Should the topbar or sidebar show the uploaded logo instead of the GMS logo? | No (not in the source) | — |
