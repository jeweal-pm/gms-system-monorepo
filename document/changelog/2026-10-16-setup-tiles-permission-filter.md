# 2026-10-16 Setup tiles and permission section filter

Owner instruction with images 19–22: new Setup tiles; in User and Permission the table header must stick without a gap, and the "All Permissions" dropdown must list the sections (not Turned on / Turned off) without a green border on click.

- Setup landing: tiles Company Profile, User and Permission (`#0E9888`), Notifications (`#E5484D`), Master Code, **Document Setup** (`#0D80EA`, placeholder `/modules/document-setup`, breadcrumbs Home › Setup › Document Setup) and **Stone Factory** (faded in the design → shown as not available yet, not clickable). Row gap 64 px. New tokens `gms-tile-red/blue/stone`; `gms-tile-green` updated to the new teal.
- Permissions table: header cells `sticky -top-6` (cancels the scroll area's 24 px top padding), so the header sits flush under the topbar.
- Permissions filter: native select replaced by `SectionFilter` listbox: "All Permissions" + every top-level menu (Dashboard, Setup, Pre-Sale, Memo, …), check mark on the selected entry, keyboard support; focus ring only for keyboard focus. `filterCatalog(nodes, query, section)` replaces the on/off filter.
- Tests: `frontend/test/user-permission/permission-utils.test.ts` (UT-UP-F01…F06), `frontend/test/setup/setup-destinations.test.ts` (UT-NAV-F01…F03); frontend suite 49 pass; typecheck pass; lint 0 errors. Browser check not run (no test session).
