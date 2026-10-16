# Feature task registry

| Feature ID | UI revision | Central TODO | Frontend TODO | Status | Backend bundle | Updated at |
|---|---|---|---|---|---|---|
| `vendor` | 2 | [vendor](todo/vendor.md) | [vendor](todo/vendor.md) | in-progress (UI approved) | SA rev 1 + [ADR-0019](../adr/0019-vendor-master.md) approved 2026-10-15; backend in progress ([SA handoff](../coordination/handoffs/vendor-sa.md)); no infra change expected | 2026-10-15 09:00 +07:00 |
| `customer` | 1 | [customer](todo/customer.md) | [customer](todo/customer.md) | in-progress | SA rev 1 approved ([partner/customer](../apps/backend/partner/customer/)); infra [backend-api-partner/1](../infra/services/backend-api-partner/1/security.md) approved; [ADR-0018](../adr/0018-customer-master-partner-service.md) Accepted | 2026-10-14 11:45 +07:00 |
| `user-permission` | 2 | [user-permission](todo/user-permission.md) | [user-permission](todo/user-permission.md) | implemented (pending browser/manual test) | SA rev 2 ([auth/user-permission](../apps/backend/auth/user-permission/)) + [ADR-0020](../adr/0020-username-login-and-permission-matrix-v2.md) approved 2026-10-15; backend + frontend done ([handoff](../coordination/handoffs/user-permission-v2-backend.md)) | 2026-10-15 18:00 +07:00 |
| `remove-forgot-password-email` | none (removal only) | [remove-forgot-password-email](todo/remove-forgot-password-email.md) | none | done | none ([ADR-0015](../adr/0015-remove-forgot-password-and-email.md)) | 2026-10-12 10:05 +07:00 |
| `auth-license` | none (backend-only) | [auth-license](todo/auth-license.md) | none | done | [auth license integration](../apps/backend/auth/license-integration/) | 2026-10-11 23:44 +07:00 |

Keep one current row per feature; all actionable TODOs live under [todo/](todo/).
Record older revisions in each TODO's revision history. The latest selected frontend feature is in
[frontend-latest.md](frontend-latest.md). Existing completed work remains in [done/](done/).

Audit findings use a separate [investigation queue](investigation/README.md); they are
reviewed before explicitly selected frontend/backend fixes and do not select a UI TODO.
