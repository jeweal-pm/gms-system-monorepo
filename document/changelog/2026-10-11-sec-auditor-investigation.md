# Sec Auditor and review queue

Added project-local `sec-auditor` from a pinned Cloudflare security-audit-skill revision.
All actionable security/privacy audit findings first enter `document/task/investigation/`.
The owner selects specific ticket revisions for later frontend/backend fixes; changed
architecture retains separate SA approval. Raw full-run reports are ignored; sanitized
review tickets remain trackable. No application package/service was added.

See [completion and checks](../task/done/2026-10-11-sec-auditor-cloudflare-integration.md).
