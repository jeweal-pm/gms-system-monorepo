# 2026-10-17 Menu visibility by VIEW and disabled action buttons

Owner instruction: menus without VIEW are hidden entirely. With VIEW but no other permission, buttons stay visible but disabled. A VIEW-only user lands on the Add page with everything disabled.

- Uses the existing `permission.mine` contract. No API change.
- `frontend/src/features/home/navigation.ts`: `NavLink.permission` holds catalog keys. Nav ids that differ from catalog keys are aliased (`barcode-printing` → `barcode`, `os-payable` → `outstanding-payable`, `certificate-master` → `certificate-type`, and so on).
  - Setup is gated by any Setup leaf (`SETUP_MENU_KEYS`).
  - Added `canViewWith`, `visibleSections`, `visibleRailModules`, `visibleContextGroups` and `menuKeyFor`.
  - Super Admin and `"ALL"` see everything. Items with no catalog key (Home, Approve, unbuilt placeholders) are always shown.
- `frontend/src/features/home/use-menu-access.ts` (new): wraps the shared `permission.mine` query. Gated items stay hidden while it is loading or on error; pages still enforce access themselves.
- Sidebar, rail, context panel, Setup landing tiles and the Master Code dialog are all filtered. Partner Master opens Customer when only Customer has VIEW.
- Vendor and Customer pages:
  - Create, Edit, Delete, Duplicate and Print are always rendered and disabled without ADD, EDIT, DELETE, ADD and PRINT respectively.
  - `PartnerAccess` gains `print`.
  - With nothing selected and no ADD, the page shows the read-only "Add {Entity}" form instead of the empty-selection message.
- Not yet: opening User and Permission to non-Super-Admin users needs backend changes. The proposal is in `document/apps/backend/auth/user-permission/delegated-admin.md` (DA-01…07) and awaits owner approval. Until then that page and its API remain Super Admin only.
- Checks:
  - Unit tests UT-MENU-01…07 in `frontend/test/home/menu-access.test.ts`; partner page-logic tests updated. The frontend suite passes (246).
  - Typecheck passes; lint has 0 errors.
  - After a container restart, `/setup`, `/setup/vendor`, `/setup/customer`, `/setup/company-profile` and `/setup/user-permission` return 200.
  - Browser check with a restricted user not run.
