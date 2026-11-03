# Authorization: master / decimal-setup (SA revision 1, pending-review)

## Catalog change (auth, BE-DEC-004)

- Add `leaf("decimal-setup", "Decimal Setup", ["VIEW", "EDIT"])` under section SETUP directly after `document-setup` in
  `backend-api-auth/src/permission/catalog.ts`. Leaves 41 → **42**, applicable cells 358 → **360**
  (5 + 2 + 2 + 39 × 9). Update the header comment and `UT-CAT-01`.
- The User and Permission screen renders the new row automatically from `permission.catalog`; its counter reads
  `applicableCount` from the server (no frontend constant found). Existing user grants are unchanged; no grant is copied from
  `document-setup` (Q-DEC-14). Super admin passes every check (ADR-0017).
- Master: `MasterMenu` gains `"decimal-setup"`.

## Procedure rules (master, ADR-0031 boundary)

| Procedure | Rule | Why |
|---|---|---|
| `decimalSetup.get` | New middleware `signedIn()` → `requireMasterSession(ctx)`: principal with userId + sessionId, `authorization === "CURRENT"`, license `ELIGIBLE`; **no grant check**, no CSRF (query) | Every page formats numbers; returns two non-sensitive integers. Users without any document grant would otherwise see different numbers (Q-DEC-13). |
| `decimalSetup.save` | `permitted("decimal-setup", "EDIT", true)` (grant + CSRF) | Changes a company-wide setting. |

`requireMasterSession` is `requireMasterGrant` without the grant step (same error order: `UNAUTHENTICATED`,
`AUTHORIZATION_UNAVAILABLE`, `LICENSE_REQUIRED`). It is used only by `decimalSetup.get`; adding it elsewhere needs SA review.

## Frontend gates (FE-DEC-103)

- Setup tile "Decimal Setup" and the page: `decimal-setup:VIEW` (replaces the temporary `document-setup` gate, Q-DEC-05).
- Edit / Save buttons: `decimal-setup:EDIT`. The server re-checks on every save.
- `navigation.ts`: add `decimal-setup` to `SETUP_MENU_KEYS` (Setup is visible when any Setup leaf is).
- The global provider calls `get` for every signed-in user regardless of grants.
