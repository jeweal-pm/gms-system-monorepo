# Authorization: <service> / <feature>

- Source UI revision / SA revision: <revision> / <revision>
- Domain rules / API contract: <links>

| Operation / resource | Authentication | Allowed roles / ownership | Backend enforcement | Denied outcome | TODO / test IDs |
|---|---|---|---|---|---|

Define actual service-side checks and record the source for permission/business rules.
For auth features, map session, generated password, lockout, reset/change password, and CRM
provisioning rules to accepted ADRs where relevant. For another domain, replace these examples.
Frontend visibility is UX; backend enforces access and object ownership.
Do not guess role rules from a screenshot; unresolved permissions need a documented decision.
Record session/token forwarding and trust boundaries without secrets or real personal data.
