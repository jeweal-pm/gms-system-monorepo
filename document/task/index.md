# Feature task registry

| Feature ID | UI revision | Central TODO | Frontend TODO | Status | Backend bundle | Updated at |
|---|---|---|---|---|---|---|
| `app-navigation` | 3 | [app-navigation](todo/app-navigation.md) | [app-navigation](todo/app-navigation.md) | approved / in-progress | none required (deferred, not-dispatched [SA handoff](../coordination/handoffs/app-navigation-sa.md) for badges/menu permissions); no infra change | 2026-10-15 14:30 +07:00 |
| `vendor` | 4 | [vendor](todo/vendor.md) | [vendor](todo/vendor.md) | implemented (rev 4 draft row + address card, frontend-only; ADR-0021 rev 3; pending browser/manual test, frontend test runner and rev 4 security reviews) | SA rev 2 + [ADR-0021](../adr/0021-partner-code-running-number-and-record-modes.md) approved 2026-10-16 ([handoff](../coordination/handoffs/partner-code-adr0021-backend.md)); security reviews advisory pass; no infra change | 2026-10-16 +07:00 |
| `customer` | 3 | [customer](todo/customer.md) | [customer](todo/customer.md) | implemented (rev 3 draft row + address card, frontend-only; ADR-0021 rev 2; pending browser/manual test, frontend test runner and rev 3 security reviews) | SA rev 2 + [ADR-0021](../adr/0021-partner-code-running-number-and-record-modes.md) approved 2026-10-16 ([handoff](../coordination/handoffs/partner-code-adr0021-backend.md)); security reviews advisory pass; no infra change | 2026-10-16 +07:00 |
| `user-permission` | 2 | [user-permission](todo/user-permission.md) | [user-permission](todo/user-permission.md) | implemented (pending browser/manual test) | SA rev 2 ([auth/user-permission](../apps/backend/auth/user-permission/)) + [ADR-0020](../adr/0020-username-login-and-permission-matrix-v2.md) approved 2026-10-15; backend + frontend done ([handoff](../coordination/handoffs/user-permission-v2-backend.md)) | 2026-10-15 18:00 +07:00 |
| `remove-forgot-password-email` | none (removal only) | [remove-forgot-password-email](todo/remove-forgot-password-email.md) | none | done | none ([ADR-0015](../adr/0015-remove-forgot-password-and-email.md)) | 2026-10-12 10:05 +07:00 |
| `auth-license` | none (backend-only) | [auth-license](todo/auth-license.md) | none | done | [auth license integration](../apps/backend/auth/license-integration/) | 2026-10-11 23:44 +07:00 |

Keep one current row per feature; all actionable TODOs live under [todo/](todo/).
Record older revisions in each TODO's revision history. The latest selected frontend feature is in
[frontend-latest.md](frontend-latest.md). Existing completed work remains in [done/](done/).

Audit findings use a separate [investigation queue](investigation/README.md); they are
reviewed before explicitly selected frontend/backend fixes and do not select a UI TODO.
